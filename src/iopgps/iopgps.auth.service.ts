// src/iopgps/iopgps.auth.service.ts
import { Injectable, Logger, Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import * as crypto from 'crypto';
import { IOPGPS_CONSTANTS, CACHE_TTL } from './iopgps.constants';
import {
  IopgpsAuthResponse,
  TokenInfo,
} from './interfaces/responses.interface';

// Strongly typed interfaces untuk error handling
interface IopgpsErrorResponse {
  code: number;
  result: string;
  message?: string;
}

interface AuthRequestData {
  appid: string;
  time: number;
  signature: string;
}

// Custom interface untuk HTTP error
interface HttpClientError {
  response?: {
    status?: number;
    statusText?: string;
    data?: unknown;
  };
  message: string;
  code?: string;
  config?: unknown;
}

// Type-safe debug response
interface DebugAuthResponse {
  configuration: {
    appid: string;
    secretKey: string;
    isValid: boolean;
    missing: string[];
  };
  authRequest: {
    time: number;
    signature: string;
    url: string;
    expectedBody: {
      appid: string;
      time: number;
      signature: string;
    };
  };
  cache: {
    hasToken: boolean;
    tokenPreview: string;
    tokenLength: number;
  };
  rateLimit: {
    lastAuthCall: number;
    timeSinceLastCall: string;
    canMakeCall: boolean;
    refreshInProgress: boolean;
    pendingPromise: boolean;
  };
  constants: {
    baseUrl: string;
    authEndpoint: string;
    timeout: number;
  };
  error?: string;
}

@Injectable()
export class IopgpsAuthService {
  private readonly logger = new Logger(IopgpsAuthService.name);
  private readonly appid: string;
  private readonly secretKey: string;
  private tokenRefreshInProgress = false;
  private lastAuthCall = 0;
  private pendingTokenPromise: Promise<string> | null = null;

  constructor(
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.appid = this.configService.get<string>('IOPGPS_APPID') || '';
    this.secretKey = this.configService.get<string>('IOPGPS_SECRET_KEY') || '';

    if (!this.appid || !this.secretKey) {
      this.logger.warn(
        'IOPGPS_APPID or IOPGPS_SECRET_KEY not found in environment variables',
      );
    } else {
      this.logger.debug('IOPGPS credentials loaded successfully');
    }
  }

  /**
   * Generate signature sesuai algoritma IOPGPS
   */
  private generateSignature(time: number): string {
    if (!this.secretKey) {
      throw new Error('IOPGPS_SECRET_KEY is not configured');
    }

    const firstHash = crypto
      .createHash('md5')
      .update(this.secretKey)
      .digest('hex');
    return crypto
      .createHash('md5')
      .update(firstHash + time)
      .digest('hex');
  }

  /**
   * Check rate limit untuk auth API (max 2x per minute) dengan improvement
   */
  private checkRateLimit(): void {
    const now = Date.now();
    const timeSinceLastCall = now - this.lastAuthCall;

    // Limit 2x per menit = minimal 30 detik antara calls
    // Beri toleransi 25 detik untuk menghindari race condition
    if (timeSinceLastCall < 25000) {
      const remainingSeconds = Math.ceil((30000 - timeSinceLastCall) / 1000);
      this.logger.warn(
        `Auth rate limit: Please wait ${remainingSeconds}s before next auth call`,
      );
      throw new Error(
        `Rate limit exceeded: Max 2 auth calls per minute. Please wait ${remainingSeconds} seconds.`,
      );
    }

    this.lastAuthCall = now;
  }

  /**
   * Type guard untuk HTTP client error
   */
  private isHttpClientError(error: unknown): error is HttpClientError {
    return (
      typeof error === 'object' &&
      error !== null &&
      'message' in error &&
      typeof (error as HttpClientError).message === 'string'
    );
  }

  /**
   * Type guard untuk IOPGPS error response
   */
  private isIopgpsErrorResponse(data: unknown): data is IopgpsErrorResponse {
    const errorResponse = data as IopgpsErrorResponse;
    return (
      typeof data === 'object' &&
      data !== null &&
      'code' in errorResponse &&
      'result' in errorResponse &&
      typeof errorResponse.code === 'number' &&
      typeof errorResponse.result === 'string'
    );
  }

  /**
   * Extract error message safely dengan type checking
   */
  private getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }
    if (typeof error === 'string') {
      return error;
    }

    // Handle HTTP client errors
    if (this.isHttpClientError(error)) {
      const errorData = error.response?.data;

      if (errorData && this.isIopgpsErrorResponse(errorData)) {
        return `HTTP ${error.response?.status || 'Unknown'}: ${errorData.result}`;
      }

      if (errorData && typeof errorData === 'object' && 'result' in errorData) {
        const resultValue = errorData.result;
        // ✅ FIX: Safe string conversion
        const resultString =
          typeof resultValue === 'string'
            ? resultValue
            : JSON.stringify(resultValue);
        return `HTTP ${error.response?.status || 'Unknown'}: ${resultString}`;
      }

      return `HTTP ${error.response?.status || 'Unknown'}: ${error.message}`;
    }

    return 'Unknown error occurred';
  }

  /**
   * Type guard untuk IOPGPS auth response
   */
  private isIopgpsAuthResponse(data: unknown): data is IopgpsAuthResponse {
    const response = data as IopgpsAuthResponse;
    return (
      typeof data === 'object' &&
      data !== null &&
      'code' in response &&
      typeof response.code === 'number'
    );
  }

  /**
   * Validasi response structure
   */
  private validateAuthResponse(data: unknown): data is IopgpsAuthResponse {
    if (!this.isIopgpsAuthResponse(data)) {
      return false;
    }

    if (data.code === 0) {
      return (
        typeof data.accessToken === 'string' && data.accessToken.length > 0
      );
    }

    return true; // Error responses are still valid
  }

  /**
   * Check if pending token promise exists - TYPE SAFE VERSION
   */
  private hasPendingTokenPromise(): boolean {
    return this.pendingTokenPromise !== null;
  }

  /**
   * Generate new access token dengan improved concurrency handling
   */
  private async generateNewAccessToken(): Promise<string> {
    // ✅ FIX: Use type-safe method to check pending promise
    if (this.hasPendingTokenPromise() && this.pendingTokenPromise) {
      this.logger.debug(
        'Token generation already in progress, reusing existing promise',
      );
      return this.pendingTokenPromise;
    }

    // Jika refresh sudah dalam progress, tunggu sampai selesai
    if (this.tokenRefreshInProgress) {
      this.logger.debug('Token refresh already in progress, waiting...');

      // Tunggu maksimal 10 detik
      for (let i = 0; i < 10; i++) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        const cachedToken = await this.cacheManager.get<string>(
          'iopgps_access_token',
        );
        if (cachedToken) {
          this.logger.debug('Token refresh completed by another process');
          return cachedToken;
        }
      }

      this.logger.warn(
        'Token refresh timeout after 10 seconds, proceeding with new request',
      );
    }

    this.tokenRefreshInProgress = true;

    // Create promise dan simpan reference-nya
    this.pendingTokenPromise = this.executeTokenGeneration();

    try {
      const result = await this.pendingTokenPromise;
      return result;
    } finally {
      // Clear pending promise setelah selesai
      this.pendingTokenPromise = null;
      this.tokenRefreshInProgress = false;
    }
  }

  /**
   * Execute actual token generation
   */
  private async executeTokenGeneration(): Promise<string> {
    try {
      // Check rate limit dengan improved error handling
      try {
        this.checkRateLimit();
      } catch (rateLimitError) {
        // Jika rate limit, coba gunakan cached token dulu
        const cachedToken = await this.cacheManager.get<string>(
          'iopgps_access_token',
        );
        if (cachedToken) {
          this.logger.warn('Rate limit hit, but using cached token');
          return cachedToken;
        }
        throw rateLimitError;
      }

      // Validasi configuration
      if (!this.appid || !this.secretKey) {
        throw new Error('IOPGPS credentials not configured properly');
      }

      const time = Math.floor(Date.now() / 1000);
      const signature = this.generateSignature(time);

      const authData: AuthRequestData = {
        appid: this.appid,
        time: time,
        signature: signature,
      };

      this.logger.log('🔄 Generating new IOPGPS access token...');

      // ✅ FIX: Type-safe HTTP request tanpa AxiosResponse import
      const response = await firstValueFrom(
        this.httpService.post<IopgpsAuthResponse>(
          `${IOPGPS_CONSTANTS.BASE_URL}${IOPGPS_CONSTANTS.AUTH_ENDPOINT}`,
          authData,
          {
            timeout: IOPGPS_CONSTANTS.TIMEOUT,
            headers: {
              'Content-Type': 'application/json',
            },
          },
        ),
      );

      const responseData = response.data;

      // Validasi response structure
      if (!this.validateAuthResponse(responseData)) {
        throw new Error('Invalid response format from IOPGPS API');
      }

      if (responseData.code === 0 && responseData.accessToken) {
        const accessToken = responseData.accessToken;

        // Hitung TTL yang aman
        const tokenTtl = responseData.expiresIn
          ? Math.min(responseData.expiresIn - 300, CACHE_TTL.ACCESS_TOKEN) // 5 menit sebelum expiry
          : CACHE_TTL.ACCESS_TOKEN;

        const tokenTtlSeconds = Math.floor(tokenTtl / 1000);

        await this.cacheManager.set(
          'iopgps_access_token',
          accessToken,
          tokenTtlSeconds,
        );

        this.logger.log(
          `✅ New access token generated (valid for ${Math.floor(tokenTtl / 1000 / 60)} minutes)`,
        );

        return accessToken;
      } else {
        const errorMessage =
          responseData.result ||
          responseData.message ||
          'Authentication failed without specific reason';

        this.logger.error(`❌ IOPGPS authentication failed: ${errorMessage}`);
        throw new Error(`IOPGPS authentication failed: ${errorMessage}`);
      }
    } catch (error: unknown) {
      const errorMessage = this.getErrorMessage(error);

      // Reset lastAuthCall jika bukan rate limit error
      if (!errorMessage.includes('Rate limit exceeded')) {
        this.lastAuthCall = 0;
      }

      this.logger.error('💥 Failed to generate access token', errorMessage);
      throw error;
    }
  }

  /**
   * Get access token dengan improved cache dan concurrency handling
   */
  async getAccessToken(): Promise<string> {
    try {
      // Cek cache dulu - priority pertama
      const cachedToken = await this.cacheManager.get<string>(
        'iopgps_access_token',
      );

      if (cachedToken) {
        this.logger.debug('Using cached access token');
        return cachedToken;
      }

      // Generate token baru dengan concurrency control
      this.logger.debug('No cached token found, generating new one...');
      return await this.generateNewAccessToken();
    } catch (error: unknown) {
      const errorMessage = this.getErrorMessage(error);

      // Jika rate limit, tunggu sebentar dan coba cache lagi
      if (errorMessage.includes('Rate limit exceeded')) {
        this.logger.warn(
          'Rate limit hit, waiting 10 seconds then checking cache again...',
        );
        await new Promise((resolve) => setTimeout(resolve, 10000));

        const cachedToken = await this.cacheManager.get<string>(
          'iopgps_access_token',
        );
        if (cachedToken) {
          this.logger.debug('Using cached token after rate limit wait');
          return cachedToken;
        }

        // Jika masih tidak ada cached token, throw error asli
        this.logger.error('No cached token available after rate limit wait');
      }

      this.logger.error('Failed to get access token', errorMessage);
      throw error;
    }
  }

  /**
   * Force refresh token (untuk manual refresh)
   */
  async refreshAccessToken(): Promise<string> {
    try {
      this.logger.debug('Manually refreshing access token');
      await this.cacheManager.del('iopgps_access_token');

      // Reset rate limit counter untuk manual refresh
      this.lastAuthCall = 0;

      return await this.generateNewAccessToken();
    } catch (error: unknown) {
      const errorMessage = this.getErrorMessage(error);
      this.logger.error('Failed to refresh access token', errorMessage);
      throw new Error(`Token refresh failed: ${errorMessage}`);
    }
  }

  /**
   * Check token validity
   */
  async isTokenValid(): Promise<boolean> {
    try {
      const token = await this.cacheManager.get<string>('iopgps_access_token');
      return !!token;
    } catch (error: unknown) {
      const errorMessage = this.getErrorMessage(error);
      this.logger.warn('Error checking token validity', errorMessage);
      return false;
    }
  }

  /**
   * Get token info untuk debugging
   */
  async getTokenInfo(): Promise<TokenInfo> {
    try {
      const token = await this.cacheManager.get<string>('iopgps_access_token');
      const now = Date.now();
      const timeSinceLastAuthCall = now - this.lastAuthCall;

      return {
        hasToken: !!token,
        refreshInProgress: this.tokenRefreshInProgress,
        appidConfigured: !!this.appid,
        secretKeyConfigured: !!this.secretKey,
        tokenPreview: token ? `${token.substring(0, 8)}...` : undefined,
        tokenLength: token ? token.length : 0,
        rateLimitInfo: {
          timeSinceLastCall: Math.floor(timeSinceLastAuthCall / 1000),
          canMakeAuthCall: timeSinceLastAuthCall >= 25000,
          pendingPromise: this.hasPendingTokenPromise(),
        },
      };
    } catch (error: unknown) {
      const errorMessage = this.getErrorMessage(error);
      this.logger.error('Failed to get token info', errorMessage);

      return {
        hasToken: false,
        refreshInProgress: this.tokenRefreshInProgress,
        appidConfigured: !!this.appid,
        secretKeyConfigured: !!this.secretKey,
      };
    }
  }

  /**
   * Clear token cache (untuk testing atau reset)
   */
  async clearTokenCache(): Promise<void> {
    try {
      await this.cacheManager.del('iopgps_access_token');
      this.lastAuthCall = 0; // Reset rate limit counter juga
      this.logger.debug('Token cache and rate limit counter cleared');
    } catch (error: unknown) {
      const errorMessage = this.getErrorMessage(error);
      this.logger.error('Failed to clear token cache', errorMessage);
      throw new Error(`Failed to clear token cache: ${errorMessage}`);
    }
  }

  /**
   * Set manual token untuk testing
   */
  async setManualToken(
    token: string,
    ttl: number = 90 * 60 * 1000,
  ): Promise<void> {
    try {
      const ttlSeconds = Math.floor(ttl / 1000);
      await this.cacheManager.set('iopgps_access_token', token, ttlSeconds);
      this.lastAuthCall = 0; // Reset rate limit counter
      this.logger.log(
        `Manual token set successfully for ${Math.floor(ttl / 1000 / 60)} minutes`,
      );
    } catch (error: unknown) {
      const errorMessage = this.getErrorMessage(error);
      this.logger.error('Failed to set manual token', errorMessage);
      throw new Error(`Failed to set manual token: ${errorMessage}`);
    }
  }

  /**
   * Reset rate limit counter (untuk recovery dari error) - SYNC VERSION
   */
  resetRateLimit(): void {
    this.lastAuthCall = 0;
    this.logger.debug('Rate limit counter reset');
  }

  /**
   * Debug method untuk test authentication - TYPE SAFE VERSION
   */
  async debugAuth(): Promise<DebugAuthResponse> {
    try {
      const config = this.validateConfiguration();
      const time = Math.floor(Date.now() / 1000);
      const signature = this.generateSignature(time);
      const cachedToken = await this.cacheManager.get<string>(
        'iopgps_access_token',
      );
      const now = Date.now();
      const timeSinceLastCall = now - this.lastAuthCall;

      return {
        configuration: {
          appid: this.appid ? `SET (${this.appid})` : 'MISSING',
          secretKey: this.secretKey ? 'SET' : 'MISSING',
          isValid: config.isValid,
          missing: config.missing,
        },
        authRequest: {
          time,
          signature,
          url: `${IOPGPS_CONSTANTS.BASE_URL}${IOPGPS_CONSTANTS.AUTH_ENDPOINT}`,
          expectedBody: {
            appid: this.appid,
            time,
            signature,
          },
        },
        cache: {
          hasToken: !!cachedToken,
          tokenPreview: cachedToken
            ? `${cachedToken.substring(0, 10)}...`
            : 'No token',
          tokenLength: cachedToken ? cachedToken.length : 0,
        },
        rateLimit: {
          lastAuthCall: this.lastAuthCall,
          timeSinceLastCall: Math.floor(timeSinceLastCall / 1000) + ' seconds',
          canMakeCall: timeSinceLastCall >= 25000,
          refreshInProgress: this.tokenRefreshInProgress,
          pendingPromise: this.hasPendingTokenPromise(),
        },
        constants: {
          baseUrl: IOPGPS_CONSTANTS.BASE_URL,
          authEndpoint: IOPGPS_CONSTANTS.AUTH_ENDPOINT,
          timeout: IOPGPS_CONSTANTS.TIMEOUT,
        },
      };
    } catch (error: unknown) {
      const errorMessage = this.getErrorMessage(error);
      return {
        configuration: {
          appid: this.appid ? 'SET' : 'MISSING',
          secretKey: this.secretKey ? 'SET' : 'MISSING',
          isValid: false,
          missing: [],
        },
        authRequest: {
          time: 0,
          signature: '',
          url: '',
          expectedBody: {
            appid: '',
            time: 0,
            signature: '',
          },
        },
        cache: {
          hasToken: false,
          tokenPreview: 'No token',
          tokenLength: 0,
        },
        rateLimit: {
          lastAuthCall: this.lastAuthCall,
          timeSinceLastCall: '0 seconds',
          canMakeCall: false,
          refreshInProgress: this.tokenRefreshInProgress,
          pendingPromise: this.hasPendingTokenPromise(),
        },
        constants: {
          baseUrl: IOPGPS_CONSTANTS.BASE_URL,
          authEndpoint: IOPGPS_CONSTANTS.AUTH_ENDPOINT,
          timeout: IOPGPS_CONSTANTS.TIMEOUT,
        },
        error: errorMessage,
      };
    }
  }

  /**
   * Validate credentials configuration
   */
  validateConfiguration(): { isValid: boolean; missing: string[] } {
    const missing: string[] = [];

    if (!this.appid) missing.push('IOPGPS_APPID');
    if (!this.secretKey) missing.push('IOPGPS_SECRET_KEY');

    return {
      isValid: missing.length === 0,
      missing,
    };
  }

  /**
   * Test signature generation (untuk debugging)
   */
  testSignatureGeneration(secretKey: string, time: number): string {
    const firstHash = crypto.createHash('md5').update(secretKey).digest('hex');
    return crypto
      .createHash('md5')
      .update(firstHash + time)
      .digest('hex');
  }
}

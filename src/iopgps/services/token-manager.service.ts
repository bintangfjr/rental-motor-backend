// src/iopgps/services/token-manager.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { IopgpsAuthService } from '../iopgps.auth.service';

// Type-safe queue item
interface TokenRequest {
  resolve: (token: string) => void;
  reject: (error: Error) => void;
}

@Injectable()
export class TokenManagerService {
  private readonly logger = new Logger(TokenManagerService.name);
  private tokenRequestQueue: TokenRequest[] = [];
  private isProcessingQueue = false;
  private lastToken: string | null = null;
  private lastTokenTime: number = 0;

  constructor(private readonly authService: IopgpsAuthService) {}

  /**
   * Get token dengan centralized management
   */
  async getToken(): Promise<string> {
    // Jika ada token yang masih valid (dalam 5 menit terakhir), gunakan itu
    if (this.lastToken && Date.now() - this.lastTokenTime < 5 * 60 * 1000) {
      this.logger.debug('Using recent token from memory');
      return this.lastToken;
    }

    // ✅ FIX: Remove async from promise executor
    return new Promise<string>((resolve, reject) => {
      this.attemptTokenRetrieval(resolve, reject).catch(reject);
    });
  }

  /**
   * Attempt token retrieval dengan proper error handling
   */
  private async attemptTokenRetrieval(
    resolve: (token: string) => void,
    reject: (error: Error) => void,
  ): Promise<void> {
    try {
      const token = await this.authService.getAccessToken();
      this.cacheToken(token);
      resolve(token);
    } catch (error: unknown) {
      const errorMessage = this.getErrorMessage(error);

      // Jika rate limit, masuk ke queue
      if (errorMessage.includes('Rate limit exceeded')) {
        this.logger.debug('Rate limit hit, adding to queue');
        this.tokenRequestQueue.push({ resolve, reject });
        if (!this.isProcessingQueue) {
          this.processQueue().catch((queueError: unknown) => {
            this.logger.error(
              'Queue processing failed',
              this.getErrorMessage(queueError),
            );
          });
        }
      } else {
        const errorObj =
          error instanceof Error ? error : new Error(errorMessage);
        reject(errorObj);
      }
    }
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessingQueue) return;

    this.isProcessingQueue = true;

    try {
      // Tunggu 35 detik (rate limit reset)
      await new Promise((resolve) => setTimeout(resolve, 35000));

      const token = await this.authService.getAccessToken();
      this.cacheToken(token);

      // Process semua request dalam queue
      const queueCopy = [...this.tokenRequestQueue];
      this.tokenRequestQueue = [];

      for (const request of queueCopy) {
        try {
          request.resolve(token);
        } catch (resolveError: unknown) {
          this.logger.warn(
            'Failed to resolve token request',
            this.getErrorMessage(resolveError),
          );
        }
      }
    } catch (error: unknown) {
      // Jika masih error, reject semua request
      const errorMessage = this.getErrorMessage(error);
      const errorObj = error instanceof Error ? error : new Error(errorMessage);

      const queueCopy = [...this.tokenRequestQueue];
      this.tokenRequestQueue = [];

      for (const request of queueCopy) {
        try {
          request.reject(errorObj);
        } catch (rejectError: unknown) {
          this.logger.warn(
            'Failed to reject token request',
            this.getErrorMessage(rejectError),
          );
        }
      }
    } finally {
      this.isProcessingQueue = false;
    }
  }

  private cacheToken(token: string): void {
    this.lastToken = token;
    this.lastTokenTime = Date.now();
  }

  /**
   * Clear cached token (untuk force refresh)
   */
  clearCache(): void {
    this.lastToken = null;
    this.lastTokenTime = 0;
    this.logger.debug('Token cache cleared');
  }

  /**
   * Get queue status untuk monitoring
   */
  getQueueStatus(): { queueLength: number; isProcessing: boolean } {
    return {
      queueLength: this.tokenRequestQueue.length,
      isProcessing: this.isProcessingQueue,
    };
  }

  /**
   * Get queue details untuk debugging
   */
  getQueueDetails(): {
    queueLength: number;
    isProcessing: boolean;
    lastTokenTime: number;
    hasCachedToken: boolean;
  } {
    return {
      queueLength: this.tokenRequestQueue.length,
      isProcessing: this.isProcessingQueue,
      lastTokenTime: this.lastTokenTime,
      hasCachedToken: this.lastToken !== null,
    };
  }

  /**
   * Clear queue (untuk emergency recovery)
   */
  clearQueue(): void {
    const queueLength = this.tokenRequestQueue.length;
    this.tokenRequestQueue = [];
    this.logger.warn(
      `Cleared token queue with ${queueLength} pending requests`,
    );
  }

  /**
   * Extract error message safely
   */
  private getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }
    if (typeof error === 'string') {
      return error;
    }
    // ✅ FIX: Safe string conversion untuk unknown types
    try {
      return JSON.stringify(error);
    } catch {
      return 'Unknown error occurred';
    }
  }
}

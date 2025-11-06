// src/iopgps/iopgps.controller.ts
import {
  Controller,
  Get,
  Query,
  UseGuards,
  Post,
  Put,
  Body,
  Param,
  ParseIntPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { IopgpsService } from './iopgps.service';
import { VehicleStatusDto } from './dto/vehicle-status.dto';
import { MileageDto } from './dto/mileage.dto';
import { DeviceListDto } from './dto/device-list.dto';
import {
  ApiResponse,
  VehicleStatus,
  MotorWithLocationStatus,
  DeviceLocationResponse,
  MileageResponse,
  IopgpsHealthStatus,
  SyncOperationResult,
  TokenInfo,
  DeviceListResponse,
} from './interfaces/responses.interface';
import * as crypto from 'crypto';

// DTO untuk manual location update
class ManualLocationUpdateDto {
  lat: number;
  lng: number;
}

// DTO untuk manual token
class ManualTokenDto {
  token: string;
}

// DTO untuk test auth
class TestAuthDto {
  appid: string;
  secretKey: string;
  time?: number;
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

// Type-safe test auth response
interface TestAuthResponse {
  code: number;
  result?: string;
  message?: string;
  accessToken?: string;
  expiresIn?: number;
}

// Type-safe error response
interface ErrorResponse {
  code?: number;
  result?: string;
  message?: string;
}

// Type-safe axios error
interface AxiosError {
  response?: {
    data?: unknown;
  };
}

// Type-safe validate IMEI response
interface ValidateImeiResponse {
  valid: boolean;
  message: string;
  imei: string;
}

// Response interfaces - hanya yang punya additional properties
interface VehicleStatusApiResponse extends ApiResponse<VehicleStatus[]> {
  source: 'database' | 'iopgps';
}

interface SyncLocationsApiResponse extends ApiResponse<SyncOperationResult> {
  message: string;
}

interface ManualLocationApiResponse extends ApiResponse<null> {
  message: string;
}

interface RefreshTokenApiResponse extends ApiResponse<null> {
  message: string;
}

interface DebugAuthApiResponse extends ApiResponse<DebugAuthResponse> {
  message: string;
}

interface ManualTokenApiResponse extends ApiResponse<null> {
  message: string;
  tokenPreview?: string;
}

interface TestAuthManualApiResponse
  extends ApiResponse<{
    response: TestAuthResponse | ErrorResponse;
    request: {
      appid: string;
      time: number;
      signature: string;
    };
  }> {
  message: string;
}

interface SyncStatusApiResponse
  extends ApiResponse<{
    lastSync: Date | null;
    nextSync: Date;
    syncCycle: { cycle: number; type: 'location' | 'status' };
    motorCount: number;
  }> {
  message: string;
}

interface ValidateImeiApiResponse extends ApiResponse<ValidateImeiResponse> {
  message: string;
}

// Untuk interfaces tanpa additional properties, gunakan type alias
type DeviceLocationApiResponse = ApiResponse<DeviceLocationResponse>;
type MotorsWithLocationApiResponse = ApiResponse<MotorWithLocationStatus[]>;
type MileageApiResponse = ApiResponse<MileageResponse>;
type HealthCheckApiResponse = ApiResponse<IopgpsHealthStatus>;
type TokenInfoApiResponse = ApiResponse<TokenInfo>;
type DeviceListApiResponse = ApiResponse<DeviceListResponse>;

@Controller('iopgps')
@UseGuards(JwtAuthGuard)
export class IopgpsController {
  constructor(private readonly iopgpsService: IopgpsService) {}

  // ========== VALIDATE IMEI ENDPOINT (BARU) ==========

  @Get('validate-imei')
  async validateImei(
    @Query('imei') imei: string,
  ): Promise<ValidateImeiApiResponse> {
    if (!imei || imei.trim() === '') {
      return {
        success: false,
        error: 'IMEI parameter is required',
        message: 'Validation failed',
        timestamp: new Date(),
      };
    }

    // ✅ FIX: Tambah await untuk membuat method benar-benar async
    await Promise.resolve(); // Minimal async operation

    // Validasi IMEI format (numeric string 15 digit)
    const imeiRegex = /^[0-9]{15}$/;
    const isValid = imeiRegex.test(imei);

    return {
      success: true,
      data: {
        valid: isValid,
        message: isValid ? 'IMEI is valid' : 'IMEI must be exactly 15 digits',
        imei: imei,
      },
      message: 'IMEI validation completed',
      timestamp: new Date(),
    };
  }

  // ========== DEBUG ENDPOINTS ==========

  @Get('debug-auth')
  async debugAuth(): Promise<DebugAuthApiResponse> {
    try {
      const debugInfo = await this.iopgpsService.debugAuth();

      // Type assertion dengan validasi
      if (this.isDebugAuthResponse(debugInfo)) {
        return {
          success: true,
          data: debugInfo,
          message: 'Debug auth information retrieved successfully',
          timestamp: new Date(),
        };
      } else {
        throw new Error('Invalid debug auth response format');
      }
    } catch (error: unknown) {
      const errorMessage = this.getErrorMessage(error);
      return {
        success: false,
        error: errorMessage,
        message: 'Failed to get debug auth information',
        timestamp: new Date(),
      };
    }
  }

  @Post('set-manual-token')
  async setManualToken(
    @Body() body: ManualTokenDto,
  ): Promise<ManualTokenApiResponse> {
    try {
      await this.iopgpsService.setManualToken(body.token);
      return {
        success: true,
        message: 'Manual token set successfully',
        tokenPreview: body.token.substring(0, 10) + '...',
        data: null,
        timestamp: new Date(),
      };
    } catch (error: unknown) {
      const errorMessage = this.getErrorMessage(error);
      return {
        success: false,
        error: errorMessage,
        message: 'Failed to set manual token',
        data: null,
        timestamp: new Date(),
      };
    }
  }

  @Post('test-auth-manual')
  async testAuthManual(
    @Body() body: TestAuthDto,
  ): Promise<TestAuthManualApiResponse> {
    try {
      const time = body.time || Math.floor(Date.now() / 1000);

      // Generate signature
      const firstHash = crypto
        .createHash('md5')
        .update(body.secretKey)
        .digest('hex');
      const signature = crypto
        .createHash('md5')
        .update(firstHash + time)
        .digest('hex');

      const authData = {
        appid: body.appid,
        time: time,
        signature: signature,
      };

      const response = await this.iopgpsService.testAuthRequest(authData);

      // Type assertion dengan validasi
      if (this.isTestAuthResponse(response)) {
        return {
          success: true,
          data: {
            response: response,
            request: authData,
          },
          message: 'Manual auth test completed successfully',
          timestamp: new Date(),
        };
      } else {
        throw new Error('Invalid test auth response format');
      }
    } catch (error: unknown) {
      const errorMessage = this.getErrorMessage(error);

      // Type-safe error response extraction
      const errorResponse: ErrorResponse = this.extractErrorResponse(error);

      return {
        success: false,
        error: errorMessage,
        message: 'Manual auth test failed',
        data: {
          response: errorResponse,
          request: {
            appid: body.appid,
            time: body.time || Math.floor(Date.now() / 1000),
            signature: 'hidden',
          },
        },
        timestamp: new Date(),
      };
    }
  }

  @Get('debug-config')
  async debugConfig(): Promise<DebugAuthApiResponse> {
    try {
      const configCheck = await this.iopgpsService.debugConfig();

      // Type assertion dengan validasi
      if (this.isDebugAuthResponse(configCheck)) {
        return {
          success: true,
          data: configCheck,
          message: 'Debug configuration retrieved successfully',
          timestamp: new Date(),
        };
      } else {
        throw new Error('Invalid debug config response format');
      }
    } catch (error: unknown) {
      const errorMessage = this.getErrorMessage(error);
      return {
        success: false,
        error: errorMessage,
        message: 'Failed to get debug configuration',
        timestamp: new Date(),
      };
    }
  }

  // ========== EXISTING ENDPOINTS ==========

  @Get('vehicle-status')
  async getVehicleStatus(
    @Query() query: VehicleStatusDto,
  ): Promise<VehicleStatusApiResponse> {
    const status = await this.iopgpsService.getVehicleStatus(
      query.licenseNumber,
      query.vin,
    );

    // Determine data source
    const source =
      status.length > 0 &&
      status.some((vehicle) => vehicle.location?.includes('database'))
        ? 'database'
        : 'iopgps';

    return {
      success: true,
      data: status,
      source,
      timestamp: new Date(),
      metadata: {
        source,
        total: status.length,
      },
    };
  }

  @Get('device-location')
  async getDeviceLocation(
    @Query('imei') imei: string,
  ): Promise<DeviceLocationApiResponse> {
    if (!imei || imei.trim() === '') {
      return {
        success: false,
        error: 'IMEI parameter is required',
        message: 'Validation failed',
        timestamp: new Date(),
      };
    }

    const location = await this.iopgpsService.getDeviceLocation(imei);

    return {
      success: location.code === 0,
      data: location,
      message:
        location.code === 0
          ? 'Location retrieved successfully'
          : location.result || 'Unknown error',
      timestamp: new Date(),
      metadata: {
        source: 'iopgps',
        cached: location.code === 0,
      },
    };
  }

  @Get('device-list')
  async getDeviceList(
    @Query() query: DeviceListDto,
  ): Promise<DeviceListApiResponse> {
    const deviceList = await this.iopgpsService.getDeviceList(query);

    return {
      success: deviceList.code === 0,
      data: deviceList,
      message:
        deviceList.code === 0
          ? 'Device list retrieved successfully'
          : deviceList.result || 'Unknown error',
      timestamp: new Date(),
      metadata: {
        page: parseInt(query.currentPage) || 1,
        limit: parseInt(query.pageSize) || 20,
        total: deviceList.data?.length || 0,
      },
    };
  }

  @Get('motors')
  async getMotorsWithLocation(): Promise<MotorsWithLocationApiResponse> {
    const motors = await this.iopgpsService.getMotorsWithLocationStatus();

    const withImeiCount = motors.filter((m) => m.imei !== null).length;
    const withLocationCount = motors.filter(
      (m) => m.lat !== null && m.lng !== null,
    ).length;

    return {
      success: true,
      data: motors,
      message: 'Motors with location status retrieved successfully',
      timestamp: new Date(),
      metadata: {
        total: motors.length,
        withImei: withImeiCount,
        withLocation: withLocationCount,
      },
    };
  }

  @Get('mileage')
  async getMileage(@Query() query: MileageDto): Promise<MileageApiResponse> {
    if (!query.imei || query.imei.trim() === '') {
      return {
        success: false,
        error: 'IMEI parameter is required',
        message: 'Validation failed',
        timestamp: new Date(),
      };
    }

    // Convert to string parameters for API call
    const startTimeStr = query.startTime.toString();
    const endTimeStr = query.endTime ? query.endTime.toString() : undefined;

    const mileageData = await this.iopgpsService.getDeviceMileage(
      query.imei,
      startTimeStr,
      endTimeStr,
    );

    return {
      success: mileageData.code === 0,
      data: mileageData,
      message:
        mileageData.code === 0
          ? 'Mileage data retrieved successfully'
          : mileageData.result || 'Unknown error',
      timestamp: new Date(),
    };
  }

  @Post('sync-locations')
  @HttpCode(HttpStatus.OK)
  async syncLocations(): Promise<SyncLocationsApiResponse> {
    const result = await this.iopgpsService.syncMotorLocations();

    return {
      success: result.success > 0,
      message: 'Motor locations sync completed successfully',
      data: result,
      timestamp: new Date(),
    };
  }

  @Put('motor/:id/location')
  async updateManualLocation(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: ManualLocationUpdateDto,
  ): Promise<ManualLocationApiResponse> {
    if (body.lat === undefined || body.lng === undefined) {
      return {
        success: false,
        error: 'Latitude and longitude are required',
        message: 'Validation failed',
        timestamp: new Date(),
      };
    }

    await this.iopgpsService.updateMotorLocationManually(
      id,
      body.lat,
      body.lng,
    );

    return {
      success: true,
      message: 'Manual location updated successfully',
      data: null,
      timestamp: new Date(),
    };
  }

  @Post('refresh-token')
  @HttpCode(HttpStatus.OK)
  async refreshToken(): Promise<RefreshTokenApiResponse> {
    await this.iopgpsService.refreshToken();

    return {
      success: true,
      message: 'Token refresh initiated successfully',
      data: null,
      timestamp: new Date(),
    };
  }

  @Get('health')
  async healthCheck(): Promise<HealthCheckApiResponse> {
    const health = await this.iopgpsService.healthCheck();

    return {
      success: health.status === 'healthy' || health.status === 'degraded',
      data: health,
      message: `Service is ${health.status}`,
      timestamp: new Date(),
    };
  }

  @Get('token-info')
  async getTokenInfo(): Promise<TokenInfoApiResponse> {
    const tokenInfo = await this.iopgpsService.getTokenInfo();

    return {
      success: true,
      data: tokenInfo,
      message: 'Token info retrieved successfully',
      timestamp: new Date(),
    };
  }

  // ========== CLEAR CACHE ENDPOINT ==========

  @Post('clear-cache')
  @HttpCode(HttpStatus.OK)
  async clearCache(): Promise<ApiResponse<null>> {
    try {
      await this.iopgpsService.clearTokenCache();
      return {
        success: true,
        message: 'Token cache cleared successfully',
        data: null,
        timestamp: new Date(),
      };
    } catch (error: unknown) {
      const errorMessage = this.getErrorMessage(error);
      return {
        success: false,
        error: errorMessage,
        message: 'Failed to clear token cache',
        data: null,
        timestamp: new Date(),
      };
    }
  }

  // ========== SYNC STATUS ENDPOINT ==========

  @Get('sync-status')
  async getSyncStatus(): Promise<SyncStatusApiResponse> {
    try {
      const lastSync: Date | null = this.iopgpsService.getLastSyncTime();
      const syncCycle: { cycle: number; type: 'location' | 'status' } =
        this.iopgpsService.getSyncCycleInfo();
      const motorCount: number = await this.iopgpsService.getMotorCount();

      const nextSync: Date = new Date(Date.now() + 60 * 1000); // 1 menit dari sekarang

      return {
        success: true,
        data: {
          lastSync,
          nextSync,
          syncCycle,
          motorCount,
        },
        message: 'Sync status retrieved successfully',
        timestamp: new Date(),
      };
    } catch (error: unknown) {
      const errorMessage = this.getErrorMessage(error);
      return {
        success: false,
        error: errorMessage,
        message: 'Failed to get sync status',
        timestamp: new Date(),
      };
    }
  }

  // ========== HELPER METHODS ==========

  /**
   * Extract error message safely dengan type guard
   */
  private getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }
    if (typeof error === 'string') {
      return error;
    }
    return 'Unknown error occurred';
  }

  /**
   * Extract error response dari axios error
   */
  private extractErrorResponse(error: unknown): ErrorResponse {
    const errorMessage = this.getErrorMessage(error);

    if (error && typeof error === 'object' && 'response' in error) {
      const axiosError = error as AxiosError;
      const errorData = axiosError.response?.data;

      if (errorData && typeof errorData === 'object') {
        const data = errorData as Record<string, unknown>;
        return {
          code: typeof data.code === 'number' ? data.code : undefined,
          result: typeof data.result === 'string' ? data.result : undefined,
          message:
            typeof data.message === 'string' ? data.message : errorMessage,
        };
      }
    }

    return { message: errorMessage };
  }

  /**
   * Type guard untuk DebugAuthResponse
   */
  private isDebugAuthResponse(data: unknown): data is DebugAuthResponse {
    if (typeof data !== 'object' || data === null) return false;

    const response = data as Record<string, unknown>;
    return (
      typeof response.configuration === 'object' &&
      typeof response.authRequest === 'object' &&
      typeof response.cache === 'object' &&
      typeof response.rateLimit === 'object' &&
      typeof response.constants === 'object'
    );
  }

  /**
   * Type guard untuk TestAuthResponse
   */
  private isTestAuthResponse(data: unknown): data is TestAuthResponse {
    if (typeof data !== 'object' || data === null) return false;

    const response = data as Record<string, unknown>;
    return typeof response.code === 'number';
  }
}

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
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { IopgpsService } from './iopgps.service';
import { VehicleStatusDto } from './dto/vehicle-status.dto';
import { MileageDto } from './dto/mileage.dto';

class ManualLocationUpdateDto {
  lat: number;
  lng: number;
  // Hapus note karena tidak digunakan di service
}

// Interface untuk response types
interface VehicleStatusResponse {
  success: boolean;
  data: any[];
  source: 'database' | 'iopgps';
}

interface DeviceLocationResponse {
  success: boolean;
  data: any;
}

interface MotorsWithLocationResponse {
  success: boolean;
  data: any[];
}

interface MileageResponse {
  success: boolean;
  data: any;
}

interface SyncLocationsResponse {
  success: boolean;
  message: string;
  result: {
    success: number;
    failed: number;
  };
}

interface ManualLocationResponse {
  success: boolean;
  message: string;
}

interface RefreshTokenResponse {
  success: boolean;
  message: string;
}

interface HealthCheckResponse {
  success: boolean;
  data: {
    status: 'healthy' | 'degraded' | 'unhealthy';
    tokenValid: boolean;
    apiAccessible: boolean;
    databaseConnected: boolean;
    lastSync?: Date;
  };
}

@Controller('iopgps')
@UseGuards(JwtAuthGuard)
export class IopgpsController {
  constructor(private readonly iopgpsService: IopgpsService) {}

  @Get('vehicle-status')
  async getVehicleStatus(
    @Query() query: VehicleStatusDto,
  ): Promise<VehicleStatusResponse> {
    const status = await this.iopgpsService.getVehicleStatus(
      query.licenseNumber,
      query.vin,
    );

    // Perbaikan: Gunakan proper type checking
    const source =
      status.length > 0 && status[0]?.location === 'Data from database'
        ? 'database'
        : 'iopgps';

    return {
      success: true,
      data: status,
      source,
    };
  }

  @Get('device-location')
  async getDeviceLocation(
    @Query('imei') imei: string,
  ): Promise<DeviceLocationResponse> {
    const location = await this.iopgpsService.getDeviceLocation(imei);
    return { success: true, data: location };
  }

  @Get('motors')
  async getMotorsWithLocation(): Promise<MotorsWithLocationResponse> {
    const motors = await this.iopgpsService.getMotorsWithLocationStatus();
    return { success: true, data: motors };
  }

  @Get('mileage')
  async getMileage(@Query() query: MileageDto): Promise<MileageResponse> {
    // Perbaikan: Gunakan method yang benar dari service
    const data = await this.iopgpsService.getDeviceMileage(
      query.imei,
      query.startTime,
      query.endTime,
    );
    return { success: true, data };
  }

  @Post('sync-locations')
  async syncLocations(): Promise<SyncLocationsResponse> {
    const result = await this.iopgpsService.syncMotorLocations();
    return {
      success: true,
      message: 'Motor locations sync completed',
      result,
    };
  }

  @Put('motor/:id/location')
  async updateManualLocation(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: ManualLocationUpdateDto,
  ): Promise<ManualLocationResponse> {
    // Perbaikan: Hanya kirim 3 parameter sesuai dengan service
    await this.iopgpsService.updateMotorLocationManually(
      id,
      body.lat,
      body.lng,
    );
    return {
      success: true,
      message: 'Manual location updated successfully',
    };
  }

  @Post('refresh-token')
  async refreshToken(): Promise<RefreshTokenResponse> {
    // Tambahkan await untuk memenuhi require-await
    await Promise.resolve(); // Dummy await untuk memenuhi ESLint

    return {
      success: true,
      message: 'Use auth service directly for token refresh',
    };
  }

  @Get('health')
  async healthCheck(): Promise<HealthCheckResponse> {
    const health = await this.iopgpsService.healthCheck();
    return { success: true, data: health };
  }
}

import {
  Controller,
  Get,
  Param,
  UseGuards,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { TraccarService } from './traccar.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';

@ApiTags('traccar')
@ApiBearerAuth()
@Controller('traccar')
export class TraccarController {
  constructor(private readonly traccarService: TraccarService) {}

  @Get('dashboard')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get GPS dashboard data' })
  async getDashboard() {
    try {
      const data = await this.traccarService.getDashboardData();
      return { success: true, data };
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to fetch GPS dashboard data',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('device/:deviceId')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get device details' })
  async getDevice(@Param('deviceId') deviceId: string) {
    try {
      const data = await this.traccarService.getDeviceData(deviceId);
      return { success: true, data };
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to fetch device data',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('positions')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get all positions' })
  async getAllPositions() {
    try {
      const positions = await this.traccarService.getAllPositions();
      return { success: true, data: positions };
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to fetch positions',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('positions/:deviceId')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get device positions' })
  async getDevicePositions(@Param('deviceId') deviceId: string) {
    try {
      const positions = await this.traccarService.getDevicePositions(deviceId);
      return { success: true, data: positions };
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to fetch device positions',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('sync')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Sync devices with local database' })
  async syncDevices() {
    try {
      const result = await this.traccarService.syncDevicesWithLocal();
      return {
        success: true,
        message: 'Devices synced successfully',
        data: result,
      };
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to sync devices',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}

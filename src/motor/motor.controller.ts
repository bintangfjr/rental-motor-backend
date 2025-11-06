import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  Query,
  ParseIntPipe,
  DefaultValuePipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { MotorService } from './motor.service';
import { MotorGpsService } from './motor-gps.service';
import { MotorMileageService } from './motor-mileage.service';
import { CreateMotorDto } from './dto/create-motor.dto';
import { UpdateMotorDto } from './dto/update-motor.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

// Interface untuk response validate IMEI
interface ValidateImeiResponse {
  valid: boolean;
  message: string;
  imei: string;
}

interface ValidateImeiApiResponse {
  success: boolean;
  data?: ValidateImeiResponse;
  error?: string;
  message: string;
  timestamp: Date;
}

@Controller('motors')
@UseGuards(JwtAuthGuard)
export class MotorController {
  constructor(
    private readonly motorService: MotorService,
    private readonly motorGpsService: MotorGpsService,
    private readonly motorMileageService: MotorMileageService,
  ) {}

  // ========== VALIDATE IMEI ENDPOINT ==========
  @Get('validate-imei')
  async validateImei(
    @Query('imei') imei: string,
  ): Promise<ValidateImeiApiResponse> {
    await Promise.resolve();

    if (!imei || imei.trim() === '') {
      return {
        success: false,
        error: 'IMEI parameter is required',
        message: 'Validation failed',
        timestamp: new Date(),
      };
    }

    // ✅ OPTIMASI: Gabungkan validasi
    const isValidFormat = /^[0-9]{15}$/.test(imei);
    if (!isValidFormat) {
      return {
        success: true,
        data: {
          valid: false,
          message: 'IMEI must be exactly 15 digits',
          imei: imei,
        },
        message: 'IMEI validation completed',
        timestamp: new Date(),
      };
    }

    const isValidLuhn = this.validateImeiLuhn(imei);
    const isValid = isValidFormat && isValidLuhn;

    return {
      success: true,
      data: {
        valid: isValid,
        message: isValid
          ? 'IMEI is valid'
          : 'IMEI failed Luhn algorithm validation',
        imei: imei,
      },
      message: 'IMEI validation completed',
      timestamp: new Date(),
    };
  }

  // ========== BASIC CRUD ENDPOINTS ==========
  @Get()
  async findAll() {
    // ✅ OPTIMASI: Langsung return tanpa variable intermediate
    return {
      success: true,
      data: await this.motorService.findAll(),
      timestamp: new Date(),
    };
  }

  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return {
      success: true,
      data: await this.motorService.findOne(id),
      timestamp: new Date(),
    };
  }

  @Post()
  async create(@Body() createMotorDto: CreateMotorDto) {
    const motor = await this.motorService.create(createMotorDto);
    return {
      success: true,
      data: motor,
      message: 'Motor berhasil ditambahkan',
      timestamp: new Date(),
    };
  }

  @Put(':id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateMotorDto: UpdateMotorDto,
  ) {
    const motor = await this.motorService.update(id, updateMotorDto);
    return {
      success: true,
      data: motor,
      message: 'Motor berhasil diperbarui',
      timestamp: new Date(),
    };
  }

  @Put(':id/cancel-service')
  async cancelService(@Param('id', ParseIntPipe) id: number) {
    const motor = await this.motorService.cancelService(id);
    return {
      success: true,
      data: motor,
      message: 'Service motor berhasil dibatalkan',
      timestamp: new Date(),
    };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async remove(@Param('id', ParseIntPipe) id: number) {
    try {
      const result = await this.motorService.remove(id);

      // ✅ OPTIMASI: Minimal data untuk delete response
      return {
        success: true,
        data: {
          message: result.message,
          motorId: id,
          deletedAt: new Date(),
        },
        message: result.message,
        timestamp: new Date(),
      };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Gagal menghapus motor';

      return {
        success: false,
        error: errorMessage,
        message: 'Gagal menghapus motor',
        timestamp: new Date(),
      };
    }
  }

  // ========== SERVICE ENDPOINTS ==========
  @Put(':id/mark-for-service')
  async markForService(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { service_notes?: string },
  ) {
    const motor = await this.motorService.markForService(
      id,
      body.service_notes,
    );
    return {
      success: true,
      data: motor,
      message: 'Motor berhasil ditandai untuk service',
      timestamp: new Date(),
    };
  }

  @Put(':id/complete-service')
  async completeService(@Param('id', ParseIntPipe) id: number) {
    const motor = await this.motorService.completeService(id);
    return {
      success: true,
      data: motor,
      message: 'Service motor berhasil diselesaikan',
      timestamp: new Date(),
    };
  }

  @Get('service/pending')
  async getPendingServiceMotors() {
    return {
      success: true,
      data: await this.motorService.findPendingService(),
      timestamp: new Date(),
    };
  }

  @Get('service/in-progress')
  async getInServiceMotors() {
    return {
      success: true,
      data: await this.motorService.findInService(),
      timestamp: new Date(),
    };
  }

  // ========== GPS ENDPOINTS ==========
  @Get('gps/all')
  async findWithGps() {
    return {
      success: true,
      data: await this.motorGpsService.findWithGps(),
      timestamp: new Date(),
    };
  }

  @Post(':id/sync-location')
  async syncLocation(@Param('id', ParseIntPipe) id: number) {
    return {
      success: true,
      data: await this.motorGpsService.syncMotorLocation(id),
      timestamp: new Date(),
    };
  }

  @Get(':id/vehicle-status')
  async getVehicleStatus(@Param('id', ParseIntPipe) id: number) {
    return {
      success: true,
      data: await this.motorGpsService.getVehicleStatus(id),
      timestamp: new Date(),
    };
  }

  @Get('dashboard/gps')
  async getGpsDashboard() {
    return {
      success: true,
      data: await this.motorGpsService.getGpsDashboard(),
      timestamp: new Date(),
    };
  }

  // ========== MILEAGE ENDPOINTS ==========
  @Get(':id/mileage')
  async getMileage(
    @Param('id', ParseIntPipe) id: number,
    @Query('startTime', ParseIntPipe) startTime: number,
    @Query('endTime', new ParseIntPipe({ optional: true })) endTime?: number,
  ) {
    return {
      success: true,
      data: await this.motorMileageService.getMileage(id, startTime, endTime),
      timestamp: new Date(),
    };
  }

  @Post(':id/sync-mileage')
  @HttpCode(HttpStatus.OK)
  async syncMileage(@Param('id', ParseIntPipe) id: number) {
    try {
      await this.motorMileageService.syncMileageData(id);

      // ✅ OPTIMASI: Minimal data untuk sync response
      return {
        success: true,
        data: {
          success: true,
          message: 'Data mileage berhasil disinkronisasi',
          motorId: id,
        },
        message: 'Data mileage berhasil disinkronisasi',
        timestamp: new Date(),
      };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : 'Gagal menyinkronisasi data mileage';

      return {
        success: false,
        error: errorMessage,
        message: 'Gagal menyinkronisasi data mileage',
        timestamp: new Date(),
      };
    }
  }

  @Get(':id/mileage-history')
  async getMileageHistory(
    @Param('id', ParseIntPipe) id: number,
    @Query('days', new DefaultValuePipe(30), ParseIntPipe) days: number,
  ) {
    return {
      success: true,
      data: await this.motorMileageService.getMileageHistory(id, days),
      timestamp: new Date(),
    };
  }

  // ========== HELPER METHOD ==========
  /**
   * Validasi IMEI menggunakan Luhn algorithm - OPTIMASI
   */
  private validateImeiLuhn(imei: string): boolean {
    if (imei.length !== 15) return false;

    let sum = 0;
    for (let i = 0; i < 15; i++) {
      let digit = parseInt(imei[i]);

      // Double every second digit dari kanan
      if ((14 - i) % 2 === 1) {
        digit = digit * 2;
        if (digit > 9) digit -= 9;
      }

      sum += digit;
    }

    return sum % 10 === 0;
  }
}

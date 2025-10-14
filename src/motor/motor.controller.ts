// src/motor/motor.controller.ts
import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpException,
  HttpStatus,
  Logger,
  Query,
} from '@nestjs/common';
import { MotorService } from './motor.service';
import { CreateMotorDto } from './dto/create-motor.dto';
import { UpdateMotorDto } from './dto/update-motor.dto';
import { MileageDto } from '../iopgps/dto/mileage.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

// Interface untuk error Prisma
interface PrismaError extends Error {
  code?: string;
}

// Extended interface untuk error dengan message
interface ErrorWithMessage {
  message: string;
}

// Response interfaces untuk type safety
interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
}

interface MotorResponse {
  id: number;
  plat_nomor: string;
  merk: string;
  model: string;
  tahun: number;
  harga: number;
  no_gsm?: string;
  imei?: string;
  status: string;
  device_id?: string;
  lat?: number;
  lng?: number;
  last_update?: Date;
  created_at: Date;
  updated_at: Date;
}

interface MotorWithSewaResponse extends MotorResponse {
  sewas: Array<{
    id: number;
    penyewa: {
      id: number;
      nama: string;
      no_whatsapp: string;
    };
  }>;
}

interface MotorGpsResponse {
  id: number;
  plat_nomor: string;
  merk: string;
  model: string;
  status: string;
  lat?: number;
  lng?: number;
  last_update?: Date;
  imei?: string;
  no_gsm?: string;
  gps_status?: string;
  location_source?: string;
}

interface MileageApiResponse {
  success: boolean;
  data: any;
  message: string;
}

interface SyncLocationResponse {
  success: boolean;
  data: any;
  message: string;
}

interface TrackHistoryResponse {
  success: boolean;
  data: any;
  message: string;
}

@Controller('motors')
export class MotorController {
  private readonly logger = new Logger(MotorController.name);

  constructor(private readonly motorService: MotorService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  async findAll(): Promise<ApiResponse<MotorResponse[]>> {
    try {
      const motors = await this.motorService.findAll();
      return { success: true, data: motors };
    } catch (error: unknown) {
      this.logger.error('Failed to fetch motors', error);
      throw new HttpException(
        'Failed to fetch motors',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('gps')
  @UseGuards(JwtAuthGuard)
  async getMotorsWithGps(): Promise<ApiResponse<MotorGpsResponse[]>> {
    try {
      const motors = await this.motorService.findWithGps();
      return { success: true, data: motors };
    } catch (error: unknown) {
      this.logger.error('Failed to fetch motors with GPS', error);
      throw new HttpException(
        'Failed to fetch motors with GPS',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  async findOne(
    @Param('id') id: string,
  ): Promise<ApiResponse<MotorWithSewaResponse>> {
    try {
      const motor = await this.motorService.findOne(+id);
      if (!motor) {
        throw new HttpException('Motor not found', HttpStatus.NOT_FOUND);
      }
      return { success: true, data: motor };
    } catch (error: unknown) {
      if (error instanceof HttpException) throw error;
      this.logger.error(`Failed to fetch motor with id ${id}`, error);
      throw new HttpException(
        'Failed to fetch motor',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  async create(
    @Body() createMotorDto: CreateMotorDto,
  ): Promise<ApiResponse<MotorResponse>> {
    try {
      const motor = await this.motorService.create(createMotorDto);
      return {
        success: true,
        data: motor,
        message: 'Motor berhasil ditambahkan.',
      };
    } catch (error: unknown) {
      const prismaError = error as PrismaError;
      this.logger.error('Failed to create motor', prismaError);

      if (prismaError.code === 'P2002') {
        throw new HttpException(
          'Plat nomor already exists',
          HttpStatus.CONFLICT,
        );
      }

      const errorMessage = this.getErrorMessage(error);
      throw new HttpException(errorMessage, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard)
  async update(
    @Param('id') id: string,
    @Body() updateMotorDto: UpdateMotorDto,
  ): Promise<ApiResponse<MotorResponse>> {
    try {
      const motor = await this.motorService.update(+id, updateMotorDto);
      return {
        success: true,
        data: motor,
        message: 'Motor berhasil diperbarui.',
      };
    } catch (error: unknown) {
      if (error instanceof HttpException) throw error;

      const prismaError = error as PrismaError;
      this.logger.error(`Failed to update motor with id ${id}`, prismaError);

      if (prismaError.code === 'P2002') {
        throw new HttpException(
          'Plat nomor already exists',
          HttpStatus.CONFLICT,
        );
      }

      const errorMessage = this.getErrorMessage(error);
      throw new HttpException(errorMessage, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  async remove(
    @Param('id') id: string,
  ): Promise<ApiResponse<{ message: string }>> {
    try {
      const result = await this.motorService.remove(+id);
      return {
        success: true,
        message: result.message,
      };
    } catch (error: unknown) {
      if (error instanceof HttpException) throw error;
      this.logger.error(`Failed to delete motor with id ${id}`, error);

      const errorMessage = this.getErrorMessage(error);
      throw new HttpException(errorMessage, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  // ✅ NEW: Endpoint untuk mendapatkan mileage
  @Post('mileage')
  @UseGuards(JwtAuthGuard)
  async getMileage(
    @Body() mileageDto: MileageDto,
  ): Promise<MileageApiResponse> {
    try {
      const result = await this.motorService.getMileage(
        mileageDto.imei,
        mileageDto.startTime,
        mileageDto.endTime,
      );
      return result;
    } catch (error: unknown) {
      this.logger.error('Failed to get mileage', error);

      const errorMessage = this.getErrorMessage(error);
      throw new HttpException(errorMessage, HttpStatus.BAD_REQUEST);
    }
  }

  // ✅ NEW: Endpoint untuk sync lokasi manual
  @Post(':id/sync-location')
  @UseGuards(JwtAuthGuard)
  async syncLocation(@Param('id') id: string): Promise<SyncLocationResponse> {
    try {
      const result = await this.motorService.syncMotorLocation(+id);
      return result;
    } catch (error: unknown) {
      this.logger.error(`Failed to sync location for motor ${id}`, error);

      const errorMessage = this.getErrorMessage(error);
      throw new HttpException(errorMessage, HttpStatus.BAD_REQUEST);
    }
  }

  // ✅ NEW: Endpoint untuk mendapatkan riwayat perjalanan
  @Get('track-history/:imei')
  @UseGuards(JwtAuthGuard)
  async getTrackHistory(
    @Param('imei') imei: string,
    @Query('startTime') startTime: string,
    @Query('endTime') endTime?: string,
  ): Promise<TrackHistoryResponse> {
    try {
      const start = parseInt(startTime);

      if (isNaN(start)) {
        throw new HttpException(
          'startTime harus berupa timestamp yang valid',
          HttpStatus.BAD_REQUEST,
        );
      }

      const end =
        endTime && !isNaN(parseInt(endTime)) ? parseInt(endTime) : undefined;

      const result = await this.motorService.getTrackHistory(imei, start, end);
      return result;
    } catch (error: unknown) {
      this.logger.error(`Failed to get track history for IMEI ${imei}`, error);

      const errorMessage = this.getErrorMessage(error);
      throw new HttpException(errorMessage, HttpStatus.BAD_REQUEST);
    }
  }

  /**
   * Extract error message safely tanpa unsafe member access
   */
  private getErrorMessage(error: unknown): string {
    // Case 1: Error instance
    if (error instanceof Error) {
      return error.message;
    }

    // Case 2: String
    if (typeof error === 'string') {
      return error;
    }

    // Case 3: Object with message property (type-safe check)
    if (error !== null && typeof error === 'object' && 'message' in error) {
      const errorWithMessage = error as ErrorWithMessage;
      return errorWithMessage.message;
    }

    // Case 4: Object dengan properti lain (safe conversion)
    if (error !== null && typeof error === 'object') {
      try {
        return JSON.stringify(error);
      } catch {
        return 'Unknown error object';
      }
    }

    // Case 5: Fallback
    return 'Unknown error occurred';
  }
}

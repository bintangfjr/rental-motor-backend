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
} from '@nestjs/common';
import { MotorService } from './motor.service';
import { CreateMotorDto } from './dto/create-motor.dto';
import { UpdateMotorDto } from './dto/update-motor.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('motors')
export class MotorController {
  constructor(private readonly motorService: MotorService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  async findAll() {
    try {
      const motors = await this.motorService.findAll();
      return { success: true, data: motors };
    } catch (error) {
      throw new HttpException(
        'Failed to fetch motors',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('gps')
  @UseGuards(JwtAuthGuard)
  async getMotorsWithGps() {
    try {
      const motors = await this.motorService.findWithGps();
      return { success: true, data: motors };
    } catch (error) {
      throw new HttpException(
        'Failed to fetch motors with GPS',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  async findOne(@Param('id') id: string) {
    try {
      const motor = await this.motorService.findOne(+id);
      if (!motor) {
        throw new HttpException('Motor not found', HttpStatus.NOT_FOUND);
      }
      return { success: true, data: motor };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        'Failed to fetch motor',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  async create(@Body() createMotorDto: CreateMotorDto) {
    try {
      const motor = await this.motorService.create(createMotorDto);
      return {
        success: true,
        data: motor,
        message: 'Motor berhasil ditambahkan.',
      };
    } catch (error) {
      if (error.code === 'P2002') {
        throw new HttpException(
          'Plat nomor already exists',
          HttpStatus.CONFLICT,
        );
      }
      throw new HttpException(
        'Failed to create motor',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard)
  async update(
    @Param('id') id: string,
    @Body() updateMotorDto: UpdateMotorDto,
  ) {
    try {
      const motor = await this.motorService.update(+id, updateMotorDto);
      return {
        success: true,
        data: motor,
        message: 'Motor berhasil diperbarui.',
      };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      if (error.code === 'P2002') {
        throw new HttpException(
          'Plat nomor already exists',
          HttpStatus.CONFLICT,
        );
      }
      throw new HttpException(
        'Failed to update motor',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  async remove(@Param('id') id: string) {
    try {
      const result = await this.motorService.remove(+id);
      return {
        success: true,
        message: result.message,
      };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        'Failed to delete motor',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}

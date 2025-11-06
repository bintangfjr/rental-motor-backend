import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  ParseIntPipe,
} from '@nestjs/common';
import { MotorServiceService } from './motor-service.service';
import { CreateServiceRecordDto } from './dto/create-service-record.dto';
import { UpdateServiceRecordDto } from './dto/update-service-record.dto';
import { StartServiceDto } from './dto/start-service.dto';
import { CompleteServiceDto } from './dto/complete-service.dto';

@Controller('motor-service')
export class MotorServiceController {
  constructor(private readonly motorServiceService: MotorServiceService) {}

  @Get()
  async getAllServiceRecords() {
    return this.motorServiceService.getAllServiceRecords();
  }

  @Get('motor/:motorId')
  async getServiceRecordsByMotorId(
    @Param('motorId', ParseIntPipe) motorId: number,
  ) {
    return this.motorServiceService.getServiceRecordsByMotorId(motorId);
  }

  @Get('active/:motorId')
  async getActiveServiceRecord(
    @Param('motorId', ParseIntPipe) motorId: number,
  ) {
    return this.motorServiceService.getActiveServiceRecord(motorId);
  }

  @Get('stats')
  async getServiceStats() {
    return this.motorServiceService.getServiceStats();
  }

  @Get('pending')
  async getPendingServiceMotors() {
    return this.motorServiceService.getPendingServiceMotors();
  }

  @Get('in-service')
  async getMotorsInService() {
    return this.motorServiceService.getMotorsInService();
  }

  @Post()
  async createServiceRecord(
    @Body() createServiceRecordDto: CreateServiceRecordDto,
  ) {
    return this.motorServiceService.createServiceRecord(createServiceRecordDto);
  }

  @Post('start/:motorId')
  async startService(
    @Param('motorId', ParseIntPipe) motorId: number,
    @Body() startServiceDto: StartServiceDto,
  ) {
    return this.motorServiceService.startService(motorId, startServiceDto);
  }

  @Put('complete/:serviceRecordId')
  async completeService(
    @Param('serviceRecordId', ParseIntPipe) serviceRecordId: number,
    @Body() completeServiceDto: CompleteServiceDto,
  ) {
    return this.motorServiceService.completeService(
      serviceRecordId,
      completeServiceDto,
    );
  }

  @Put('cancel/:serviceRecordId')
  async cancelService(
    @Param('serviceRecordId', ParseIntPipe) serviceRecordId: number,
  ) {
    return this.motorServiceService.cancelService(serviceRecordId);
  }

  @Put(':id')
  async updateServiceRecord(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateServiceRecordDto: UpdateServiceRecordDto,
  ) {
    return this.motorServiceService.updateServiceRecord(
      id,
      updateServiceRecordDto,
    );
  }

  @Delete(':id')
  async deleteServiceRecord(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<void> {
    return this.motorServiceService.deleteServiceRecord(id);
  }
}

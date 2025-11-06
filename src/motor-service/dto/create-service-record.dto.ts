import {
  IsString,
  IsNumber,
  IsArray,
  IsOptional,
  IsEnum,
  IsDateString,
  Min,
} from 'class-validator';
import { ServiceType } from '@prisma/client';

export class CreateServiceRecordDto {
  @IsNumber()
  motor_id: number;

  @IsEnum(ServiceType)
  service_type: ServiceType;

  @IsDateString()
  service_date: string;

  @IsDateString()
  @IsOptional()
  estimated_completion?: string;

  @IsString()
  service_location: string;

  @IsString()
  service_technician: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  parts?: string[];

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  services?: string[];

  @IsNumber()
  @Min(0)
  @IsOptional()
  estimated_cost?: number;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsString()
  @IsOptional()
  service_notes?: string;
}

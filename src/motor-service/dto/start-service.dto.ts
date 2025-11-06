import {
  IsString,
  IsArray,
  IsOptional,
  IsEnum,
  IsDateString,
  IsNumber,
  Min,
} from 'class-validator';
import { ServiceType } from '@prisma/client';

export class StartServiceDto {
  @IsEnum(ServiceType)
  service_type: ServiceType;

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

  @IsDateString()
  @IsOptional()
  estimated_completion?: string;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsString()
  @IsOptional()
  service_notes?: string;
}

// src/iopgps/dto/mileage.dto.ts (file terpisah)
import { IsNotEmpty, IsNumber, IsString, IsOptional } from 'class-validator';

export class MileageDto {
  @IsString()
  @IsNotEmpty()
  imei: string;

  @IsNumber()
  @IsNotEmpty()
  startTime: number;

  @IsOptional()
  @IsNumber()
  endTime?: number; // Opsional, default ke waktu sekarang
}

import { IsOptional, IsString } from 'class-validator';

export class VehicleStatusDto {
  @IsOptional()
  @IsString()
  licenseNumber?: string; // plat nomor (kalau ada)

  @IsOptional()
  @IsString()
  vin?: string;
}

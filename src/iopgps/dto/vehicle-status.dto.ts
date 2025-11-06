import { IsOptional, IsString, IsIn } from 'class-validator';

export class VehicleStatusDto {
  @IsOptional()
  @IsString()
  licenseNumber?: string; // plat nomor

  @IsOptional()
  @IsString()
  vin?: string; // Frame number

  @IsOptional()
  @IsString()
  @IsIn(['1', '2', 'wgs84ll']) // Sesuai dokumentasi
  mapType?: string; // Coordinate system (1: bd09ll, 2: gcj02ll, null: wgs84ll)
}

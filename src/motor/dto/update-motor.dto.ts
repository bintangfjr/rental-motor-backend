import {
  IsString,
  IsNumber,
  IsOptional,
  IsIn,
  Min,
  Max,
  Length,
} from 'class-validator';

const CURRENT_YEAR = new Date().getFullYear();

export class UpdateMotorDto {
  @IsString()
  @Length(1, 20)
  @IsOptional()
  plat_nomor?: string;

  @IsString()
  @Length(1, 255)
  @IsOptional()
  merk?: string;

  @IsString()
  @Length(1, 255)
  @IsOptional()
  model?: string;

  @IsNumber()
  @Min(1990)
  @Max(CURRENT_YEAR + 1)
  @IsOptional()
  tahun?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  harga?: number;

  @IsString()
  @IsOptional()
  @Length(0, 20)
  no_gsm?: string;

  @IsString()
  @IsOptional()
  @Length(0, 20)
  imei?: string;

  @IsString()
  @IsIn(['tersedia', 'disewa', 'perbaikan', 'pending_perbaikan'])
  @IsOptional()
  status?: string;

  // ✅ TAMBAHKAN SERVICE FIELDS
  @IsString()
  @IsOptional()
  @Length(0, 255)
  service_technician?: string;

  @IsString()
  @IsOptional()
  last_service_date?: string;

  @IsString()
  @IsOptional()
  service_notes?: string;
}

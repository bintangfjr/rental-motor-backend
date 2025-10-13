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
  plat_nomor: string;

  @IsString()
  @Length(1, 255)
  merk: string;

  @IsString()
  @Length(1, 255)
  model: string;

  @IsNumber()
  @Min(1990)
  @Max(CURRENT_YEAR + 1)
  tahun: number;

  @IsNumber()
  @Min(0)
  harga: number;

  @IsString()
  @IsOptional()
  @Length(0, 20)
  no_gsm?: string;

  @IsString()
  @IsOptional()
  @Length(0, 20)
  imei?: string;

  @IsString()
  @IsIn(['tersedia', 'disewa', 'perbaikan'])
  status: string;
}

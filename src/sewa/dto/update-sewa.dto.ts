import {
  IsString,
  IsIn,
  IsOptional,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { AdditionalCostItemDto } from './create-sewa.dto';

export class UpdateSewaDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  jaminan?: string[];

  @IsOptional()
  @IsString()
  pembayaran?: string;

  @IsOptional()
  @IsString()
  tgl_kembali?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AdditionalCostItemDto)
  additional_costs?: AdditionalCostItemDto[];

  @IsOptional()
  @IsString()
  catatan_tambahan?: string;

  // ✅ TAMBAHAN: Field untuk perpanjangan sewa
  @IsOptional()
  @IsString()
  tgl_kembali_baru?: string; // Untuk perpanjangan sewa
}

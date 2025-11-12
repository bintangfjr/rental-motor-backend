import {
  IsString,
  IsInt,
  IsIn,
  IsOptional,
  Min,
  IsNotEmpty,
  IsArray,
  ValidateNested,
  IsNumber,
} from 'class-validator';
import { Type } from 'class-transformer';

export class AdditionalCostItemDto {
  @IsString()
  @IsNotEmpty()
  description: string;

  @IsNumber()
  @Min(0)
  amount: number;

  @IsString()
  @IsIn(['discount', 'additional'])
  type: 'discount' | 'additional';
}

export class CreateSewaDto {
  @IsInt()
  @Min(1)
  @IsNotEmpty()
  motor_id: number;

  @IsInt()
  @Min(1)
  @IsNotEmpty()
  penyewa_id: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  jaminan?: string[];

  @IsOptional()
  @IsString()
  pembayaran?: string;

  @IsString()
  @IsIn(['hari', 'jam'])
  @IsNotEmpty()
  satuan_durasi: 'hari' | 'jam';

  @IsString()
  @IsNotEmpty()
  tgl_sewa: string;

  @IsString()
  @IsNotEmpty()
  tgl_kembali: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AdditionalCostItemDto)
  additional_costs?: AdditionalCostItemDto[];

  @IsOptional()
  @IsString()
  catatan_tambahan?: string;
}

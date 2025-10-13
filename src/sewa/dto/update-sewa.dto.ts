import {
  IsString,
  IsOptional,
  Validate,
  IsArray,
  ArrayMinSize,
  IsEnum,
  IsNumber,
  Min,
  ValidateNested,
  IsNotEmpty,
  IsIn,
} from 'class-validator';
import { Type } from 'class-transformer';
import { IsValidDateTimeFormatConstraint } from './custom-validators';

export enum JaminanType {
  KTP = 'KTP',
  KK = 'KK',
  SIM = 'SIM',
  Motor = 'Motor',
  Deposito = 'Deposito',
}

export enum PembayaranType {
  Cash = 'Cash',
  Transfer = 'Transfer',
}

// DTO untuk additional cost item
export class AdditionalCostItemDto {
  @IsString({ message: 'Deskripsi biaya harus berupa string' })
  @IsNotEmpty({ message: 'Deskripsi biaya tidak boleh kosong' })
  description: string;

  @IsNumber({}, { message: 'Jumlah biaya harus berupa angka' })
  @Min(0, { message: 'Jumlah biaya tidak boleh negatif' })
  @IsNotEmpty({ message: 'Jumlah biaya tidak boleh kosong' })
  amount: number;

  @IsString({ message: 'Tipe biaya harus berupa string' })
  @IsIn(['discount', 'additional'], {
    message: 'Tipe biaya harus discount atau additional',
  })
  type: 'discount' | 'additional';
}

export class UpdateSewaDto {
  @IsOptional()
  @IsString({ message: 'Tanggal kembali harus berupa string' })
  @Validate(IsValidDateTimeFormatConstraint, {
    message: 'Format tanggal kembali harus YYYY-MM-DD atau YYYY-MM-DDTHH:mm',
  })
  tgl_kembali?: string;

  @IsOptional()
  @IsArray({ message: 'Jaminan harus berupa array' })
  @ArrayMinSize(1, { message: 'Pilih minimal 1 jaminan' })
  @IsEnum(JaminanType, {
    each: true,
    message: 'Jaminan harus salah satu dari: KTP, KK, SIM, Motor, Deposito',
  })
  jaminan?: JaminanType[];

  @IsOptional()
  @IsEnum(PembayaranType, {
    message: 'Metode pembayaran harus salah satu dari: Cash, Transfer',
  })
  pembayaran?: PembayaranType;

  // ✅ Field additional_costs
  @IsOptional()
  @IsArray({ message: 'Additional costs harus berupa array' })
  @ValidateNested({ each: true })
  @Type(() => AdditionalCostItemDto)
  additional_costs?: AdditionalCostItemDto[];

  @IsOptional()
  @IsString({ message: 'Catatan tambahan harus berupa string' })
  catatan_tambahan?: string;
}

import {
  IsString,
  IsInt,
  IsIn,
  IsOptional,
  Min,
  Validate,
  IsArray,
  ArrayMinSize,
  IsNotEmpty,
  ValidateNested,
  IsNumber,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  IsValidDateTimeFormatConstraint,
  IsReturnDateAfterRentalDateConstraint,
  IsRentalDateNotInPastConstraint,
} from './custom-validators';

// Constants yang konsisten
const SATUAN_DURASI_TYPES = ['hari', 'jam'] as const;
const JAMINAN_TYPES = ['KTP', 'KK', 'SIM', 'Motor', 'Deposito'] as const;
const PEMBAYARAN_TYPES = ['Cash', 'Transfer'] as const;

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

export class CreateSewaDto {
  @IsInt({ message: 'Motor ID harus berupa angka integer' })
  @Min(1, { message: 'Motor ID harus lebih dari 0' })
  @IsNotEmpty({ message: 'Motor ID harus diisi' })
  motor_id: number;

  @IsInt({ message: 'Penyewa ID harus berupa angka integer' })
  @Min(1, { message: 'Penyewa ID harus lebih dari 0' })
  @IsNotEmpty({ message: 'Penyewa ID harus diisi' })
  penyewa_id: number;

  @IsOptional()
  @IsArray({ message: 'Jaminan harus berupa array' })
  @ArrayMinSize(1, { message: 'Pilih minimal 1 jaminan' })
  @IsString({ each: true, message: 'Setiap jaminan harus berupa string' })
  @IsIn(JAMINAN_TYPES, {
    each: true,
    message: `Jaminan harus salah satu dari: ${JAMINAN_TYPES.join(', ')}`,
  })
  jaminan?: string[];

  @IsOptional()
  @IsString({ message: 'Pembayaran harus berupa string' })
  @IsIn(PEMBAYARAN_TYPES, {
    message: `Pembayaran harus salah satu dari: ${PEMBAYARAN_TYPES.join(', ')}`,
  })
  pembayaran?: string;

  @IsString({ message: 'Satuan durasi harus berupa string' })
  @IsIn(SATUAN_DURASI_TYPES, {
    message: `Satuan durasi harus salah satu dari: ${SATUAN_DURASI_TYPES.join(', ')}`,
  })
  @IsNotEmpty({ message: 'Satuan durasi harus diisi' })
  satuan_durasi: 'hari' | 'jam';

  @IsString({ message: 'Tanggal sewa harus berupa string' })
  @Validate(IsValidDateTimeFormatConstraint, {
    message: 'Format tanggal sewa harus YYYY-MM-DD atau YYYY-MM-DDTHH:mm',
  })
  @Validate(IsRentalDateNotInPastConstraint, {
    message: 'Tanggal sewa tidak boleh di masa lalu',
  })
  @IsNotEmpty({ message: 'Tanggal sewa harus diisi' })
  tgl_sewa: string;

  @IsString({ message: 'Tanggal kembali harus berupa string' })
  @Validate(IsValidDateTimeFormatConstraint, {
    message: 'Format tanggal kembali harus YYYY-MM-DD atau YYYY-MM-DDTHH:mm',
  })
  @Validate(IsReturnDateAfterRentalDateConstraint, {
    message: 'Tanggal kembali harus setelah tanggal sewa',
  })
  @IsNotEmpty({ message: 'Tanggal kembali harus diisi' })
  tgl_kembali: string;

  // ✅ Field untuk additional costs
  @IsOptional()
  @IsArray({ message: 'Additional costs harus berupa array' })
  @ValidateNested({ each: true })
  @Type(() => AdditionalCostItemDto)
  additional_costs?: AdditionalCostItemDto[];

  // ✅ Field untuk catatan tambahan
  @IsOptional()
  @IsString({ message: 'Catatan tambahan harus berupa string' })
  catatan_tambahan?: string;
}

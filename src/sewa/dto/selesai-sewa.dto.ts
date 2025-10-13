// src/sewa/dto/selesai-sewa.dto.ts
import { IsString, IsOptional, Validate } from 'class-validator';
import { IsValidDateTimeFormatConstraint } from './custom-validators';

export class SelesaiSewaDto {
  @IsString({ message: 'Tanggal selesai harus berupa string' })
  @Validate(IsValidDateTimeFormatConstraint, {
    message: 'Format tanggal selesai harus YYYY-MM-DD atau YYYY-MM-DDTHH:mm',
  })
  tgl_selesai: string;

  @IsOptional()
  @IsString({ message: 'Catatan harus berupa string' })
  catatan?: string;
}

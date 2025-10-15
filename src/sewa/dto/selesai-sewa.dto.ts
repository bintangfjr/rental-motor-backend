import { IsString, IsOptional, Validate } from 'class-validator';
import {
  IsValidDateTimeFormatConstraint,
  IsCompletionDateNotInFutureConstraint,
} from './custom-validators';

export class SelesaiSewaDto {
  @IsString({ message: 'Tanggal selesai harus berupa string' })
  @Validate(IsValidDateTimeFormatConstraint, {
    message: 'Format tanggal selesai harus YYYY-MM-DD atau YYYY-MM-DDTHH:mm',
  })
  @Validate(IsCompletionDateNotInFutureConstraint, {
    message: 'Tanggal selesai tidak boleh di masa depan',
  })
  tgl_selesai: string;

  @IsOptional()
  @IsString({ message: 'Catatan harus berupa string' })
  catatan?: string;
}

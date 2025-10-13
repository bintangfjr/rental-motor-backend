// src/sewa/dto/custom-validators.ts
import {
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
} from 'class-validator';
import { CreateSewaDto } from './create-sewa.dto';

// Helper function untuk parse date
function parseDateForValidation(dateString: string): Date {
  if (!dateString) return new Date();

  if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
    return new Date(dateString + 'T00:00:00');
  }
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(dateString)) {
    return new Date(dateString + ':00');
  }
  return new Date(dateString);
}

// Custom validator untuk format datetime
@ValidatorConstraint({ name: 'isValidDateTimeFormat', async: false })
export class IsValidDateTimeFormatConstraint
  implements ValidatorConstraintInterface
{
  validate(value: string) {
    if (!value) return false;

    const dateOnlyRegex = /^\d{4}-\d{2}-\d{2}$/;
    const dateTimeRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
    const isoRegex =
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})?$/;

    return (
      dateOnlyRegex.test(value) ||
      dateTimeRegex.test(value) ||
      isoRegex.test(value)
    );
  }

  defaultMessage() {
    return 'Format tanggal harus YYYY-MM-DD atau YYYY-MM-DDTHH:mm';
  }
}

// Custom validator untuk memastikan tanggal kembali setelah tanggal sewa
@ValidatorConstraint({ name: 'isReturnDateAfterRentalDate', async: false })
export class IsReturnDateAfterRentalDateConstraint
  implements ValidatorConstraintInterface
{
  validate(tglKembali: string, args: ValidationArguments) {
    const object = args.object as CreateSewaDto;
    if (!object.tgl_sewa || !tglKembali) return true;

    try {
      const tglSewaDate = parseDateForValidation(object.tgl_sewa);
      const tglKembaliDate = parseDateForValidation(tglKembali);
      return tglKembaliDate > tglSewaDate;
    } catch {
      return true;
    }
  }

  defaultMessage() {
    return 'Tanggal kembali harus setelah tanggal sewa';
  }
}

// Custom validator untuk memastikan tanggal sewa tidak di masa lalu
@ValidatorConstraint({ name: 'isRentalDateNotInPast', async: false })
export class IsRentalDateNotInPastConstraint
  implements ValidatorConstraintInterface
{
  validate(tglSewa: string) {
    if (!tglSewa) return true;

    try {
      const tglSewaDate = parseDateForValidation(tglSewa);
      const now = new Date();
      const tenMinutesAgo = new Date(now.getTime() - 10 * 60 * 1000);
      return tglSewaDate >= tenMinutesAgo;
    } catch {
      return true;
    }
  }

  defaultMessage() {
    return 'Tanggal sewa tidak boleh di masa lalu';
  }
}

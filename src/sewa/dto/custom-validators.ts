// src/sewa/dto/custom-validators.ts
import {
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
} from 'class-validator';
import { CreateSewaDto } from './create-sewa.dto';
import * as moment from 'moment-timezone';

// Helper function untuk parse date dengan timezone awareness
function parseDateForValidation(dateString: string): Date {
  if (!dateString) return new Date();

  console.log('🔧 [Validator] Parsing date:', dateString);

  try {
    let parsedDate: moment.Moment;

    if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
      // Format: '2025-10-15' (date only) - set ke 00:00 WIB
      parsedDate = moment.tz(dateString, 'Asia/Jakarta').startOf('day');
    } else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(dateString)) {
      // Format: '2025-10-15T14:30' (datetime without timezone) - assume WIB
      parsedDate = moment.tz(dateString, 'Asia/Jakarta');
    } else {
      // Other formats
      parsedDate = moment(dateString).tz('Asia/Jakarta');
    }

    const result = parsedDate.toDate();

    console.log('✅ [Validator] Parsed result:', {
      input: dateString,
      moment: parsedDate.format(),
      jsDate: result,
      iso: result.toISOString(),
      locale: result.toLocaleString('id-ID'),
    });

    return result;
  } catch (error) {
    console.error('❌ [Validator] Error parsing date:', error);
    // Fallback to original parsing
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
      return new Date(dateString + 'T00:00:00');
    }
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(dateString)) {
      return new Date(dateString + ':00');
    }
    return new Date(dateString);
  }
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
      console.log('🕐 [Validator] Comparing dates:');
      console.log('  - tgl_sewa:', object.tgl_sewa);
      console.log('  - tgl_kembali:', tglKembali);

      const tglSewaDate = parseDateForValidation(object.tgl_sewa);
      const tglKembaliDate = parseDateForValidation(tglKembali);

      console.log('  - parsed tgl_sewa:', tglSewaDate.toISOString());
      console.log('  - parsed tgl_kembali:', tglKembaliDate.toISOString());
      console.log('  - result:', tglKembaliDate > tglSewaDate);

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
      console.log('🕐 [Validator] Checking if rental date is not in past:');
      console.log('  - tgl_sewa:', tglSewa);

      const tglSewaDate = parseDateForValidation(tglSewa);
      // Gunakan waktu sekarang di timezone Asia/Jakarta
      const now = moment().tz('Asia/Jakarta').toDate();
      const tenMinutesAgo = new Date(now.getTime() - 10 * 60 * 1000);

      console.log('  - parsed tgl_sewa:', tglSewaDate.toISOString());
      console.log('  - now (WIB):', now.toISOString());
      console.log('  - tenMinutesAgo:', tenMinutesAgo.toISOString());
      console.log('  - result:', tglSewaDate >= tenMinutesAgo);

      return tglSewaDate >= tenMinutesAgo;
    } catch {
      return true;
    }
  }

  defaultMessage() {
    return 'Tanggal sewa tidak boleh di masa lalu';
  }
}

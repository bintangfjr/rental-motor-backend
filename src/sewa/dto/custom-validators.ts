import {
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
} from 'class-validator';
import * as moment from 'moment-timezone';

// Helper function untuk parse date dengan timezone WIB
function parseDateForValidation(dateString: string): moment.Moment {
  if (!dateString) return moment().tz('Asia/Jakarta');

  console.log('🔧 [Validator] Parsing date:', dateString);

  try {
    let parsedDate: moment.Moment;

    if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
      // Format: '2025-10-15' (date only) - set ke 00:00 WIB
      parsedDate = moment
        .tz(dateString, 'YYYY-MM-DD', 'Asia/Jakarta')
        .startOf('day');
    } else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(dateString)) {
      // Format: '2025-10-15T14:30' (datetime without timezone) - assume WIB
      parsedDate = moment.tz(dateString, 'YYYY-MM-DDTHH:mm', 'Asia/Jakarta');
    } else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.*/.test(dateString)) {
      // Format ISO dengan timezone - convert ke WIB
      parsedDate = moment(dateString).tz('Asia/Jakarta');
    } else {
      throw new Error('Format tanggal tidak valid');
    }

    if (!parsedDate.isValid()) {
      throw new Error('Tanggal tidak valid');
    }

    console.log('✅ [Validator] Parsed result:', {
      input: dateString,
      moment: parsedDate.format('YYYY-MM-DD HH:mm:ss'),
      iso: parsedDate.toISOString(),
      locale: parsedDate.format('DD/MM/YYYY HH:mm:ss'),
    });

    return parsedDate;
  } catch (error) {
    console.error('❌ [Validator] Error parsing date:', error);
    throw error;
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

    const isValid =
      dateOnlyRegex.test(value) ||
      dateTimeRegex.test(value) ||
      isoRegex.test(value);

    console.log('🔍 [Format Validator] Checking format:', {
      value,
      isValid,
    });

    return isValid;
  }

  defaultMessage() {
    return 'Format tanggal harus YYYY-MM-DD atau YYYY-MM-DDTHH:mm';
  }
}

// 🚨 STRICT VALIDATOR: Tanggal sewa tidak boleh di masa lalu (0 toleransi)
@ValidatorConstraint({ name: 'isRentalDateNotInPast', async: false })
export class IsRentalDateNotInPastConstraint
  implements ValidatorConstraintInterface
{
  validate(tglSewa: string) {
    if (!tglSewa) return true;

    try {
      console.log(
        '🕐 [STRICT Rental Date Validator] Checking if rental date is not in past:',
      );
      console.log('  - tgl_sewa:', tglSewa);

      const tglSewaMoment = parseDateForValidation(tglSewa);
      const sekarangMoment = moment().tz('Asia/Jakarta');

      console.log(
        '  - parsed tgl_sewa (WIB):',
        tglSewaMoment.format('DD/MM/YYYY HH:mm:ss'),
      );
      console.log(
        '  - sekarang (WIB):',
        sekarangMoment.format('DD/MM/YYYY HH:mm:ss'),
      );

      // 🚨 STRICT: 0 TOLERANSI - harus sama atau setelah waktu sekarang
      const isValid = tglSewaMoment.isSameOrAfter(sekarangMoment);
      console.log('  - result:', isValid);

      return isValid;
    } catch (error) {
      console.error('❌ [Rental Date Validator] Error:', error);
      return false;
    }
  }

  defaultMessage() {
    return 'Tanggal sewa tidak boleh di masa lalu';
  }
}

// Validator untuk memastikan tanggal kembali setelah tanggal sewa
@ValidatorConstraint({ name: 'isReturnDateAfterRentalDate', async: false })
export class IsReturnDateAfterRentalDateConstraint
  implements ValidatorConstraintInterface
{
  validate(tglKembali: string, args: ValidationArguments) {
    if (!tglKembali) return true;

    try {
      const object = args.object as any;
      const tglSewa = object.tgl_sewa;

      if (!tglSewa) return true;

      console.log(
        '🕐 [Return Date Validator] Comparing rental and return dates:',
      );
      console.log('  - tgl_sewa:', tglSewa);
      console.log('  - tgl_kembali:', tglKembali);

      const tglSewaMoment = parseDateForValidation(tglSewa);
      const tglKembaliMoment = parseDateForValidation(tglKembali);

      console.log(
        '  - tgl_sewa (WIB):',
        tglSewaMoment.format('DD/MM/YYYY HH:mm:ss'),
      );
      console.log(
        '  - tgl_kembali (WIB):',
        tglKembaliMoment.format('DD/MM/YYYY HH:mm:ss'),
      );
      console.log('  - result:', tglKembaliMoment.isAfter(tglSewaMoment));

      return tglKembaliMoment.isAfter(tglSewaMoment);
    } catch (error) {
      console.error('❌ [Return Date Validator] Error:', error);
      return false;
    }
  }

  defaultMessage() {
    return 'Tanggal kembali harus setelah tanggal sewa';
  }
}

// Validator untuk UpdateSewaDto - tanggal kembali harus di masa depan
@ValidatorConstraint({
  name: 'isReturnDateAfterExistingRentalDate',
  async: false,
})
export class IsReturnDateAfterExistingRentalDateConstraint
  implements ValidatorConstraintInterface
{
  validate(tglKembali: string, args: ValidationArguments) {
    if (!tglKembali) return true;

    try {
      console.log('🕐 [Update Return Date Validator] Validating return date:');
      console.log('  - tgl_kembali:', tglKembali);

      const tglKembaliMoment = parseDateForValidation(tglKembali);
      const sekarangMoment = moment().tz('Asia/Jakarta');

      console.log(
        '  - parsed tgl_kembali (WIB):',
        tglKembaliMoment.format('DD/MM/YYYY HH:mm:ss'),
      );
      console.log(
        '  - sekarang (WIB):',
        sekarangMoment.format('DD/MM/YYYY HH:mm:ss'),
      );
      console.log('  - result:', tglKembaliMoment.isAfter(sekarangMoment));

      // Untuk update, pastikan tanggal kembali tidak di masa lalu
      return tglKembaliMoment.isAfter(sekarangMoment);
    } catch (error) {
      console.error('❌ [Update Return Date Validator] Error:', error);
      return false;
    }
  }

  defaultMessage() {
    return 'Tanggal kembali harus di masa depan';
  }
}

// 🚨 STRICT VALIDATOR: Tanggal selesai tidak boleh di masa depan
@ValidatorConstraint({ name: 'isCompletionDateNotInFuture', async: false })
export class IsCompletionDateNotInFutureConstraint
  implements ValidatorConstraintInterface
{
  validate(tglSelesai: string) {
    if (!tglSelesai) return true;

    try {
      console.log(
        '🕐 [Completion Date Validator] Checking if completion date is not in future:',
      );
      console.log('  - tgl_selesai:', tglSelesai);

      const tglSelesaiMoment = parseDateForValidation(tglSelesai);
      const sekarangMoment = moment().tz('Asia/Jakarta');

      console.log(
        '  - parsed tgl_selesai (WIB):',
        tglSelesaiMoment.format('DD/MM/YYYY HH:mm:ss'),
      );
      console.log(
        '  - sekarang (WIB):',
        sekarangMoment.format('DD/MM/YYYY HH:mm:ss'),
      );
      console.log(
        '  - result:',
        tglSelesaiMoment.isSameOrBefore(sekarangMoment),
      );

      // Tanggal selesai tidak boleh di masa depan
      return tglSelesaiMoment.isSameOrBefore(sekarangMoment);
    } catch (error) {
      console.error('❌ [Completion Date Validator] Error:', error);
      return false;
    }
  }

  defaultMessage() {
    return 'Tanggal selesai tidak boleh di masa depan';
  }
}

// src/sewa/dto/custom-validators.ts
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

// Validator untuk memastikan tanggal sewa tidak di masa lalu
@ValidatorConstraint({ name: 'isRentalDateNotInPast', async: false })
export class IsRentalDateNotInPastConstraint
  implements ValidatorConstraintInterface
{
  validate(tglSewa: string) {
    if (!tglSewa) return true;

    try {
      console.log(
        '🕐 [Rental Date Validator] Checking if rental date is not in past:',
      );
      console.log('  - tgl_sewa:', tglSewa);

      const tglSewaMoment = parseDateForValidation(tglSewa);
      const sekarangMoment = moment().tz('Asia/Jakarta');
      const sepuluhMenitLalu = sekarangMoment.clone().subtract(10, 'minutes');

      console.log(
        '  - parsed tgl_sewa (WIB):',
        tglSewaMoment.format('DD/MM/YYYY HH:mm:ss'),
      );
      console.log(
        '  - sekarang (WIB):',
        sekarangMoment.format('DD/MM/YYYY HH:mm:ss'),
      );
      console.log(
        '  - sepuluhMenitLalu (WIB):',
        sepuluhMenitLalu.format('DD/MM/YYYY HH:mm:ss'),
      );
      console.log('  - result:', tglSewaMoment.isSameOrAfter(sepuluhMenitLalu));

      return tglSewaMoment.isSameOrAfter(sepuluhMenitLalu);
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

// Validator untuk UpdateSewaDto - bandingkan dengan existing tgl_sewa
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

// Validator untuk tanggal selesai tidak di masa lalu
@ValidatorConstraint({ name: 'isCompletionDateNotInPast', async: false })
export class IsCompletionDateNotInPastConstraint
  implements ValidatorConstraintInterface
{
  validate(tglSelesai: string) {
    if (!tglSelesai) return true;

    try {
      console.log(
        '🕐 [Completion Date Validator] Checking if completion date is not in past:',
      );
      console.log('  - tgl_selesai:', tglSelesai);

      const tglSelesaiMoment = parseDateForValidation(tglSelesai);
      const sekarangMoment = moment().tz('Asia/Jakarta');
      const sepuluhMenitLalu = sekarangMoment.clone().subtract(10, 'minutes');

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
        tglSelesaiMoment.isSameOrAfter(sepuluhMenitLalu),
      );

      return tglSelesaiMoment.isSameOrAfter(sepuluhMenitLalu);
    } catch (error) {
      console.error('❌ [Completion Date Validator] Error:', error);
      return false;
    }
  }

  defaultMessage() {
    return 'Tanggal selesai tidak boleh di masa lalu';
  }
}

// Validator business logic untuk service layer
export class SewaDateValidator {
  static validateRentalDates(
    tglSewa: string,
    tglKembali: string,
    satuanDurasi: string,
  ): { isValid: boolean; error?: string } {
    try {
      console.log('🔍 [Business Validator] Validating rental dates:');
      console.log('  - tgl_sewa:', tglSewa);
      console.log('  - tgl_kembali:', tglKembali);
      console.log('  - satuan_durasi:', satuanDurasi);

      const tglSewaMoment = parseDateForValidation(tglSewa);
      const tglKembaliMoment = parseDateForValidation(tglKembali);
      const sekarangMoment = moment().tz('Asia/Jakarta');
      const sepuluhMenitLalu = sekarangMoment.clone().subtract(10, 'minutes');

      // Validasi tanggal sewa tidak di masa lalu
      if (tglSewaMoment.isBefore(sepuluhMenitLalu)) {
        return {
          isValid: false,
          error: 'Tanggal sewa tidak boleh di masa lalu',
        };
      }

      // Validasi tanggal kembali setelah tanggal sewa
      if (tglKembaliMoment.isSameOrBefore(tglSewaMoment)) {
        return {
          isValid: false,
          error: 'Tanggal kembali harus setelah tanggal sewa',
        };
      }

      // Validasi durasi minimal
      const minDuration = satuanDurasi === 'jam' ? 1 : 1;
      const actualDuration =
        satuanDurasi === 'jam'
          ? tglKembaliMoment.diff(tglSewaMoment, 'hours', true)
          : tglKembaliMoment.diff(tglSewaMoment, 'days', true);

      if (actualDuration < minDuration) {
        return {
          isValid: false,
          error: `Durasi sewa minimal ${minDuration} ${satuanDurasi}`,
        };
      }

      console.log('✅ [Business Validator] All validations passed');
      return { isValid: true };
    } catch (error) {
      console.error('❌ [Business Validator] Error:', error);
      return {
        isValid: false,
        error: 'Error validasi tanggal',
      };
    }
  }

  static validateUpdateDates(
    existingTglSewa: Date,
    newTglKembali: string,
    satuanDurasi: string,
  ): { isValid: boolean; error?: string } {
    try {
      console.log('🔍 [Business Update Validator] Validating update dates:');
      console.log('  - existing_tgl_sewa:', existingTglSewa);
      console.log('  - new_tgl_kembali:', newTglKembali);
      console.log('  - satuan_durasi:', satuanDurasi);

      const tglSewaWIB = moment(existingTglSewa).tz('Asia/Jakarta');
      const tglKembaliWIB = parseDateForValidation(newTglKembali);
      const sekarangMoment = moment().tz('Asia/Jakarta');

      console.log(
        '  - existing tgl_sewa (WIB):',
        tglSewaWIB.format('DD/MM/YYYY HH:mm:ss'),
      );
      console.log(
        '  - new tgl_kembali (WIB):',
        tglKembaliWIB.format('DD/MM/YYYY HH:mm:ss'),
      );
      console.log(
        '  - sekarang (WIB):',
        sekarangMoment.format('DD/MM/YYYY HH:mm:ss'),
      );

      // Validasi tanggal kembali tidak di masa lalu
      if (tglKembaliWIB.isBefore(sekarangMoment)) {
        return {
          isValid: false,
          error: 'Tanggal kembali harus di masa depan',
        };
      }

      // Validasi tanggal kembali setelah tanggal sewa
      if (tglKembaliWIB.isSameOrBefore(tglSewaWIB)) {
        return {
          isValid: false,
          error: 'Tanggal kembali harus setelah tanggal sewa',
        };
      }

      // Validasi durasi minimal
      const minDuration = satuanDurasi === 'jam' ? 1 : 1;
      const actualDuration =
        satuanDurasi === 'jam'
          ? tglKembaliWIB.diff(tglSewaWIB, 'hours', true)
          : tglKembaliWIB.diff(tglSewaWIB, 'days', true);

      if (actualDuration < minDuration) {
        return {
          isValid: false,
          error: `Durasi sewa minimal ${minDuration} ${satuanDurasi}`,
        };
      }

      console.log('✅ [Business Update Validator] All validations passed');
      return { isValid: true };
    } catch (error) {
      console.error('❌ [Business Update Validator] Error:', error);
      return {
        isValid: false,
        error: 'Error validasi tanggal',
      };
    }
  }

  static validateCompletionDate(
    tglSelesai: string,
    tglKembaliJadwal: Date,
  ): { isValid: boolean; error?: string } {
    try {
      console.log(
        '🔍 [Business Completion Validator] Validating completion date:',
      );
      console.log('  - tgl_selesai:', tglSelesai);
      console.log('  - tgl_kembali_jadwal:', tglKembaliJadwal);

      const tglSelesaiMoment = parseDateForValidation(tglSelesai);
      const tglKembaliMoment = moment(tglKembaliJadwal).tz('Asia/Jakarta');
      const sekarangMoment = moment().tz('Asia/Jakarta');
      const sepuluhMenitLalu = sekarangMoment.clone().subtract(10, 'minutes');

      // Validasi tanggal selesai tidak di masa lalu
      if (tglSelesaiMoment.isBefore(sepuluhMenitLalu)) {
        return {
          isValid: false,
          error: 'Tanggal selesai tidak boleh di masa lalu',
        };
      }

      // PERBAIKAN: Variable tglKembaliMoment sekarang digunakan
      // Validasi bahwa tanggal selesai tidak lebih dari 7 hari sebelum tanggal kembali jadwal
      // (opsional, tergantung business rule)
      if (
        tglSelesaiMoment.isBefore(tglKembaliMoment.clone().subtract(7, 'days'))
      ) {
        return {
          isValid: false,
          error:
            'Tanggal selesai tidak boleh lebih dari 7 hari sebelum tanggal kembali jadwal',
        };
      }

      console.log('📅 Completion date details:', {
        tgl_selesai: tglSelesaiMoment.format('DD/MM/YYYY HH:mm:ss'),
        tgl_kembali_jadwal: tglKembaliMoment.format('DD/MM/YYYY HH:mm:ss'),
        selisih_hari: tglKembaliMoment.diff(tglSelesaiMoment, 'days'),
      });

      console.log('✅ [Business Completion Validator] Validation passed');
      return { isValid: true };
    } catch (error) {
      console.error('❌ [Business Completion Validator] Error:', error);
      return {
        isValid: false,
        error: 'Error validasi tanggal selesai',
      };
    }
  }
}

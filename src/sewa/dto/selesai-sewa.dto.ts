import * as moment from 'moment-timezone';

// Helper function untuk parse date dengan timezone
function parseDateForValidation(dateString: string): Date {
  if (!dateString) return new Date();

  try {
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
      return moment.tz(dateString, 'Asia/Jakarta').startOf('day').toDate();
    }
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(dateString)) {
      return moment.tz(dateString, 'Asia/Jakarta').toDate();
    }
    return moment(dateString).tz('Asia/Jakarta').toDate();
  } catch {
    return new Date(dateString);
  }
}

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

@ValidatorConstraint({ name: 'isRentalDateNotInPast', async: false })
export class IsRentalDateNotInPastConstraint
  implements ValidatorConstraintInterface
{
  validate(tglSewa: string) {
    if (!tglSewa) return true;

    try {
      const tglSewaDate = parseDateForValidation(tglSewa);
      const now = moment().tz('Asia/Jakarta').toDate();
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

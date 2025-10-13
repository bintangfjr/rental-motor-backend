// admin/dto/create-admin.dto.ts
import {
  IsString,
  IsEmail,
  IsBoolean,
  IsOptional,
  MinLength,
  Matches,
  Validate,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
} from 'class-validator';

// Custom validator untuk password confirmation
@ValidatorConstraint({ name: 'passwordMatch', async: false })
export class PasswordMatchConstraint implements ValidatorConstraintInterface {
  validate(passwordConfirmation: string, args: ValidationArguments) {
    const object = args.object as CreateAdminDto;
    return object.password === passwordConfirmation;
  }

  defaultMessage(args: ValidationArguments) {
    return 'Konfirmasi password tidak sesuai';
  }
}

export class CreateAdminDto {
  @IsString()
  @MinLength(1, { message: 'Nama lengkap harus diisi' })
  nama_lengkap: string;

  @IsString()
  @MinLength(3, { message: 'Username minimal 3 karakter' })
  username: string;

  @IsEmail({}, { message: 'Email tidak valid' })
  email: string;

  @IsString()
  @MinLength(8, { message: 'Password minimal 8 karakter' })
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, {
    message: 'Password harus mengandung huruf besar, huruf kecil, dan angka',
  })
  password: string;

  @IsString()
  @MinLength(8, { message: 'Konfirmasi password minimal 8 karakter' })
  @Validate(PasswordMatchConstraint) // Gunakan custom validator
  password_confirmation: string;

  @IsBoolean()
  @IsOptional()
  is_super_admin?: boolean = false;
}

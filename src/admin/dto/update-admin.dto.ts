import {
  IsString,
  IsEmail,
  IsBoolean,
  IsOptional,
  MinLength,
  Matches,
} from 'class-validator';

export class UpdateAdminDto {
  @IsString()
  @MinLength(1, { message: 'Nama lengkap harus diisi' })
  @IsOptional()
  nama_lengkap?: string;

  @IsString()
  @MinLength(3, { message: 'Username minimal 3 karakter' })
  @IsOptional()
  username?: string;

  @IsEmail({}, { message: 'Email tidak valid' })
  @IsOptional()
  email?: string;

  @IsString()
  @MinLength(8, { message: 'Password minimal 8 karakter' })
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, {
    message: 'Password harus mengandung huruf besar, huruf kecil, dan angka',
  })
  @IsOptional()
  password?: string;

  @IsBoolean()
  @IsOptional()
  is_super_admin?: boolean;
}

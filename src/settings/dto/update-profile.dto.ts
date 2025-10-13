import { IsString, IsEmail, MinLength, MaxLength } from 'class-validator';

export class UpdateProfileDto {
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  nama_lengkap: string;

  @IsString()
  @MinLength(3)
  @MaxLength(255)
  username: string;

  @IsEmail()
  @MaxLength(255)
  email: string;
}

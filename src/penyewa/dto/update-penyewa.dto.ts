import { IsString, IsOptional, Length, IsPhoneNumber } from 'class-validator';

export class UpdatePenyewaDto {
  @IsString()
  @Length(1, 255)
  nama: string;

  @IsString()
  @IsOptional()
  alamat?: string;

  @IsString()
  @Length(1, 20)
  no_whatsapp: string;

  @IsOptional()
  foto_ktp?: any;
}

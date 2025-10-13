import { IsString, IsOptional, Length, IsPhoneNumber } from 'class-validator';

export class CreatePenyewaDto {
  @IsString()
  @Length(1, 255)
  nama: string;

  @IsString()
  @IsOptional()
  alamat?: string;

  @IsPhoneNumber('ID') // validasi khusus nomor telepon Indonesia (+62)
  no_whatsapp: string;

  @IsOptional()
  foto_ktp?: any; // nanti ditangani dengan FileInterceptor di Controller
}

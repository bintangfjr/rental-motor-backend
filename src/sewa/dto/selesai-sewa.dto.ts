import { IsString, IsOptional } from 'class-validator';

export class SelesaiSewaDto {
  @IsString()
  tgl_selesai: string;

  @IsOptional()
  @IsString()
  catatan?: string;
}

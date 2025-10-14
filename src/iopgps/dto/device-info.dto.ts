import { IsNotEmpty, IsString, IsOptional } from 'class-validator';

export class DeviceInfoDto {
  @IsString()
  @IsNotEmpty()
  imei: string;

  @IsOptional()
  @IsString()
  lang?: string; // default: 'en'
}

import { IsOptional, IsString, IsNumberString } from 'class-validator';

export class DeviceListDto {
  @IsOptional()
  @IsString()
  id?: string;

  @IsOptional()
  @IsNumberString()
  currentPage?: string = '1'; // Optional dengan default

  @IsOptional()
  @IsNumberString()
  pageSize?: string = '20'; // Optional dengan default
}

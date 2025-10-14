import { IsOptional, IsString, IsNumber } from 'class-validator';

export class DeviceListDto {
  @IsOptional()
  @IsString()
  account?: string;

  @IsNumber()
  pageNum: number;

  @IsNumber()
  pageSize: number;

  @IsOptional()
  @IsString()
  lang?: string; // default: 'en'
}

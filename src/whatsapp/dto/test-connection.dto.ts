import { IsString, IsOptional } from 'class-validator';

export class TestConnectionDto {
  @IsString()
  @IsOptional()
  api_key?: string;

  @IsString()
  @IsOptional()
  fonnte_number?: string;
}

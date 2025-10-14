import { IsNotEmpty, IsNumber, IsString } from 'class-validator';

export class IopgpsAuthDto {
  @IsString()
  @IsNotEmpty()
  appid: string;

  @IsNumber()
  time: number;

  @IsString()
  @IsNotEmpty()
  signature: string;
}

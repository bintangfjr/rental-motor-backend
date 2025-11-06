import {
  IsNotEmpty,
  IsString,
  IsOptional,
  IsNumber,
  Min,
} from 'class-validator';

export class MileageDto {
  @IsString()
  @IsNotEmpty()
  imei: string;

  @IsNumber()
  @IsNotEmpty()
  @Min(1)
  startTime: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  endTime?: string;
}

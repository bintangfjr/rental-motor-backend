import {
  IsNumber,
  IsOptional,
  IsString,
  Min,
  IsDateString,
} from 'class-validator';

export class CompleteServiceDto {
  @IsNumber()
  @Min(0)
  actual_cost: number;

  @IsDateString()
  @IsOptional()
  actual_completion?: string;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsString()
  @IsOptional()
  service_summary?: string;
}

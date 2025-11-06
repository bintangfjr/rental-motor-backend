import { IsNumber, IsOptional, Min } from 'class-validator';

export class ServiceCostDto {
  @IsNumber()
  @Min(0)
  estimated_cost: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  actual_cost?: number;
}

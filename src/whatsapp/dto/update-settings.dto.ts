import { IsString, IsOptional, IsBoolean } from 'class-validator';

export class UpdateSettingsDto {
  @IsString()
  @IsOptional()
  api_key?: string;

  @IsString()
  @IsOptional()
  fonnte_number?: string;

  @IsString()
  @IsOptional()
  admin_numbers?: string;

  @IsString()
  @IsOptional()
  reminder_template?: string;

  @IsString()
  @IsOptional()
  alert_template?: string;

  @IsBoolean()
  @IsOptional()
  auto_notifications?: boolean;
}

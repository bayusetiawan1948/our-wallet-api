import { IsIn, IsNumber, IsOptional, IsString, Length, Min } from 'class-validator';

export class UpdateGoalDto {
  @IsOptional()
  @IsString({ message: 'name must be a string' })
  @Length(1, 255, {
    message: 'name length must be between 1 and 255 characters',
  })
  name?: string;

  @IsOptional()
  @IsNumber({}, { message: 'target_amount must be a number' })
  @Min(0.01, { message: 'target_amount must be greater than zero' })
  target_amount?: number;

  @IsOptional()
  @IsString({ message: 'target_date must be a string (YYYY-MM-DD)' })
  target_date?: string;

  @IsOptional()
  @IsIn(['active', 'completed', 'cancelled'], {
    message: 'status must be one of active, completed, cancelled',
  })
  status?: 'active' | 'completed' | 'cancelled';
}

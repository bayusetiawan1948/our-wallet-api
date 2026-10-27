import {
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Min,
} from 'class-validator';

export class UpdateBudgetDto {
  @IsOptional()
  @IsUUID('4', { message: 'category_id must be a valid UUID' })
  category_id?: string;

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
  @IsIn(['weekly', 'monthly', 'yearly'], {
    message: 'period must be one of weekly, monthly, yearly',
  })
  period?: 'weekly' | 'monthly' | 'yearly';
}

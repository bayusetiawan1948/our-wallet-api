import {
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Min,
} from 'class-validator';

export class CreateBudgetDto {
  @IsNotEmpty({ message: 'owner_type is required' })
  @IsIn(['user', 'household'], {
    message: 'owner_type must be either user or household',
  })
  owner_type!: 'user' | 'household';

  @IsNotEmpty({ message: 'category_id is required' })
  @IsUUID('4', { message: 'category_id must be a valid UUID' })
  category_id!: string;

  @IsNotEmpty({ message: 'name is required' })
  @IsString({ message: 'name must be a string' })
  @Length(1, 255, {
    message: 'name length must be between 1 and 255 characters',
  })
  name!: string;

  @IsNotEmpty({ message: 'target_amount is required' })
  @IsNumber({}, { message: 'target_amount must be a number' })
  @Min(0.01, { message: 'target_amount must be greater than zero' })
  target_amount!: number;

  @IsNotEmpty({ message: 'period is required' })
  @IsIn(['weekly', 'monthly', 'yearly'], {
    message: 'period must be one of weekly, monthly, yearly',
  })
  period!: 'weekly' | 'monthly' | 'yearly';

  @IsOptional()
  @IsString({ message: 'start_date must be a string (YYYY-MM-DD)' })
  start_date?: string;
}

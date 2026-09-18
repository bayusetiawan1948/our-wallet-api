import {
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsUUID,
  Min,
  ValidateIf,
} from 'class-validator';

export class CreateReservationDto {
  @IsNotEmpty({ message: 'wallet_id is required' })
  @IsUUID('4', { message: 'wallet_id must be a valid UUID' })
  wallet_id!: string;

  @ValidateIf((o) => !o.goal_id)
  @IsNotEmpty({ message: 'budget_id or goal_id is required' })
  @IsUUID('4', { message: 'budget_id must be a valid UUID' })
  budget_id?: string;

  @ValidateIf((o) => !o.budget_id)
  @IsNotEmpty({ message: 'budget_id or goal_id is required' })
  @IsUUID('4', { message: 'goal_id must be a valid UUID' })
  goal_id?: string;

  @IsNotEmpty({ message: 'reserved_amount is required' })
  @IsNumber({}, { message: 'reserved_amount must be a number' })
  @Min(0, { message: 'reserved_amount cannot be negative' })
  reserved_amount!: number;

  @IsOptional()
  @IsIn(['manual', 'percentage', 'formula'], {
    message: 'allocation_method must be one of manual, percentage, formula',
  })
  allocation_method?: 'manual' | 'percentage' | 'formula';

  @IsOptional()
  @IsObject({ message: 'allocation_config must be an object' })
  allocation_config?: Record<string, unknown>;
}

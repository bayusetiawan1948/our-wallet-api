import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

export class EncroachmentAllocationDto {
  @ValidateIf((o) => !o.goal_id)
  @IsUUID('4', { message: 'budget_id must be a valid UUID' })
  budget_id?: string;

  @ValidateIf((o) => !o.budget_id)
  @IsUUID('4', { message: 'goal_id must be a valid UUID' })
  goal_id?: string;

  @IsNumber({}, { message: 'amount must be a number' })
  @Min(0.01, { message: 'amount must be greater than zero' })
  amount!: number;
}

export class CreateTransactionDto {
  @IsNotEmpty({ message: 'wallet_id is required' })
  @IsUUID('4', { message: 'wallet_id must be a valid UUID' })
  wallet_id!: string;

  @IsNotEmpty({ message: 'category_id is required' })
  @IsUUID('4', { message: 'category_id must be a valid UUID' })
  category_id!: string;

  @IsOptional()
  @IsUUID('4', { message: 'owner_id must be a valid UUID' })
  owner_id?: string;

  @IsNotEmpty({ message: 'type is required' })
  @IsIn(['income', 'expense'], {
    message: 'type must be either income or expense',
  })
  type!: 'income' | 'expense';

  @IsNotEmpty({ message: 'amount is required' })
  @IsNumber({}, { message: 'amount must be a number' })
  @Min(0.01, { message: 'amount must be greater than zero' })
  amount!: number;

  @IsNotEmpty({ message: 'date is required' })
  @IsString({ message: 'date must be a string (YYYY-MM-DD)' })
  date!: string;

  @IsOptional()
  @IsString({ message: 'note must be a string' })
  @Length(0, 1000, { message: 'note is too long' })
  note?: string;

  @IsOptional()
  @IsString({ message: 'attachment_url must be a string' })
  @Length(0, 500, { message: 'attachment_url is too long' })
  attachment_url?: string;

  @IsOptional()
  @IsArray({ message: 'encroachments must be an array' })
  @ValidateNested({ each: true })
  @Type(() => EncroachmentAllocationDto)
  encroachments?: EncroachmentAllocationDto[];
}

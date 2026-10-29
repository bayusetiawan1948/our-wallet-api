import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsISO8601,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Min,
  ValidateNested,
} from 'class-validator';

export const BULK_MAX_ITEMS = 1000;

export class BulkTransactionItemDto {
  @IsNotEmpty({ message: 'category_id is required' })
  @IsUUID('4', { message: 'category_id must be a valid UUID' })
  category_id!: string;

  @IsNotEmpty({ message: 'type is required' })
  @IsIn(['income', 'expense'], {
    message: 'type must be either income or expense',
  })
  type!: 'income' | 'expense';

  @IsNotEmpty({ message: 'amount is required' })
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'amount must be a number' })
  @Min(0.01, { message: 'amount must be greater than zero' })
  amount!: number;

  @IsNotEmpty({ message: 'date is required' })
  @IsISO8601(
    { strict: true },
    {
      message:
        'date must be an ISO 8601 datetime (e.g. 2026-10-29T14:30:00+07:00)',
    },
  )
  date!: string;

  @IsOptional()
  @IsString({ message: 'note must be a string' })
  @Length(0, 1000, { message: 'note is too long' })
  note?: string;
}

export class BulkCreateTransactionsDto {
  @IsNotEmpty({ message: 'wallet_id is required' })
  @IsUUID('4', { message: 'wallet_id must be a valid UUID' })
  wallet_id!: string;

  @IsOptional()
  @IsUUID('4', { message: 'owner_id must be a valid UUID' })
  owner_id?: string;

  @IsArray({ message: 'items must be an array' })
  @ArrayMinSize(1, { message: 'items must contain at least one transaction' })
  @ArrayMaxSize(BULK_MAX_ITEMS, {
    message: `items must contain at most ${BULK_MAX_ITEMS} transactions`,
  })
  @ValidateNested({ each: true })
  @Type(() => BulkTransactionItemDto)
  items!: BulkTransactionItemDto[];
}

export class CheckDuplicatesItemDto {
  @IsIn(['income', 'expense'], {
    message: 'type must be either income or expense',
  })
  type!: 'income' | 'expense';

  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'amount must be a number' })
  @Min(0.01, { message: 'amount must be greater than zero' })
  amount!: number;

  @IsISO8601({ strict: true }, { message: 'date must be an ISO 8601 datetime' })
  date!: string;

  @IsOptional()
  @IsString({ message: 'note must be a string' })
  @Length(0, 1000, { message: 'note is too long' })
  note?: string;
}

export class CheckDuplicatesDto {
  @IsNotEmpty({ message: 'wallet_id is required' })
  @IsUUID('4', { message: 'wallet_id must be a valid UUID' })
  wallet_id!: string;

  @IsArray({ message: 'items must be an array' })
  @ArrayMaxSize(BULK_MAX_ITEMS, {
    message: `items must contain at most ${BULK_MAX_ITEMS} transactions`,
  })
  @ValidateNested({ each: true })
  @Type(() => CheckDuplicatesItemDto)
  items!: CheckDuplicatesItemDto[];
}

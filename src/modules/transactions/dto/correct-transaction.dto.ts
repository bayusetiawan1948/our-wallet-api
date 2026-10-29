import {
  IsIn,
  IsISO8601,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Min,
} from 'class-validator';

export class CorrectTransactionDto {
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

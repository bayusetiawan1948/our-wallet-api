import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';

export class CreateTransferDto {
  @IsNotEmpty({ message: 'from_wallet_id is required' })
  @IsUUID('4', { message: 'from_wallet_id must be a valid UUID' })
  from_wallet_id!: string;

  @IsNotEmpty({ message: 'to_wallet_id is required' })
  @IsUUID('4', { message: 'to_wallet_id must be a valid UUID' })
  to_wallet_id!: string;

  @IsNotEmpty({ message: 'amount is required' })
  @IsNumber({}, { message: 'amount must be a number' })
  @Min(0.01, { message: 'amount must be greater than zero' })
  amount!: number;

  @IsOptional()
  @IsNumber({}, { message: 'fee must be a number' })
  @Min(0, { message: 'fee cannot be negative' })
  fee?: number;

  @IsNotEmpty({ message: 'date is required' })
  @IsString({ message: 'date must be a string (YYYY-MM-DD)' })
  date!: string;
}

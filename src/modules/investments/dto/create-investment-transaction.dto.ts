import {
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsString,
  IsUUID,
  Min,
  ValidateIf,
} from 'class-validator';

export class CreateInvestmentTransactionDto {
  // Kepemilikan awal (opening) tidak terhubung ke wallet.
  @ValidateIf((o) => o.type !== 'opening')
  @IsNotEmpty({ message: 'wallet_id is required' })
  @IsUUID('4', { message: 'wallet_id must be a valid UUID' })
  wallet_id?: string;

  @IsNotEmpty({ message: 'type is required' })
  @IsIn(['buy', 'sell', 'opening'], {
    message: 'type must be one of buy, sell, opening',
  })
  type!: 'buy' | 'sell' | 'opening';

  @IsNotEmpty({ message: 'quantity is required' })
  @IsNumber({}, { message: 'quantity must be a number' })
  @Min(0.00000001, { message: 'quantity must be greater than zero' })
  quantity!: number;

  @IsNotEmpty({ message: 'price is required' })
  @IsNumber({}, { message: 'price must be a number' })
  @Min(0, { message: 'price cannot be negative' })
  price!: number;

  @IsNotEmpty({ message: 'date is required' })
  @IsString({ message: 'date must be a string (YYYY-MM-DD)' })
  date!: string;
}

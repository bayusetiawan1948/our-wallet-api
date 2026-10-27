import {
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Min,
} from 'class-validator';

export class UpdateDebtDto {
  @IsOptional()
  @IsIn(['utang', 'piutang'], {
    message: 'type must be either utang or piutang',
  })
  type?: 'utang' | 'piutang';

  @IsOptional()
  @IsString({ message: 'counterparty must be a string' })
  @Length(1, 255, {
    message: 'counterparty length must be between 1 and 255 characters',
  })
  counterparty?: string;

  @IsOptional()
  @IsNumber({}, { message: 'principal must be a number' })
  @Min(0.01, { message: 'principal must be greater than zero' })
  principal?: number;

  @IsOptional()
  @IsUUID('4', { message: 'wallet_id must be a valid UUID' })
  wallet_id?: string;

  @IsOptional()
  @IsNumber({}, { message: 'opening_paid must be a number' })
  @Min(0, { message: 'opening_paid cannot be negative' })
  opening_paid?: number;

  @IsOptional()
  @IsNumber({}, { message: 'portion_admin must be a number' })
  @Min(0, { message: 'portion_admin cannot be negative' })
  portion_admin?: number;

  @IsOptional()
  @IsNumber({}, { message: 'portion_member must be a number' })
  @Min(0, { message: 'portion_member cannot be negative' })
  portion_member?: number;

  @IsOptional()
  @IsString({ message: 'due_date must be a string (YYYY-MM-DD)' })
  due_date?: string;

  @IsOptional()
  @IsString({ message: 'note must be a string' })
  @Length(0, 1000, { message: 'note is too long' })
  note?: string;

  @IsOptional()
  @IsIn(['cancelled'], {
    message: 'status can only be manually set to cancelled',
  })
  status?: 'cancelled';
}

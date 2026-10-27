import {
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Min,
} from 'class-validator';

export class CreateDebtDto {
  @IsNotEmpty({ message: 'owner_type is required' })
  @IsIn(['user', 'household'], {
    message: 'owner_type must be either user or household',
  })
  owner_type!: 'user' | 'household';

  @IsNotEmpty({ message: 'type is required' })
  @IsIn(['utang', 'piutang'], {
    message: 'type must be either utang or piutang',
  })
  type!: 'utang' | 'piutang';

  @IsNotEmpty({ message: 'counterparty is required' })
  @IsString({ message: 'counterparty must be a string' })
  @Length(1, 255, {
    message: 'counterparty length must be between 1 and 255 characters',
  })
  counterparty!: string;

  @IsNotEmpty({ message: 'principal is required' })
  @IsNumber({}, { message: 'principal must be a number' })
  @Min(0.01, { message: 'principal must be greater than zero' })
  principal!: number;

  // Debt baru: wajib diisi, dana pokok masuk/keluar dari dompet ini.
  // Debt lama (is_opening): tidak boleh diisi, saldo tidak berubah.
  @IsOptional()
  @IsUUID('4', { message: 'wallet_id must be a valid UUID' })
  wallet_id?: string;

  @IsOptional()
  @IsBoolean({ message: 'is_opening must be a boolean' })
  is_opening?: boolean;

  @IsOptional()
  @IsNumber({}, { message: 'opening_paid must be a number' })
  @Min(0, { message: 'opening_paid cannot be negative' })
  opening_paid?: number;

  @IsOptional()
  @IsString({ message: 'date must be a string (YYYY-MM-DD)' })
  date?: string;

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
}

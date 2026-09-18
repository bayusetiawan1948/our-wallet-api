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
import type { WalletOwnerType, WalletType } from '../wallets.type.js';

export class CreateWalletDto {
  @IsNotEmpty({ message: 'owner_type is required' })
  @IsIn(['user', 'household'], {
    message: 'owner_type must be either user or household',
  })
  owner_type!: WalletOwnerType;

  @IsOptional()
  @IsUUID('4', { message: 'owner_user_id must be a valid UUID' })
  owner_user_id?: string;

  @IsNotEmpty({ message: 'name is required' })
  @IsString({ message: 'name must be a string' })
  @Length(1, 255, {
    message: 'name length must be between 1 and 255 characters',
  })
  name!: string;

  @IsNotEmpty({ message: 'type is required' })
  @IsIn(['bank', 'ewallet', 'cash'], {
    message: 'type must be either bank, ewallet, or cash',
  })
  type!: WalletType;

  @IsOptional()
  @IsString({ message: 'currency must be a string' })
  @Length(3, 10, {
    message: 'currency length must be between 3 and 10 characters',
  })
  currency?: string;

  @IsOptional()
  @IsNumber({}, { message: 'initial_balance must be a number' })
  @Min(0, { message: 'initial_balance cannot be negative' })
  initial_balance?: number;
}

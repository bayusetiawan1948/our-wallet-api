import { IsIn, IsOptional, IsString, IsUUID, Length } from 'class-validator';
import type { WalletOwnerType, WalletType } from '../wallets.type.js';

export class UpdateWalletDto {
  @IsOptional()
  @IsString({ message: 'name must be a string' })
  @Length(1, 255, {
    message: 'name length must be between 1 and 255 characters',
  })
  name?: string;

  @IsOptional()
  @IsIn(['bank', 'ewallet', 'cash'], {
    message: 'type must be either bank, ewallet, or cash',
  })
  type?: WalletType;

  @IsOptional()
  @IsIn(['user', 'household'], {
    message: 'owner_type must be either user or household',
  })
  owner_type?: WalletOwnerType;

  @IsOptional()
  @IsUUID('4', { message: 'owner_user_id must be a valid UUID' })
  owner_user_id?: string;
}

import { IsIn, IsOptional, IsString, IsUUID, Length } from 'class-validator';

const ASSET_TYPES = [
  'emas',
  'perak',
  'crypto',
  'saham',
  'reksadana',
  'obligasi',
  'lainnya',
] as const;

export class UpdateInvestmentDto {
  @IsOptional()
  @IsString({ message: 'asset_name must be a string' })
  @Length(1, 255, {
    message: 'asset_name length must be between 1 and 255 characters',
  })
  asset_name?: string;

  @IsOptional()
  @IsIn(ASSET_TYPES, {
    message: `asset_type must be one of ${ASSET_TYPES.join(', ')}`,
  })
  asset_type?: (typeof ASSET_TYPES)[number];

  @IsOptional()
  @IsString({ message: 'unit must be a string' })
  @Length(1, 50, { message: 'unit length must be between 1 and 50 characters' })
  unit?: string;

  @IsOptional()
  @IsIn(['user', 'household'], {
    message: 'owner_type must be either user or household',
  })
  owner_type?: 'user' | 'household';

  @IsOptional()
  @IsUUID('4', { message: 'owner_user_id must be a valid UUID' })
  owner_user_id?: string;
}

import { IsIn, IsNotEmpty, IsNumber, IsOptional, IsString, Length, Min } from 'class-validator';

const ASSET_TYPES = [
  'emas',
  'perak',
  'crypto',
  'saham',
  'reksadana',
  'obligasi',
  'lainnya',
] as const;

export class CreateInvestmentDto {
  @IsNotEmpty({ message: 'owner_type is required' })
  @IsIn(['user', 'household'], {
    message: 'owner_type must be either user or household',
  })
  owner_type!: 'user' | 'household';

  @IsNotEmpty({ message: 'asset_type is required' })
  @IsIn(ASSET_TYPES, { message: `asset_type must be one of ${ASSET_TYPES.join(', ')}` })
  asset_type!: (typeof ASSET_TYPES)[number];

  @IsNotEmpty({ message: 'asset_name is required' })
  @IsString({ message: 'asset_name must be a string' })
  @Length(1, 255, {
    message: 'asset_name length must be between 1 and 255 characters',
  })
  asset_name!: string;

  @IsNotEmpty({ message: 'unit is required' })
  @IsString({ message: 'unit must be a string' })
  @Length(1, 50, { message: 'unit length must be between 1 and 50 characters' })
  unit!: string;

  @IsOptional()
  @IsNumber({}, { message: 'initial_price must be a number' })
  @Min(0, { message: 'initial_price cannot be negative' })
  initial_price?: number;
}

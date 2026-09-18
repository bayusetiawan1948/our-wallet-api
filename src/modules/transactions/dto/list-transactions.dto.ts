import { IsOptional, IsString, IsUUID } from 'class-validator';

export class ListTransactionsDto {
  @IsOptional()
  @IsUUID('4', { message: 'wallet_id must be a valid UUID' })
  wallet_id?: string;

  @IsOptional()
  @IsUUID('4', { message: 'category_id must be a valid UUID' })
  category_id?: string;

  @IsOptional()
  @IsString({ message: 'from must be a date string (YYYY-MM-DD)' })
  from?: string;

  @IsOptional()
  @IsString({ message: 'to must be a date string (YYYY-MM-DD)' })
  to?: string;
}

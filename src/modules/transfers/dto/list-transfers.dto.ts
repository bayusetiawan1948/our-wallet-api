import { IsOptional, IsUUID } from 'class-validator';

export class ListTransfersDto {
  @IsOptional()
  @IsUUID('4', { message: 'wallet_id must be a valid UUID' })
  wallet_id?: string;
}

import { IsNotEmpty, IsUUID } from 'class-validator';

export class ListReservationsDto {
  @IsNotEmpty({ message: 'wallet_id is required' })
  @IsUUID('4', { message: 'wallet_id must be a valid UUID' })
  wallet_id!: string;
}

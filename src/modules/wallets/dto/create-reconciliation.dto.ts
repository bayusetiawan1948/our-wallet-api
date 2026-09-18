import { IsNotEmpty, IsNumber } from 'class-validator';

export class CreateReconciliationDto {
  @IsNotEmpty({ message: 'actual_balance is required' })
  @IsNumber({}, { message: 'actual_balance must be a number' })
  actual_balance!: number;
}

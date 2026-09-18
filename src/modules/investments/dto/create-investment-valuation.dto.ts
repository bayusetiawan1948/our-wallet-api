import { IsNotEmpty, IsNumber, Min } from 'class-validator';

export class CreateInvestmentValuationDto {
  @IsNotEmpty({ message: 'price_per_unit is required' })
  @IsNumber({}, { message: 'price_per_unit must be a number' })
  @Min(0, { message: 'price_per_unit cannot be negative' })
  price_per_unit!: number;
}

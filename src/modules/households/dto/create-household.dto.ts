import { IsString, Length } from 'class-validator';

export class CreateHouseholdDto {
  @IsString({ message: 'name must be a string' })
  @Length(1, 255, {
    message: 'name length must be between 1 and 255 characters',
  })
  name!: string;
}

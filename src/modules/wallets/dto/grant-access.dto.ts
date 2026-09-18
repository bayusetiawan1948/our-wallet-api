import { IsNotEmpty, IsUUID } from 'class-validator';

export class GrantAccessDto {
  @IsNotEmpty({ message: 'user_id is required' })
  @IsUUID('4', { message: 'user_id must be a valid UUID' })
  user_id!: string;
}

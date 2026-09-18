import { IsString, Length } from 'class-validator';

export class AcceptInviteDto {
  @IsString({ message: 'code must be a string' })
  @Length(1, 100, {
    message: 'code length must be between 1 and 100 characters',
  })
  code!: string;
}

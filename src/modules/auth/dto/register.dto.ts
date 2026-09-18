import { IsEmail, IsString, Length } from 'class-validator';

export class RegisterDto {
  @IsString({ message: 'name must be a string' })
  @Length(1, 255, {
    message: 'name length must be between 1 and 255 characters',
  })
  name!: string;

  @IsEmail({}, { message: 'email must be a valid email address' })
  email!: string;

  @IsString({ message: 'password must be a string' })
  @Length(8, 100, { message: 'password must be between 8 and 100 characters' })
  password!: string;
}

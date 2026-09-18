import { IsIn, IsOptional, IsString, IsUUID, Length } from 'class-validator';

export class CreateCategoryDto {
  @IsString({ message: 'name must be a string' })
  @Length(1, 255, {
    message: 'name length must be between 1 and 255 characters',
  })
  name!: string;

  @IsIn(['income', 'expense', 'both'], {
    message: 'type must be one of income, expense, both',
  })
  type!: 'income' | 'expense' | 'both';

  @IsOptional()
  @IsString({ message: 'icon must be a string' })
  @Length(1, 100, { message: 'icon length must be between 1 and 100 characters' })
  icon?: string;

  @IsOptional()
  @IsUUID(undefined, { message: 'parent_id must be a valid UUID' })
  parent_id?: string;
}

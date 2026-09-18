import { IsBoolean } from 'class-validator';

export class UpdateMemberDto {
  @IsBoolean({ message: 'can_edit_others_transactions must be a boolean' })
  can_edit_others_transactions!: boolean;
}

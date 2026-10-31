import { IsOptional, IsString, Matches } from 'class-validator';

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export class HistoryQueryDto {
  @IsOptional()
  @Matches(ISO_DATE_PATTERN, { message: 'from must be a date (YYYY-MM-DD)' })
  from?: string;

  @IsOptional()
  @Matches(ISO_DATE_PATTERN, { message: 'to must be a date (YYYY-MM-DD)' })
  to?: string;

  // Daftar wallet_id dipisah koma; kosong berarti seluruh wallet yang bisa diakses.
  @IsOptional()
  @IsString({ message: 'wallet_ids must be a comma separated string' })
  wallet_ids?: string;
}

import {
  format,
  formatISO,
  parseISO,
  isValid,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  startOfYear,
  endOfYear,
  subMonths,
  addMonths,
  subDays,
  addDays,
  isBefore,
  isAfter,
  isSameDay,
  isSameMonth,
  differenceInDays,
  differenceInMonths,
} from 'date-fns';
import { id as localeId } from 'date-fns/locale';

export type PeriodType = 'weekly' | 'monthly' | 'yearly';

export interface DateRange {
  startDate: Date;
  endDate: Date;
  startDateString: string; // YYYY-MM-DD
  endDateString: string; // YYYY-MM-DD
}

/**
 * Standard date formatting helper (default: id-ID locale & ISO standard)
 */
export class DatetimeUtil {
  public static readonly DEFAULT_DATE_FORMAT = 'yyyy-MM-dd';
  public static readonly DEFAULT_DATETIME_FORMAT = 'yyyy-MM-dd HH:mm:ss';
  public static readonly HUMAN_DATE_FORMAT = 'dd MMMM yyyy';
  public static readonly HUMAN_DATETIME_FORMAT = 'dd MMMM yyyy HH:mm';

  public static Now(): Date {
    return new Date();
  }

  public static FormatDate(
    date: Date | string | number,
    formatStr: string = this.DEFAULT_DATE_FORMAT,
  ): string {
    const parsedDate =
      typeof date === 'string' ? parseISO(date) : new Date(date);

    if (!isValid(parsedDate)) {
      throw new Error(`Invalid date provided to FormatDate: ${String(date)}`);
    }

    return format(parsedDate, formatStr, { locale: localeId });
  }

  public static FormatHuman(
    date: Date | string | number,
    withTime = false,
  ): string {
    const pattern = withTime
      ? this.HUMAN_DATETIME_FORMAT
      : this.HUMAN_DATE_FORMAT;
    return this.FormatDate(date, pattern);
  }

  public static FormatISO(date: Date | string | number): string {
    const parsedDate =
      typeof date === 'string' ? parseISO(date) : new Date(date);

    if (!isValid(parsedDate)) {
      throw new Error(`Invalid date provided to FormatISO: ${String(date)}`);
    }

    return formatISO(parsedDate);
  }

  public static ParseDate(dateStr: string): Date {
    const parsed = parseISO(dateStr);

    if (!isValid(parsed)) {
      throw new Error(`Invalid ISO date string: ${dateStr}`);
    }

    return parsed;
  }

  public static IsValidDate(date: unknown): boolean {
    if (!date) {
      return false;
    }

    if (date instanceof Date) {
      return isValid(date);
    }

    if (typeof date === 'string') {
      return isValid(parseISO(date));
    }

    return false;
  }

  public static GetPeriodRange(
    date: Date | string | number = new Date(),
    period: PeriodType = 'monthly',
  ): DateRange {
    const targetDate =
      typeof date === 'string' ? parseISO(date) : new Date(date);

    if (!isValid(targetDate)) {
      throw new Error(
        `Invalid date provided to GetPeriodRange: ${String(date)}`,
      );
    }

    let start: Date;
    let end: Date;

    if (period === 'weekly') {
      start = startOfWeek(targetDate, { weekStartsOn: 1 }); // Monday start
      end = endOfWeek(targetDate, { weekStartsOn: 1 });
    } else if (period === 'yearly') {
      start = startOfYear(targetDate);
      end = endOfYear(targetDate);
    } else {
      // Default monthly
      start = startOfMonth(targetDate);
      end = endOfMonth(targetDate);
    }

    return {
      startDate: start,
      endDate: end,
      startDateString: format(start, this.DEFAULT_DATE_FORMAT),
      endDateString: format(end, this.DEFAULT_DATE_FORMAT),
    };
  }

  public static GetPreviousMonthRange(
    date: Date | string | number = new Date(),
  ): DateRange {
    const targetDate =
      typeof date === 'string' ? parseISO(date) : new Date(date);
    const prevMonthDate = subMonths(targetDate, 1);
    return this.GetPeriodRange(prevMonthDate, 'monthly');
  }

  public static GetNextMonthRange(
    date: Date | string | number = new Date(),
  ): DateRange {
    const targetDate =
      typeof date === 'string' ? parseISO(date) : new Date(date);
    const nextMonthDate = addMonths(targetDate, 1);
    return this.GetPeriodRange(nextMonthDate, 'monthly');
  }

  public static IsDateInRange(
    targetDate: Date | string,
    startDate: Date | string,
    endDate: Date | string,
  ): boolean {
    const target =
      typeof targetDate === 'string' ? parseISO(targetDate) : targetDate;
    const start =
      typeof startDate === 'string' ? parseISO(startDate) : startDate;
    const end = typeof endDate === 'string' ? parseISO(endDate) : endDate;

    return (
      (isSameDay(target, start) || isAfter(target, start)) &&
      (isSameDay(target, end) || isBefore(target, end))
    );
  }

  public static DiffInDays(
    laterDate: Date | string,
    earlierDate: Date | string,
  ): number {
    const d1 = typeof laterDate === 'string' ? parseISO(laterDate) : laterDate;
    const d2 =
      typeof earlierDate === 'string' ? parseISO(earlierDate) : earlierDate;
    return differenceInDays(d1, d2);
  }

  public static DiffInMonths(
    laterDate: Date | string,
    earlierDate: Date | string,
  ): number {
    const d1 = typeof laterDate === 'string' ? parseISO(laterDate) : laterDate;
    const d2 =
      typeof earlierDate === 'string' ? parseISO(earlierDate) : earlierDate;
    return differenceInMonths(d1, d2);
  }

  public static AddDays(date: Date | string, days: number): Date {
    const d = typeof date === 'string' ? parseISO(date) : date;
    return addDays(d, days);
  }

  public static SubDays(date: Date | string, days: number): Date {
    const d = typeof date === 'string' ? parseISO(date) : date;
    return subDays(d, days);
  }

  public static IsSameMonth(d1: Date | string, d2: Date | string): boolean {
    const parsed1 = typeof d1 === 'string' ? parseISO(d1) : d1;
    const parsed2 = typeof d2 === 'string' ? parseISO(d2) : d2;
    return isSameMonth(parsed1, parsed2);
  }
}

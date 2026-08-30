import {
  dinero,
  add,
  subtract,
  multiply,
  allocate,
  toDecimal,
  toSnapshot,
  greaterThan,
  greaterThanOrEqual,
  lessThan,
  lessThanOrEqual,
  equal,
  isZero,
  isPositive,
  isNegative,
  IDR,
  USD,
  EUR,
  SGD,
  MYR,
  JPY,
  type Dinero,
  type DineroCurrency,
} from 'dinero.js';

export const SUPPORTED_CURRENCIES: Record<string, DineroCurrency<number>> = {
  IDR,
  USD,
  EUR,
  SGD,
  MYR,
  JPY,
};

export type MoneyInput = number | string | Dinero<number>;

export class FinancialUtil {
  public static readonly DEFAULT_CURRENCY = IDR;

  public static GetCurrency(code = 'IDR'): DineroCurrency<number> {
    const uppercaseCode = code.toUpperCase();
    return SUPPORTED_CURRENCIES[uppercaseCode] ?? IDR;
  }

  /**
   * Convert decimal number / string into Dinero instance
   * e.g. 150000.50 with exponent 2 -> 15000050 minor units
   */
  public static FromDecimal(
    decimalValue: number | string,
    currencyCode = 'IDR',
  ): Dinero<number> {
    const currency = this.GetCurrency(currencyCode);
    const exponent = currency.exponent;
    const factor = Math.pow(10, exponent);

    const numericValue =
      typeof decimalValue === 'string'
        ? parseFloat(decimalValue)
        : decimalValue;

    if (isNaN(numericValue)) {
      throw new Error(
        `Invalid decimal value provided: ${String(decimalValue)}`,
      );
    }

    const minorUnits = Math.round(numericValue * factor);

    return dinero({
      amount: minorUnits,
      currency,
    });
  }

  /**
   * Convert minor units (cents/subunits) into Dinero instance
   */
  public static FromMinorUnits(
    minorUnits: number,
    currencyCode = 'IDR',
  ): Dinero<number> {
    const currency = this.GetCurrency(currencyCode);
    return dinero({
      amount: Math.round(minorUnits),
      currency,
    });
  }

  /**
   * Normalize input to Dinero instance
   */
  public static Normalize(
    input: MoneyInput,
    currencyCode = 'IDR',
  ): Dinero<number> {
    if (this.IsDinero(input)) {
      return input;
    }

    return this.FromDecimal(input, currencyCode);
  }

  public static IsDinero(value: unknown): value is Dinero<number> {
    return (
      typeof value === 'object' &&
      value !== null &&
      'calculator' in value &&
      'formatter' in value
    );
  }

  public static Add(
    augend: MoneyInput,
    addend: MoneyInput,
    currencyCode = 'IDR',
  ): Dinero<number> {
    const d1 = this.Normalize(augend, currencyCode);
    const d2 = this.Normalize(addend, currencyCode);
    return add(d1, d2);
  }

  public static Subtract(
    minuend: MoneyInput,
    subtrahend: MoneyInput,
    currencyCode = 'IDR',
  ): Dinero<number> {
    const d1 = this.Normalize(minuend, currencyCode);
    const d2 = this.Normalize(subtrahend, currencyCode);
    return subtract(d1, d2);
  }

  public static Multiply(
    multiplier: MoneyInput,
    factor: number,
    currencyCode = 'IDR',
  ): Dinero<number> {
    const d = this.Normalize(multiplier, currencyCode);
    return multiply(d, factor);
  }

  /**
   * Split/distribute money proportionally without losing fractions
   * e.g. Allocate(100000, [1, 1]) -> [50000, 50000]
   * e.g. Allocate(100, [1, 1, 1]) -> [34, 33, 33]
   */
  public static Allocate(
    amount: MoneyInput,
    ratios: number[],
    currencyCode = 'IDR',
  ): Dinero<number>[] {
    if (!ratios.length || ratios.some((r) => r < 0)) {
      throw new Error('Ratios must be non-empty and non-negative');
    }

    const d = this.Normalize(amount, currencyCode);
    return allocate(d, ratios);
  }

  /**
   * Allocate percentage portions (e.g. 70% admin, 30% member)
   */
  public static AllocatePercentages(
    amount: MoneyInput,
    percentages: number[],
    currencyCode = 'IDR',
  ): Dinero<number>[] {
    const sum = percentages.reduce((acc, curr) => acc + curr, 0);

    if (Math.abs(sum - 100) > 0.01) {
      throw new Error(
        `Total percentages must sum to 100, got ${sum.toString()}`,
      );
    }

    const ratios = percentages.map((p) => Math.round(p * 100));
    return this.Allocate(amount, ratios, currencyCode);
  }

  public static ToDecimal(amount: MoneyInput, currencyCode = 'IDR'): string {
    const d = this.Normalize(amount, currencyCode);
    return toDecimal(d);
  }

  public static ToNumber(amount: MoneyInput, currencyCode = 'IDR'): number {
    return parseFloat(this.ToDecimal(amount, currencyCode));
  }

  public static ToMinorUnits(amount: MoneyInput, currencyCode = 'IDR'): number {
    const d = this.Normalize(amount, currencyCode);
    return toSnapshot(d).amount;
  }

  public static FormatCurrency(
    amount: MoneyInput,
    currencyCode = 'IDR',
    locale = 'id-ID',
  ): string {
    const numericAmount = this.ToNumber(amount, currencyCode);
    const code = currencyCode.toUpperCase();

    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: code,
      minimumFractionDigits: code === 'IDR' ? 0 : 2,
      maximumFractionDigits: 2,
    }).format(numericAmount);
  }

  public static FormatCompact(
    amount: MoneyInput,
    currencyCode = 'IDR',
    locale = 'id-ID',
  ): string {
    const numericAmount = this.ToNumber(amount, currencyCode);

    return new Intl.NumberFormat(locale, {
      notation: 'compact',
      compactDisplay: 'short',
      maximumFractionDigits: 1,
    }).format(numericAmount);
  }

  public static GreaterThan(
    d1: MoneyInput,
    d2: MoneyInput,
    currencyCode = 'IDR',
  ): boolean {
    return greaterThan(
      this.Normalize(d1, currencyCode),
      this.Normalize(d2, currencyCode),
    );
  }

  public static GreaterThanOrEqual(
    d1: MoneyInput,
    d2: MoneyInput,
    currencyCode = 'IDR',
  ): boolean {
    return greaterThanOrEqual(
      this.Normalize(d1, currencyCode),
      this.Normalize(d2, currencyCode),
    );
  }

  public static LessThan(
    d1: MoneyInput,
    d2: MoneyInput,
    currencyCode = 'IDR',
  ): boolean {
    return lessThan(
      this.Normalize(d1, currencyCode),
      this.Normalize(d2, currencyCode),
    );
  }

  public static LessThanOrEqual(
    d1: MoneyInput,
    d2: MoneyInput,
    currencyCode = 'IDR',
  ): boolean {
    return lessThanOrEqual(
      this.Normalize(d1, currencyCode),
      this.Normalize(d2, currencyCode),
    );
  }

  public static Equal(
    d1: MoneyInput,
    d2: MoneyInput,
    currencyCode = 'IDR',
  ): boolean {
    return equal(
      this.Normalize(d1, currencyCode),
      this.Normalize(d2, currencyCode),
    );
  }

  public static IsZero(amount: MoneyInput, currencyCode = 'IDR'): boolean {
    return isZero(this.Normalize(amount, currencyCode));
  }

  public static IsPositive(amount: MoneyInput, currencyCode = 'IDR'): boolean {
    return isPositive(this.Normalize(amount, currencyCode));
  }

  public static IsNegative(amount: MoneyInput, currencyCode = 'IDR'): boolean {
    return isNegative(this.Normalize(amount, currencyCode));
  }
}

export type HistoryGranularity = 'day' | 'week' | 'month';

// Semua tanggal berformat YYYY-MM-DD pada zona waktu Asia/Jakarta.
export interface DatedAmount {
  date: string;
  amount: number;
}

export interface InvestmentEvent {
  investmentId: string;
  type: 'buy' | 'sell' | 'opening';
  quantity: number;
  price: number;
  date: string;
}

export interface InvestmentValuationPoint {
  investmentId: string;
  pricePerUnit: number;
  date: string;
}

export interface DebtRecord {
  id: string;
  principal: number;
  openingPaid: number;
  // Null untuk debt lama (opening): sudah ada sebelum aplikasi dipakai.
  originDate: string | null;
}

export interface DebtPaymentRecord {
  debtId: string;
  amount: number;
  date: string;
}

export interface HistoryLedger {
  walletDeltas: DatedAmount[];
  investmentEvents: InvestmentEvent[];
  // Harus terurut naik per tanggal (valuasi terbaru di akhir).
  valuations: InvestmentValuationPoint[];
  debts: DebtRecord[];
  debtPayments: DebtPaymentRecord[];
}

export interface HistoryPoint {
  date: string;
  walletBalance: number;
  investmentValue: number;
  investedCapital: number;
  totalAssets: number;
  liabilities: number;
  netWorth: number;
}

export interface DashboardHistory {
  from: string;
  to: string;
  granularity: HistoryGranularity;
  points: HistoryPoint[];
}

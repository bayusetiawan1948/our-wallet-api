import { createHash } from 'crypto';

export interface ImportHashInput {
  type: 'income' | 'expense';
  amount: number;
  date: string;
  note?: string | null;
}

const normalizeNote = (note?: string | null): string =>
  (note ?? '').toLowerCase().replace(/\s+/g, ' ').trim();

// Hash deterministik per wallet untuk mendeteksi transaksi yang sudah pernah
// di-import. Transaksi kembar yang sah di dalam satu batch (tipe, nominal,
// waktu, dan catatan sama) dibedakan lewat nomor kemunculannya (#0, #1, ...),
// sehingga mengimpor ulang berkas yang sama menghasilkan hash yang sama.
export function buildImportHashes(
  walletId: string,
  items: ImportHashInput[],
): string[] {
  const occurrences = new Map<string, number>();

  return items.map((item) => {
    const key = [
      walletId,
      item.type,
      item.amount.toFixed(2),
      new Date(item.date).toISOString(),
      normalizeNote(item.note),
    ].join('|');
    const occurrence = occurrences.get(key) ?? 0;
    occurrences.set(key, occurrence + 1);

    return createHash('sha256').update(`${key}#${occurrence}`).digest('hex');
  });
}

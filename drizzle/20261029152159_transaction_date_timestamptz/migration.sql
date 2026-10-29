ALTER TABLE "transactions" ALTER COLUMN "date" SET DATA TYPE timestamp with time zone USING ("date"::timestamp AT TIME ZONE 'Asia/Jakarta');

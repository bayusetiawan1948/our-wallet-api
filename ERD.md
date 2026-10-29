# ERD — Aplikasi Pencatatan Keuangan Keluarga (v3)

## Overview & Vision

**Our Wallets** is a modern, high-precision financial management application designed for tracking personal and shared finances, cash flows, wallet accounts, investments, and debts & receivables.

## Konsep dasar

- **Household** adalah unit keluarga yang menaungi beberapa `user`. Role hanya 2: **admin** (Kepala Keluarga, e.g. **Bayu**, kendali penuh) dan **member** (pasangan/anggota lain, e.g. **Annisa** — hanya bisa melihat data household terisolasi dan mencatat lewat wallet yang di-assign admin). `can_edit_others_transactions` adalah satu-satunya permission granular yang dibutuhkan saat ini (boleh/tidak edit transaksi milik member lain).
- **Quick Role Switcher**: Disediakan switcher instan di header aplikasi (`Bayu (Admin)` vs `Annisa (Member)`) untuk pengujian prototype.
- **Wallet**, **investasi**, **utang/piutang**, **budget**, dan **goal** memakai pola ownership yang sama: `owner_user_id` atau `owner_household_id` — salah satu diisi, tidak dua-duanya (ditegakkan via check constraint).
- Akses wallet shared hanya 1 level lewat `wallet_access` — begitu di-assign, member bisa melihat & mencatat di wallet tersebut.
- **Kategori** milik household (dikelola admin), dan satu kategori bisa dipakai untuk income maupun expense — tipe transaksi ditentukan di `transactions.type`, bukan di kategori. Kategori sistem (`is_system`) tidak bisa dihapus, hanya disembunyikan (`is_hidden`).
- **Transfer** antar wallet punya entity sendiri, terpisah dari `transactions`, supaya perpindahan saldo tidak tercatat ganda sebagai income+expense dan tidak merusak perhitungan net worth. Member dapat melakukan transfer dari wallet miliknya ke wallet mana saja di household.
- **`transactions.owner_id`** (siapa punya uangnya, untuk toggle mode Saya/Pasangan/Gabungan) dipisah dari **`transactions.recorded_by`** (siapa yang input) — penting karena satu orang bisa mencatat transaksi atas nama anggota lain.
- **Void & koreksi** (bukan hard delete) berlaku di semua entity pergerakan uang: `transactions`, `transfers`, `debt_payments`, `investment_transactions` — masing-masing punya `status` (active/void) dan `correction_of_id` (self-reference ke record yang dikoreksi).
- **Rekonsiliasi wallet** (`wallet_reconciliations`, cek manual saldo tercatat vs aktual kapan saja) dan **snapshot saldo** (`wallet_balance_snapshots`, otomatis tiap akhir bulan untuk grafik net worth) adalah dua konsep terpisah.
- Investasi memisahkan riwayat transaksi beli/jual (`investment_transactions`, punya `wallet_id` sebagai sumber/tujuan dana) dari riwayat harga pasar (`investment_valuations`). Kolom `source` (manual/scrape/api) disiapkan dari awal untuk transisi ke integrasi otomatis nanti.
- **Utang/piutang** digabung dalam satu tabel `debts` (kolom `type`), dengan split kepemilikan lewat 2 kolom tetap (`portion_admin`, `portion_member`) dan riwayat cicilan di `debt_payments`. Pembayaran oleh member hanya boleh dilakukan via wallet yang di-assign padanya.
- **Budget** (recurring) menyasar satu kategori per periode (mingguan/bulanan/tahunan); tiap instance periode dicatat di `budget_periods`, termasuk defisit yang dibawa dari periode sebelumnya (`carried_deficit`) — defisit **tidak hangus** saat periode reset, ikut membebani target periode berikutnya.
- **Goal** adalah entity terpisah dari Budget: dana terakumulasi menuju `target_amount` tanpa reset periodik, punya `target_date` opsional dan `status` (active/completed/cancelled) — dipakai untuk tujuan seperti dana nikah, beli rumah, dana darurat, dana sekolah anak.
- **Reservasi dompet** (`reservations`) menghubungkan wallet ke budget/goal secara many-to-many — satu dompet bisa jadi penampung banyak budget/goal sekaligus, satu budget/goal bisa dipenuhi dari banyak dompet. `reserved_amount` mengurangi saldo dompet secara informational untuk menghasilkan "saldo bebas". Pengisian reservasi bisa `manual` (nominal tetap oleh user), `percentage` (persentase otomatis dari tiap income yang masuk ke dompet tsb), atau `formula` (disimpan generik di `allocation_config`, disiapkan untuk skema lebih kompleks nanti).
- **Encroachment (soft-lock)**: reservasi bersifat informational — transaksi tetap bisa dijalankan meski saldo bebas dompet jadi minus (tidak ada hard block). Namun begitu itu terjadi, sistem **wajib** (bukan opsional) meminta user memilih budget/goal reservasi mana yang "termakan" (bisa lebih dari satu, dengan split nominal) sebelum transaksi tersimpan. Pilihan ini dicatat di `budget_encroachments`, dan `reserved_amount` pada reservasi terkait ikut berkurang sejumlah itu sebagai jejak riwayat (kenapa progress budget/goal turun bisa ditelusuri).
- Warning (Toast Sonner + Alert) ditampilkan setiap kali encroachment terjadi, maupun saat saldo bebas dompet mendekati/melewati nol secara umum.
- **Audit log** adalah tabel generik/polymorphic (`entity_type` + `entity_id`) yang mencatat semua perubahan lintas entity — bukan tabel audit terpisah per entity.
- **Household invite** lewat kode/link (`household_invites`) untuk mengundang pasangan bergabung.
- **Autentikasi & Session**: Menggunakan skema Access Token (JWT, TTL 5 menit) dan Refresh Token (TTL 7 hari) yang disimpan di tabel `sessions`. Setiap session mencatat `device_id`, `user_agent`, `refresh_token_hash`, `is_revoked`, dan `expires_at`. Sistem mendukung multi-device login, rotasi refresh token saat diperbarui, serta mekanisme revoke session.

## Diagram

```mermaid
erDiagram
  USERS ||--o{ HOUSEHOLD_MEMBERS : joins
  HOUSEHOLDS ||--o{ HOUSEHOLD_MEMBERS : has
  HOUSEHOLDS ||--o{ HOUSEHOLD_INVITES : issues
  USERS ||--o{ WALLETS : owns
  HOUSEHOLDS ||--o{ WALLETS : owns
  WALLETS ||--o{ WALLET_ACCESS : grants
  USERS ||--o{ WALLET_ACCESS : has
  WALLETS ||--o{ WALLET_RECONCILIATIONS : has
  WALLETS ||--o{ WALLET_BALANCE_SNAPSHOTS : has
  HOUSEHOLDS ||--o{ CATEGORIES : defines
  CATEGORIES ||--o{ TRANSACTIONS : classifies
  WALLETS ||--o{ TRANSACTIONS : records
  USERS ||--o{ TRANSACTIONS : owns_and_records
  WALLETS ||--o{ TRANSFERS : source_of
  WALLETS ||--o{ TRANSFERS : destination_of
  USERS ||--o{ DEBTS : owns
  HOUSEHOLDS ||--o{ DEBTS : owns
  DEBTS ||--o{ DEBT_PAYMENTS : has
  WALLETS ||--o{ DEBT_PAYMENTS : via
  USERS ||--o{ INVESTMENTS : owns
  HOUSEHOLDS ||--o{ INVESTMENTS : owns
  INVESTMENTS ||--o{ INVESTMENT_TRANSACTIONS : has
  WALLETS ||--o{ INVESTMENT_TRANSACTIONS : via
  INVESTMENTS ||--o{ INVESTMENT_VALUATIONS : has
  CATEGORIES ||--o{ BUDGETS : targets
  USERS ||--o{ BUDGETS : owns
  HOUSEHOLDS ||--o{ BUDGETS : owns
  BUDGETS ||--o{ BUDGET_PERIODS : has
  USERS ||--o{ GOALS : owns
  HOUSEHOLDS ||--o{ GOALS : owns
  WALLETS ||--o{ RESERVATIONS : backs
  BUDGETS ||--o{ RESERVATIONS : reserved_by
  GOALS ||--o{ RESERVATIONS : reserved_by
  TRANSACTIONS ||--o{ BUDGET_ENCROACHMENTS : causes
  WALLETS ||--o{ BUDGET_ENCROACHMENTS : depletes_from
  BUDGETS ||--o{ BUDGET_ENCROACHMENTS : encroached
  GOALS ||--o{ BUDGET_ENCROACHMENTS : encroached
  USERS ||--o{ AUDIT_LOGS : performs
  USERS ||--o{ SESSIONS : has

Enum household_member_role {
  admin
  member
}

Enum wallet_type {
  bank
  ewallet
  cash
}

Enum transaction_type {
  income
  expense
}

Enum transaction_status {
  active
  void
}

Enum debt_type {
  utang
  piutang
}

Enum debt_status {
  active
  paid
  overdue
  cancelled
}

Enum investment_asset_type {
  emas
  perak
  crypto
  saham
}

Enum investment_transaction_type {
  buy
  sell
}

Enum investment_transaction_status {
  active
  void
}

Enum investment_valuation_source {
  manual
  scrape
  api
}

Enum budget_period {
  weekly
  monthly
  yearly
}

Enum budget_period_status {
  active
  closed
}

Enum allocation_method {
  manual
  percentage
  formula
}

Enum goal_status {
  active
  completed
  cancelled
}

Table users {
  id uuid [pk]
  name varchar
  email varchar
  password_hash varchar
  base_currency varchar
}

Table sessions {
  id uuid [pk]
  user_id uuid [not null]
  device_id varchar [not null]
  user_agent varchar
  refresh_token_hash varchar [not null]
  is_revoked boolean [not null, default: false]
  expires_at datetime [not null]
  created_at datetime
  updated_at datetime
}

Table households {
  id uuid [pk]
  name varchar
}

Table household_members {
  household_id uuid [not null]
  user_id uuid [not null]
  role household_member_role
  can_edit_others_transactions boolean

  indexes {
    (household_id, user_id) [pk]
  }
}

Table household_invites {
  id uuid [pk]
  household_id uuid [not null]
  invited_by uuid [not null]
  code varchar
  status varchar
  expires_at datetime
}

Table wallets {
  id uuid [pk]
  owner_user_id uuid
  owner_household_id uuid
  name varchar
  type wallet_type
  currency varchar

  Note: 'owner_user_id and owner_household_id are mutually exclusive'
}

Table wallet_access {
  wallet_id uuid [not null]
  user_id uuid [not null]
  assigned_by uuid [not null]

  indexes {
    (wallet_id, user_id) [pk]
  }
}

Table wallet_reconciliations {
  id uuid [pk]
  wallet_id uuid [not null]
  recorded_balance decimal
  actual_balance decimal
  date date
  adjustment_transaction_id uuid
}

Table wallet_balance_snapshots {
  id uuid [pk]
  wallet_id uuid [not null]
  balance decimal
  snapshot_date date
}

Table categories {
  id uuid [pk]
  household_id uuid [not null]
  parent_id uuid
  name varchar
  is_system boolean
  is_hidden boolean
}

Table transactions {
  id uuid [pk]
  wallet_id uuid [not null]
  category_id uuid [not null]
  owner_id uuid [not null]
  recorded_by uuid [not null]
  type transaction_type
  amount decimal
  date datetime
  note text
  attachment_url varchar
  status transaction_status
  correction_of_id uuid
}

Table transfers {
  id uuid [pk]
  from_wallet_id uuid [not null]
  to_wallet_id uuid [not null]
  amount decimal
  fee decimal
  date date
  status transaction_status
  correction_of_id uuid
}

Table debts {
  id uuid [pk]
  owner_user_id uuid
  owner_household_id uuid
  type debt_type
  counterparty varchar
  principal decimal
  portion_admin decimal
  portion_member decimal
  due_date date
  status debt_status

  Note: 'owner_user_id and owner_household_id are mutually exclusive'
}

Table debt_payments {
  id uuid [pk]
  debt_id uuid [not null]
  wallet_id uuid [not null]
  amount decimal
  date date
  status transaction_status
  correction_of_id uuid
}

Table investments {
  id uuid [pk]
  owner_user_id uuid
  owner_household_id uuid
  asset_type investment_asset_type
  asset_name varchar
  unit varchar

  Note: 'owner_user_id and owner_household_id are mutually exclusive'
}

Table investment_transactions {
  id uuid [pk]
  investment_id uuid [not null]
  wallet_id uuid [not null]
  type investment_transaction_type
  quantity decimal
  price decimal
  date date
  status investment_transaction_status
  correction_of_id uuid
}

Table investment_valuations {
  id uuid [pk]
  investment_id uuid [not null]
  price_per_unit decimal
  date date
  source investment_valuation_source
}

Table budgets {
  id uuid [pk]
  category_id uuid [not null]
  owner_user_id uuid
  owner_household_id uuid
  name varchar
  target_amount decimal
  period budget_period
  start_date date

  Note: 'owner_user_id and owner_household_id are mutually exclusive'
}

Table budget_periods {
  id uuid [pk]
  budget_id uuid [not null]
  period_start date
  period_end date
  target_amount decimal
  carried_deficit decimal
  status budget_period_status
}

Table goals {
  id uuid [pk]
  owner_user_id uuid
  owner_household_id uuid
  name varchar
  target_amount decimal
  target_date date
  status goal_status

  Note: 'owner_user_id and owner_household_id are mutually exclusive'
}

Table reservations {
  id uuid [pk]
  wallet_id uuid [not null]
  budget_id uuid
  goal_id uuid
  reserved_amount decimal
  allocation_method allocation_method
  allocation_config json

  Note: 'budget_id and goal_id are mutually exclusive'
}

Table budget_encroachments {
  id uuid [pk]
  transaction_id uuid [not null]
  wallet_id uuid [not null]
  budget_id uuid
  goal_id uuid
  amount decimal
  created_at datetime

  Note: 'budget_id and goal_id are mutually exclusive'
}

Table audit_logs {
  id uuid [pk]
  actor_id uuid [not null]
  entity_type varchar
  entity_id uuid
  action varchar
  before_data json
  after_data json
  created_at datetime
}


// =========================
// Required Relationships
// =========================

Ref: household_members.household_id > households.id
Ref: household_members.user_id > users.id

Ref: household_invites.household_id > households.id
Ref: household_invites.invited_by > users.id

Ref: wallets.owner_user_id >? users.id
Ref: wallets.owner_household_id >? households.id

Ref: wallet_access.wallet_id > wallets.id
Ref: wallet_access.user_id > users.id
Ref: wallet_access.assigned_by > users.id

Ref: wallet_reconciliations.wallet_id > wallets.id
Ref: wallet_reconciliations.adjustment_transaction_id >? transactions.id

Ref: wallet_balance_snapshots.wallet_id > wallets.id

Ref: categories.household_id > households.id
Ref: categories.parent_id >? categories.id

Ref: transactions.wallet_id > wallets.id
Ref: transactions.category_id > categories.id
Ref: transactions.owner_id > users.id
Ref: transactions.recorded_by > users.id
Ref: transactions.correction_of_id >? transactions.id

Ref: transfers.from_wallet_id > wallets.id
Ref: transfers.to_wallet_id > wallets.id
Ref: transfers.correction_of_id >? transfers.id

Ref: debts.owner_user_id >? users.id
Ref: debts.owner_household_id >? households.id

Ref: debt_payments.debt_id > debts.id
Ref: debt_payments.wallet_id > wallets.id
Ref: debt_payments.correction_of_id >? debt_payments.id

Ref: investments.owner_user_id >? users.id
Ref: investments.owner_household_id >? households.id

Ref: investment_transactions.investment_id > investments.id
Ref: investment_transactions.wallet_id > wallets.id
Ref: investment_transactions.correction_of_id >? investment_transactions.id

Ref: investment_valuations.investment_id > investments.id

Ref: budgets.category_id > categories.id
Ref: budgets.owner_user_id >? users.id
Ref: budgets.owner_household_id >? households.id

Ref: budget_periods.budget_id > budgets.id

Ref: goals.owner_user_id >? users.id
Ref: goals.owner_household_id >? households.id

Ref: reservations.wallet_id > wallets.id
Ref: reservations.budget_id >? budgets.id
Ref: reservations.goal_id >? goals.id

Ref: budget_encroachments.transaction_id > transactions.id
Ref: budget_encroachments.wallet_id > wallets.id
Ref: budget_encroachments.budget_id >? budgets.id
Ref: budget_encroachments.goal_id >? goals.id

Ref: audit_logs.actor_id > users.id
Ref: sessions.user_id > users.id
```

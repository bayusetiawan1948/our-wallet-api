# Session Conventions — our-wallet-api

Dokumen ini melengkapi `.agents/Rules.md` (baseline convention, jangan diubah) dengan keputusan
implementasi spesifik yang disepakati untuk project **our-wallet-api** ini. Berlaku HANYA untuk
`our-wallet-api`, tidak untuk project lain di monorepo (`our-wallets-web` punya konvensi sendiri).

## 1. Source of Truth yang Dipakai

- `src/common/constants/response-code.constant.ts` (`ResponseCode` enum) adalah source of truth
  RC yang aktif dipakai di code — BUKAN tabel RC di `Rules.md` Section 30 (tabel itu contoh lama,
  sudah tidak identik dengan kode berjalan). Selalu import `ResponseCode`/`RC_HTTP_STATUS` dari file
  tersebut, jangan hardcode string RC baru tanpa menambah entry di enum + mapping HTTP status.
- `ApiResponse<T>` / `ServiceResponse<T>` dari `common/types/api-response.type.ts` dipakai sebagai
  bentuk return service ketika perlu override message/rc custom. Kalau tidak perlu override,
  cukup return data mentah — `ResponseInterceptor` yang membungkus jadi `{ rc, message, data }`.

## 2. Auth Strategy (disepakati, jangan diubah tanpa konfirmasi user)

- **Access + refresh token flow lengkap**, bukan access-token-only.
- Access token: JWT pendek umur (`JWT_ACCESS_EXPIRES_IN`, default 15m), dikirim di body response
  `POST /auth/login`, `/auth/register`, `/auth/refresh`, dan endpoint apa pun yang me-reissue token
  (mis. setelah create/join household karena `role`/`householdId` di payload berubah).
  Disimpan **in-memory** di our-wallets-web (bukan localStorage/cookie) — attach manual ke header
  `Authorization: Bearer` di axios interceptor.
- Refresh token: JWT umur panjang (`JWT_REFRESH_EXPIRES_IN`, default 30d), dikirim via **httpOnly
  cookie** (`refresh_token`) — tidak pernah muncul di response body. Di-set oleh backend lewat
  `res.cookie(...)`, `sameSite: lax`, `secure` mengikuti `NODE_ENV=production`.
- Refresh token di-hash dengan **SHA-256** (bukan bcrypt) sebelum disimpan ke kolom
  `sessions.refresh_token_hash` — refresh token adalah random/JWT signed berentropi tinggi (bukan
  password user), bcrypt tidak perlu dan punya limit 72-byte yang bisa truncate JWT panjang.
  Bcrypt tetap dipakai khusus untuk `users.password_hash`.
- Refresh selalu **rotate**: setiap kali `/auth/refresh` dipanggil (atau reissue internal), row
  `sessions` yang sama di-update (`refreshTokenHash`, `expiresAt`), bukan bikin session baru — supaya
  device tracking (`sessions.device_id`) tetap konsisten dan silent-refresh di web tidak memaksa
  re-login.
- Web bertanggung jawab: begitu `POST /auth/refresh` sukses, access token baru disimpan lagi ke
  memory (state React/module-level, bukan context yang hilang saat reload — reload tetap butuh satu
  kali silent refresh via cookie saat app mount, itu wajar dan bukan "re-login").
- **Quick Role Switcher dihapus dari our-wallets-web** — role didapat murni dari JWT payload
  (`role`, `householdId`) hasil login/refresh, tidak ada toggle role di UI produksi.

## 3. Household & User Assumption

- Prototype ini mengasumsikan **1 user hanya tergabung di maksimal 1 household** (sesuai narasi ERD:
  household = unit 1 keluarga/pasangan). Tidak ada multi-household per user di scope ini. Kalau nanti
  dibutuhkan multi-household, itu perlu didiskusikan dulu sebagai perubahan besar pada `JwtPayload`.
- Alur normal: `register` → user belum py household (`householdId: null`, `role: null` di JWT) →
  user memilih `POST /households` (jadi admin) **atau** `POST /households/invites/accept` (jadi
  member). Tidak ada seed data household otomatis.
- `JwtPayload.role` dan `AuthenticatedUser.role` bertipe `HouseholdMemberRole | null` (diubah dari
  non-nullable) justru karena window "belum join household" ini real, bukan edge case yang diabaikan.

## 4. Module Boundary Tambahan

- `modules/users` hanya berisi capability internal (`UsersService`) dipakai oleh `auth` dan
  `households` — sengaja **tanpa controller publik** sampai ada kebutuhan nyata endpoint user
  (mis. update profile). Jangan tambah `users.controller.ts` kosong hanya karena module lain punya.
- `modules/auth` memegang session lifecycle penuh (login/refresh/logout). `AuthModule` mengimpor
  `HouseholdsModule` (satu arah, tidak circular) supaya `AuthService` bisa membaca membership
  terbaru setiap kali sign token. `HouseholdsModule`/`HouseholdsService` TIDAK mengimpor `AuthModule`
  sama sekali — setelah create/join household, klien (our-wallets-web) cukup memanggil
  `POST /auth/refresh` untuk mendapat access token baru dengan `householdId`/`role` ter-update,
  karena `/auth/refresh` selalu re-fetch membership dari DB, bukan dari payload JWT lama.

## 5. Env Vars Baru (lihat `.env.example`)

```
JWT_ACCESS_SECRET=
JWT_REFRESH_SECRET=
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=30d
CORS_ORIGIN=http://localhost:5173
NODE_ENV=development
```

## 6. Known Pre-existing Issue (dicatat, belum diperbaiki tanpa diminta)

- `drizzle.config.ts` menunjuk ke `./src/infrastructure/database/schema/index.ts`, padahal schema
  sebenarnya ada di `./src/shared/database/schema/index.ts`. Ini bug lama yang sudah ada sebelum
  sesi ini — belum disentuh karena di luar scope Auth+Households. Perbaiki (`drizzle.config.ts`)
  sebelum menjalankan `db:generate`/`db:push` supaya tidak generate skema kosong.

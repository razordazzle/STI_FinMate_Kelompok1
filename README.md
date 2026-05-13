# FinMate

FinMate adalah aplikasi money manager hybrid mobile berbasis Ionic Angular sesuai proposal STI. Data aplikasi disimpan di Supabase memakai konfigurasi pada `src/environments/environment.ts`.

## Fitur

- Login, register, dan validasi email/password berbasis tabel `profiles` Supabase.
- Multi akun finansial: Cash, Bank, E-Wallet, Other.
- Income, expense, dan transfer antar akun dengan biaya admin.
- Budgeting per kategori dan periode bulan.
- Recurring transaction aktif/nonaktif dengan pencegahan transaksi ganda pada tanggal yang sama.
- Hutang/piutang dengan status belum dibayar, dibayar sebagian, lunas, dan terlambat.
- Laporan keuangan dengan filter tanggal, akun, kategori, total income, total expense, saldo akun, dan grafik harian.
- Import/export CSV transaksi.

## Supabase

Tabel yang dipakai aplikasi:

- `profiles`
- `accounts`
- `transactions`
- `budgets`
- `recurring_transactions`
- `debts`

Catatan schema saat ini: `budgets` memakai kolom `limit_amount`, dan transfer pada `transactions` memakai `account_id` sebagai akun sumber serta `to_account_id` sebagai akun tujuan.

## Menjalankan

```bash
npm install
npm start
```

Lalu buka `http://localhost:4200`.

## Testing

```bash
npm run build
npm run test:ci
```

Test unit mencakup validasi register/login, equivalence input akun, income/expense, transfer dengan biaya admin, boundary budget, recurring anti-duplikat, state hutang/piutang, laporan, dan CSV.

## Format CSV

```csv
type,date,account,fromAccount,toAccount,category,amount,fee,note
income,2026-05-11,Cash,,,Gaji,50000,0,Gaji tambahan
expense,2026-05-11,Cash,,,Makanan,25000,0,Makan siang
transfer,2026-05-11,,BCA,DANA,Transfer,100000,2500,Top up DANA
```

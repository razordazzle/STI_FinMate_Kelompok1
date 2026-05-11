import { Injectable } from '@angular/core';

export const ACCOUNT_TYPES = ['Cash', 'Bank', 'E-Wallet', 'Other'] as const;
export const INCOME_CATEGORIES = ['Gaji', 'Uang Saku', 'Bonus', 'Hadiah', 'Refund', 'Lainnya'] as const;
export const EXPENSE_CATEGORIES = [
  'Makanan',
  'Transportasi',
  'Hiburan',
  'Pendidikan',
  'Belanja',
  'Kesehatan',
  'Tagihan',
  'Lainnya',
] as const;

export type AccountType = (typeof ACCOUNT_TYPES)[number];
export type TransactionType = 'income' | 'expense' | 'transfer';
export type DebtKind = 'debt' | 'receivable';
export type DebtStatus = 'unpaid' | 'partial' | 'paid' | 'overdue';
export type BudgetStatus = 'safe' | 'warning' | 'full' | 'over';

export interface ActionResult<T = undefined> {
  ok: boolean;
  message: string;
  data?: T;
  warnings?: string[];
}

export interface User {
  id: string;
  name: string;
  email: string;
  password: string;
  failedLoginAttempts: number;
  lockedUntil?: string;
}

export interface Account {
  id: string;
  name: string;
  type: AccountType;
  balance: number;
  createdAt: string;
}

export interface Transaction {
  id: string;
  type: TransactionType;
  accountId?: string;
  fromAccountId?: string;
  toAccountId?: string;
  category: string;
  amount: number;
  fee?: number;
  date: string;
  note: string;
  recurringId?: string;
  createdAt: string;
}

export interface Budget {
  id: string;
  category: string;
  month: string;
  limit: number;
}

export interface BudgetSummary extends Budget {
  spent: number;
  remaining: number;
  percentage: number;
  status: BudgetStatus;
}

export interface RecurringRule {
  id: string;
  name: string;
  type: Exclude<TransactionType, 'transfer'>;
  accountId: string;
  category: string;
  amount: number;
  dayOfMonth: number;
  startsOn: string;
  endsOn?: string;
  active: boolean;
  lastGeneratedOn?: string;
}

export interface DebtEntry {
  id: string;
  kind: DebtKind;
  person: string;
  amount: number;
  paidAmount: number;
  dueDate: string;
  note: string;
  status: DebtStatus;
  createdAt: string;
}

export interface FinmateData {
  accounts: Account[];
  transactions: Transaction[];
  budgets: Budget[];
  recurringRules: RecurringRule[];
  debts: DebtEntry[];
}

export interface FinmateState {
  users: User[];
  activeUserId: string | null;
  dataByUser: Record<string, FinmateData>;
}

export interface CreateAccountInput {
  name: string;
  type: AccountType;
  initialBalance: unknown;
}

export interface CreateTransactionInput {
  type: Exclude<TransactionType, 'transfer'>;
  accountId: string;
  category: string;
  amount: unknown;
  date: string;
  note?: string;
  recurringId?: string;
}

export interface TransferInput {
  fromAccountId: string;
  toAccountId: string;
  amount: unknown;
  fee: unknown;
  date: string;
  note?: string;
}

export interface CreateBudgetInput {
  category: string;
  month: string;
  limit: unknown;
}

export interface CreateRecurringInput {
  name: string;
  type: Exclude<TransactionType, 'transfer'>;
  accountId: string;
  category: string;
  amount: unknown;
  dayOfMonth: unknown;
  startsOn: string;
  endsOn?: string;
  active: boolean;
}

export interface CreateDebtInput {
  kind: DebtKind;
  person: string;
  amount: unknown;
  dueDate: string;
  note?: string;
}

export interface ReportFilter {
  startDate: string;
  endDate: string;
  accountId: string;
  category: string;
}

export interface DailyTotal {
  date: string;
  income: number;
  expense: number;
}

export interface CategoryTotal {
  category: string;
  total: number;
}

export interface AccountBalance {
  accountId: string;
  name: string;
  balance: number;
}

export interface ReportResult {
  totalIncome: number;
  totalExpense: number;
  netCashflow: number;
  largestExpenseCategory: string;
  categoryTotals: CategoryTotal[];
  dailyTotals: DailyTotal[];
  accountBalances: AccountBalance[];
  transactions: Transaction[];
}

export interface ImportResult {
  imported: number;
  skipped: number;
  errors: string[];
}

export interface GenerateRecurringResult {
  created: Transaction[];
}

const STORAGE_KEY = 'finmate-state-v1';
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DEMO_EMAIL = 'demo@finmate.test';
const DEMO_PASSWORD = 'password123';

@Injectable({
  providedIn: 'root',
})
export class FinmateStoreService {
  private state: FinmateState = this.loadState();

  constructor() {
    this.refreshDebtStatuses();
    this.save();
  }

  getCurrentUser(): User | null {
    const user = this.state.users.find((item) => item.id === this.state.activeUserId) ?? null;
    return user ? this.clone(user) : null;
  }

  getCurrentData(): FinmateData {
    this.refreshDebtStatuses();
    const data = this.requireData();
    return data ? this.clone(data) : createEmptyFinmateData();
  }

  register(name: string, email: string, password: string): ActionResult<User> {
    const normalizedName = name.trim();
    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedName) {
      return this.fail('Name wajib diisi.');
    }

    if (!normalizedEmail) {
      return this.fail('Email wajib diisi.');
    }

    if (!EMAIL_PATTERN.test(normalizedEmail)) {
      return this.fail('Format email tidak valid.');
    }

    if (!password) {
      return this.fail('Password wajib diisi.');
    }

    if (password.length < 6) {
      return this.fail('Password minimal 6 karakter.');
    }

    if (this.state.users.some((user) => user.email === normalizedEmail)) {
      return this.fail('Email sudah terdaftar.');
    }

    const user: User = {
      id: this.makeId('user'),
      name: normalizedName,
      email: normalizedEmail,
      password,
      failedLoginAttempts: 0,
    };

    this.state.users.push(user);
    this.state.activeUserId = user.id;
    this.state.dataByUser[user.id] = createEmptyFinmateData();
    this.save();

    return this.ok('Register berhasil.', this.clone(user));
  }

  login(email: string, password: string): ActionResult<User> {
    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedEmail) {
      return this.fail('Email wajib diisi.');
    }

    if (!password) {
      return this.fail('Password wajib diisi.');
    }

    const user = this.state.users.find((item) => item.email === normalizedEmail);
    if (!user) {
      return this.fail('Email tidak terdaftar.');
    }

    if (user.lockedUntil && new Date(user.lockedUntil).getTime() > Date.now()) {
      return this.fail('Akun terkunci sementara karena terlalu banyak percobaan login gagal.');
    }

    if (user.password !== password) {
      user.failedLoginAttempts += 1;
      if (user.failedLoginAttempts >= 3) {
        user.lockedUntil = new Date(Date.now() + 5 * 60 * 1000).toISOString();
      }
      this.save();
      return this.fail('Email atau password salah.');
    }

    user.failedLoginAttempts = 0;
    user.lockedUntil = undefined;
    this.state.activeUserId = user.id;
    this.ensureUserData(user.id);
    this.save();

    return this.ok('Login berhasil.', this.clone(user));
  }

  loginDemo(): ActionResult<User> {
    return this.login(DEMO_EMAIL, DEMO_PASSWORD);
  }

  logout(): void {
    this.state.activeUserId = null;
    this.save();
  }

  addAccount(input: CreateAccountInput): ActionResult<Account> {
    const data = this.requireData();
    if (!data) {
      return this.fail('Silakan login terlebih dahulu.');
    }

    const name = input.name.trim();
    const balance = this.readAmount(input.initialBalance, false);

    if (!name) {
      return this.fail('Account name wajib diisi.');
    }

    if (balance === null) {
      return this.fail('Initial balance wajib berupa angka.');
    }

    if (balance < 0) {
      return this.fail('Initial balance tidak boleh negatif.');
    }

    if (data.accounts.some((account) => account.name.toLowerCase() === name.toLowerCase())) {
      return this.fail('Account name sudah digunakan.');
    }

    const account: Account = {
      id: this.makeId('account'),
      name,
      type: input.type,
      balance,
      createdAt: new Date().toISOString(),
    };

    data.accounts.push(account);
    this.save();

    return this.ok('Account berhasil dibuat.', this.clone(account));
  }

  addTransaction(input: CreateTransactionInput): ActionResult<Transaction> {
    const data = this.requireData();
    if (!data) {
      return this.fail('Silakan login terlebih dahulu.');
    }

    const amount = this.readAmount(input.amount, true);
    const account = data.accounts.find((item) => item.id === input.accountId);
    const category = input.category.trim();

    if (!account) {
      return this.fail(input.type === 'income' ? 'Akun tujuan wajib dipilih.' : 'Akun sumber wajib dipilih.');
    }

    if (!category) {
      return this.fail('Kategori wajib dipilih.');
    }

    if (amount === null || amount <= 0) {
      return this.fail('Nominal transaksi harus lebih dari 0.');
    }

    if (!input.date) {
      return this.fail('Tanggal transaksi wajib diisi.');
    }

    if (input.type === 'expense' && account.balance < amount) {
      return this.fail('Saldo akun tidak mencukupi.');
    }

    const transaction = this.createTransactionRecord({
      type: input.type,
      accountId: account.id,
      category,
      amount,
      date: input.date,
      note: input.note ?? '',
      recurringId: input.recurringId,
    });

    if (input.type === 'income') {
      account.balance = this.toMoney(account.balance + amount);
    } else {
      account.balance = this.toMoney(account.balance - amount);
    }

    data.transactions.unshift(transaction);
    this.save();

    const warnings = input.type === 'expense' ? this.getBudgetWarnings(data, category, input.date) : [];
    return this.ok(`${input.type === 'income' ? 'Income' : 'Expense'} berhasil ditambahkan.`, this.clone(transaction), warnings);
  }

  transfer(input: TransferInput): ActionResult<Transaction> {
    const data = this.requireData();
    if (!data) {
      return this.fail('Silakan login terlebih dahulu.');
    }

    const amount = this.readAmount(input.amount, true);
    const fee = this.readAmount(input.fee, false) ?? 0;
    const fromAccount = data.accounts.find((account) => account.id === input.fromAccountId);
    const toAccount = data.accounts.find((account) => account.id === input.toAccountId);

    if (!fromAccount) {
      return this.fail('Akun sumber wajib dipilih.');
    }

    if (!toAccount) {
      return this.fail('Akun tujuan wajib dipilih.');
    }

    if (fromAccount.id === toAccount.id) {
      return this.fail('Akun sumber dan tujuan tidak boleh sama.');
    }

    if (amount === null || amount <= 0) {
      return this.fail('Nominal transfer harus lebih dari 0.');
    }

    if (fee < 0) {
      return this.fail('Biaya admin tidak boleh negatif.');
    }

    if (!input.date) {
      return this.fail('Tanggal transfer wajib diisi.');
    }

    const totalDebit = this.toMoney(amount + fee);
    if (fromAccount.balance < totalDebit) {
      return this.fail('Saldo akun sumber tidak mencukupi.');
    }

    fromAccount.balance = this.toMoney(fromAccount.balance - totalDebit);
    toAccount.balance = this.toMoney(toAccount.balance + amount);

    const transaction = this.createTransactionRecord({
      type: 'transfer',
      fromAccountId: fromAccount.id,
      toAccountId: toAccount.id,
      category: 'Transfer',
      amount,
      fee,
      date: input.date,
      note: input.note ?? '',
    });

    data.transactions.unshift(transaction);
    this.save();

    return this.ok('Transfer berhasil dicatat.', this.clone(transaction));
  }

  setBudget(input: CreateBudgetInput): ActionResult<Budget> {
    const data = this.requireData();
    if (!data) {
      return this.fail('Silakan login terlebih dahulu.');
    }

    const category = input.category.trim();
    const limit = this.readAmount(input.limit, true);

    if (!category) {
      return this.fail('Kategori budget wajib dipilih.');
    }

    if (!/^\d{4}-\d{2}$/.test(input.month)) {
      return this.fail('Periode budget wajib dipilih.');
    }

    if (limit === null || limit <= 0) {
      return this.fail('Budget harus lebih dari 0.');
    }

    const existing = data.budgets.find((budget) => budget.category === category && budget.month === input.month);
    if (existing) {
      existing.limit = limit;
      this.save();
      return this.ok('Budget berhasil diperbarui.', this.clone(existing));
    }

    const budget: Budget = {
      id: this.makeId('budget'),
      category,
      month: input.month,
      limit,
    };

    data.budgets.push(budget);
    this.save();

    return this.ok('Budget berhasil disimpan.', this.clone(budget));
  }

  getBudgetSummaries(month: string): BudgetSummary[] {
    const data = this.requireData();
    if (!data) {
      return [];
    }

    return data.budgets
      .filter((budget) => budget.month === month)
      .map((budget) => {
        const spent = this.sum(
          data.transactions
            .filter((transaction) => transaction.type === 'expense')
            .filter((transaction) => transaction.category === budget.category)
            .filter((transaction) => transaction.date.slice(0, 7) === budget.month)
            .map((transaction) => transaction.amount)
        );
        const percentage = budget.limit > 0 ? (spent / budget.limit) * 100 : 0;
        const status = this.resolveBudgetStatus(spent, budget.limit);

        return {
          ...budget,
          spent,
          remaining: this.toMoney(Math.max(budget.limit - spent, 0)),
          percentage,
          status,
        };
      })
      .sort((first, second) => second.percentage - first.percentage);
  }

  addRecurring(input: CreateRecurringInput): ActionResult<RecurringRule> {
    const data = this.requireData();
    if (!data) {
      return this.fail('Silakan login terlebih dahulu.');
    }

    const name = input.name.trim();
    const amount = this.readAmount(input.amount, true);
    const dayOfMonth = Number(input.dayOfMonth);
    const account = data.accounts.find((item) => item.id === input.accountId);
    const category = input.category.trim();

    if (!name) {
      return this.fail('Nama recurring wajib diisi.');
    }

    if (!account) {
      return this.fail('Akun recurring wajib dipilih.');
    }

    if (!category) {
      return this.fail('Kategori recurring wajib dipilih.');
    }

    if (amount === null || amount <= 0) {
      return this.fail('Nominal recurring harus lebih dari 0.');
    }

    if (!Number.isInteger(dayOfMonth) || dayOfMonth < 1 || dayOfMonth > 31) {
      return this.fail('Tanggal recurring harus di antara 1 sampai 31.');
    }

    if (!input.startsOn) {
      return this.fail('Tanggal mulai recurring wajib diisi.');
    }

    if (input.endsOn && input.endsOn < input.startsOn) {
      return this.fail('Tanggal selesai tidak boleh sebelum tanggal mulai.');
    }

    const rule: RecurringRule = {
      id: this.makeId('recurring'),
      name,
      type: input.type,
      accountId: account.id,
      category,
      amount,
      dayOfMonth,
      startsOn: input.startsOn,
      endsOn: input.endsOn || undefined,
      active: input.active,
    };

    data.recurringRules.push(rule);
    this.save();

    return this.ok('Recurring transaction berhasil dibuat.', this.clone(rule));
  }

  toggleRecurring(id: string, active: boolean): ActionResult<RecurringRule> {
    const data = this.requireData();
    if (!data) {
      return this.fail('Silakan login terlebih dahulu.');
    }

    const rule = data.recurringRules.find((item) => item.id === id);
    if (!rule) {
      return this.fail('Recurring tidak ditemukan.');
    }

    rule.active = active;
    this.save();

    return this.ok(active ? 'Recurring diaktifkan.' : 'Recurring dinonaktifkan.', this.clone(rule));
  }

  generateDueTransactions(date = todayIso()): ActionResult<GenerateRecurringResult> {
    const data = this.requireData();
    if (!data) {
      return this.fail('Silakan login terlebih dahulu.');
    }

    const created: Transaction[] = [];
    const warnings: string[] = [];

    for (const rule of data.recurringRules) {
      if (!this.isRecurringDue(rule, date)) {
        continue;
      }

      const duplicate = data.transactions.some((transaction) => transaction.recurringId === rule.id && transaction.date === date);
      if (duplicate) {
        continue;
      }

      const account = data.accounts.find((item) => item.id === rule.accountId);
      if (!account) {
        warnings.push(`${rule.name}: akun tidak ditemukan.`);
        continue;
      }

      if (rule.type === 'expense' && account.balance < rule.amount) {
        warnings.push(`${rule.name}: saldo ${account.name} tidak mencukupi.`);
        continue;
      }

      const transaction = this.createTransactionRecord({
        type: rule.type,
        accountId: account.id,
        category: rule.category,
        amount: rule.amount,
        date,
        note: `Auto: ${rule.name}`,
        recurringId: rule.id,
      });

      if (rule.type === 'income') {
        account.balance = this.toMoney(account.balance + rule.amount);
      } else {
        account.balance = this.toMoney(account.balance - rule.amount);
      }

      rule.lastGeneratedOn = date;
      data.transactions.unshift(transaction);
      created.push(transaction);
    }

    this.save();
    return this.ok(`${created.length} transaksi recurring dibuat.`, { created: this.clone(created) }, warnings);
  }

  addDebt(input: CreateDebtInput): ActionResult<DebtEntry> {
    const data = this.requireData();
    if (!data) {
      return this.fail('Silakan login terlebih dahulu.');
    }

    const person = input.person.trim();
    const amount = this.readAmount(input.amount, true);

    if (!person) {
      return this.fail('Nama orang wajib diisi.');
    }

    if (amount === null || amount <= 0) {
      return this.fail('Nominal hutang/piutang harus lebih dari 0.');
    }

    if (!input.dueDate) {
      return this.fail('Tanggal jatuh tempo wajib diisi.');
    }

    const entry: DebtEntry = {
      id: this.makeId('debt'),
      kind: input.kind,
      person,
      amount,
      paidAmount: 0,
      dueDate: input.dueDate,
      note: input.note ?? '',
      status: this.resolveDebtStatus(amount, 0, input.dueDate),
      createdAt: new Date().toISOString(),
    };

    data.debts.unshift(entry);
    this.save();

    return this.ok(input.kind === 'debt' ? 'Hutang berhasil dicatat.' : 'Piutang berhasil dicatat.', this.clone(entry));
  }

  recordDebtPayment(id: string, value: unknown): ActionResult<DebtEntry> {
    const data = this.requireData();
    if (!data) {
      return this.fail('Silakan login terlebih dahulu.');
    }

    const payment = this.readAmount(value, true);
    const entry = data.debts.find((item) => item.id === id);

    if (!entry) {
      return this.fail('Data hutang/piutang tidak ditemukan.');
    }

    if (payment === null || payment <= 0) {
      return this.fail('Nominal pembayaran harus lebih dari 0.');
    }

    const remaining = this.toMoney(entry.amount - entry.paidAmount);
    if (payment > remaining) {
      return this.fail('Pembayaran melebihi sisa nominal.');
    }

    entry.paidAmount = this.toMoney(entry.paidAmount + payment);
    entry.status = this.resolveDebtStatus(entry.amount, entry.paidAmount, entry.dueDate);
    this.save();

    return this.ok(entry.status === 'paid' ? 'Status berubah menjadi lunas.' : 'Pembayaran sebagian berhasil dicatat.', this.clone(entry));
  }

  buildReport(filter: ReportFilter): ActionResult<ReportResult> {
    const data = this.requireData();
    if (!data) {
      return this.fail('Silakan login terlebih dahulu.');
    }

    if (filter.startDate && filter.endDate && filter.startDate > filter.endDate) {
      return this.fail('Start date tidak boleh lebih besar dari end date.');
    }

    const transactions = data.transactions
      .filter((transaction) => !filter.startDate || transaction.date >= filter.startDate)
      .filter((transaction) => !filter.endDate || transaction.date <= filter.endDate)
      .filter((transaction) => this.matchesAccountFilter(transaction, filter.accountId))
      .filter((transaction) => this.matchesCategoryFilter(transaction, filter.category));

    let totalIncome = 0;
    let totalExpense = 0;
    const categoryTotals = new Map<string, number>();
    const dailyTotals = new Map<string, DailyTotal>();

    for (const transaction of transactions) {
      const daily = dailyTotals.get(transaction.date) ?? { date: transaction.date, income: 0, expense: 0 };

      if (transaction.type === 'income') {
        totalIncome = this.toMoney(totalIncome + transaction.amount);
        daily.income = this.toMoney(daily.income + transaction.amount);
      }

      if (transaction.type === 'expense') {
        totalExpense = this.toMoney(totalExpense + transaction.amount);
        daily.expense = this.toMoney(daily.expense + transaction.amount);
        categoryTotals.set(transaction.category, this.toMoney((categoryTotals.get(transaction.category) ?? 0) + transaction.amount));
      }

      if (transaction.type === 'transfer' && transaction.fee && transaction.fee > 0) {
        totalExpense = this.toMoney(totalExpense + transaction.fee);
        daily.expense = this.toMoney(daily.expense + transaction.fee);
        categoryTotals.set('Biaya Admin', this.toMoney((categoryTotals.get('Biaya Admin') ?? 0) + transaction.fee));
      }

      dailyTotals.set(transaction.date, daily);
    }

    const sortedCategories = [...categoryTotals.entries()]
      .map(([category, total]) => ({ category, total }))
      .sort((first, second) => second.total - first.total);

    const result: ReportResult = {
      totalIncome,
      totalExpense,
      netCashflow: this.toMoney(totalIncome - totalExpense),
      largestExpenseCategory: sortedCategories[0]?.category ?? '-',
      categoryTotals: sortedCategories,
      dailyTotals: [...dailyTotals.values()].sort((first, second) => first.date.localeCompare(second.date)),
      accountBalances: data.accounts.map((account) => ({
        accountId: account.id,
        name: account.name,
        balance: account.balance,
      })),
      transactions: this.clone(transactions),
    };

    return this.ok('Laporan berhasil dibuat.', result);
  }

  exportTransactionsCsv(): ActionResult<string> {
    const data = this.requireData();
    if (!data) {
      return this.fail('Silakan login terlebih dahulu.');
    }

    const headers = ['type', 'date', 'account', 'fromAccount', 'toAccount', 'category', 'amount', 'fee', 'note'];
    const rows = data.transactions
      .slice()
      .reverse()
      .map((transaction) => [
        transaction.type,
        transaction.date,
        transaction.accountId ? this.accountName(transaction.accountId) : '',
        transaction.fromAccountId ? this.accountName(transaction.fromAccountId) : '',
        transaction.toAccountId ? this.accountName(transaction.toAccountId) : '',
        transaction.category,
        String(transaction.amount),
        String(transaction.fee ?? 0),
        transaction.note,
      ]);

    const csv = [headers, ...rows].map((row) => row.map((cell) => this.escapeCsv(cell)).join(',')).join('\n');
    return this.ok('CSV berhasil dibuat.', csv);
  }

  importTransactionsCsv(text: string): ActionResult<ImportResult> {
    const data = this.requireData();
    if (!data) {
      return this.fail('Silakan login terlebih dahulu.');
    }

    if (!text.trim()) {
      return this.fail('File CSV kosong.');
    }

    const rows = this.parseCsv(text);
    if (rows.length < 2) {
      return this.fail('CSV tidak memiliki data transaksi.');
    }

    const expectedHeaders = ['type', 'date', 'account', 'fromAccount', 'toAccount', 'category', 'amount', 'fee', 'note'];
    const headers = rows[0].map((header) => header.trim());
    if (headers.join('|') !== expectedHeaders.join('|')) {
      return this.fail('Kolom CSV tidak sesuai format FinMate.');
    }

    let imported = 0;
    let skipped = 0;
    const errors: string[] = [];
    const fingerprints = new Set(data.transactions.map((transaction) => this.transactionFingerprint(transaction)));

    for (const [index, row] of rows.slice(1).entries()) {
      const line = index + 2;
      const record = this.rowToRecord(headers, row);
      const type = record['type']?.trim().toLowerCase() ?? '';
      const date = record['date']?.trim() ?? '';
      const category = record['category']?.trim() ?? '';
      const amount = record['amount']?.trim() ?? '';
      const fee = record['fee']?.trim() ?? '0';
      const note = record['note']?.trim() ?? '';

      if (!['income', 'expense', 'transfer'].includes(type)) {
        errors.push(`Baris ${line}: type tidak valid.`);
        continue;
      }

      if (!date || Number.isNaN(Date.parse(date))) {
        errors.push(`Baris ${line}: tanggal tidak valid.`);
        continue;
      }

      const candidateFingerprint = this.csvFingerprint(record);
      if (fingerprints.has(candidateFingerprint)) {
        skipped += 1;
        continue;
      }

      let result: ActionResult<Transaction>;
      if (type === 'transfer') {
        const fromAccount = this.findAccountByName(record['fromAccount'] ?? '');
        const toAccount = this.findAccountByName(record['toAccount'] ?? '');
        result = this.transfer({
          fromAccountId: fromAccount?.id ?? '',
          toAccountId: toAccount?.id ?? '',
          amount,
          fee,
          date,
          note,
        });
      } else {
        const account = this.findAccountByName(record['account'] ?? '');
        result = this.addTransaction({
          type: type as Exclude<TransactionType, 'transfer'>,
          accountId: account?.id ?? '',
          category,
          amount,
          date,
          note,
        });
      }

      if (result.ok && result.data) {
        imported += 1;
        fingerprints.add(this.transactionFingerprint(result.data));
      } else {
        errors.push(`Baris ${line}: ${result.message}`);
      }
    }

    const message = errors.length > 0 ? 'Import selesai dengan beberapa error.' : 'Import CSV berhasil.';
    return this.ok(message, { imported, skipped, errors }, errors);
  }

  resetForTesting(seed = false): void {
    this.state = seed ? createSeedState() : { users: [], activeUserId: null, dataByUser: {} };
    this.save();
  }

  private loadState(): FinmateState {
    const raw = this.storageGet(STORAGE_KEY);
    if (!raw) {
      return createSeedState();
    }

    try {
      const parsed = JSON.parse(raw) as FinmateState;
      if (!Array.isArray(parsed.users) || !parsed.dataByUser) {
        return createSeedState();
      }

      return parsed;
    } catch {
      return createSeedState();
    }
  }

  private requireData(): FinmateData | null {
    const userId = this.state.activeUserId;
    if (!userId) {
      return null;
    }

    this.ensureUserData(userId);
    return this.state.dataByUser[userId];
  }

  private ensureUserData(userId: string): void {
    if (!this.state.dataByUser[userId]) {
      this.state.dataByUser[userId] = createEmptyFinmateData();
    }
  }

  private refreshDebtStatuses(): void {
    const data = this.requireData();
    if (!data) {
      return;
    }

    for (const entry of data.debts) {
      entry.status = this.resolveDebtStatus(entry.amount, entry.paidAmount, entry.dueDate);
    }
  }

  private resolveDebtStatus(amount: number, paidAmount: number, dueDate: string): DebtStatus {
    if (paidAmount >= amount) {
      return 'paid';
    }

    if (dueDate < todayIso()) {
      return 'overdue';
    }

    if (paidAmount > 0) {
      return 'partial';
    }

    return 'unpaid';
  }

  private matchesAccountFilter(transaction: Transaction, accountId: string): boolean {
    if (!accountId || accountId === 'all') {
      return true;
    }

    return transaction.accountId === accountId || transaction.fromAccountId === accountId || transaction.toAccountId === accountId;
  }

  private matchesCategoryFilter(transaction: Transaction, category: string): boolean {
    if (!category || category === 'all') {
      return true;
    }

    return transaction.category === category;
  }

  private createTransactionRecord(input: Omit<Transaction, 'id' | 'createdAt'>): Transaction {
    return {
      ...input,
      amount: this.toMoney(input.amount),
      fee: input.fee === undefined ? undefined : this.toMoney(input.fee),
      note: input.note.trim(),
      id: this.makeId('transaction'),
      createdAt: new Date().toISOString(),
    };
  }

  private getBudgetWarnings(data: FinmateData, category: string, date: string): string[] {
    const month = date.slice(0, 7);
    return this.getBudgetSummaries(month)
      .filter((summary) => summary.category === category)
      .filter((summary) => ['warning', 'full', 'over'].includes(summary.status))
      .map((summary) => {
        if (summary.status === 'over') {
          return `Budget ${category} overbudget.`;
        }

        if (summary.status === 'full') {
          return `Budget ${category} sudah habis.`;
        }

        return `Budget ${category} sudah mendekati batas.`;
      });
  }

  private resolveBudgetStatus(spent: number, limit: number): BudgetStatus {
    if (spent > limit) {
      return 'over';
    }

    if (spent === limit) {
      return 'full';
    }

    if (spent >= limit * 0.8) {
      return 'warning';
    }

    return 'safe';
  }

  private isRecurringDue(rule: RecurringRule, date: string): boolean {
    if (!rule.active) {
      return false;
    }

    if (date < rule.startsOn) {
      return false;
    }

    if (rule.endsOn && date > rule.endsOn) {
      return false;
    }

    const [year, month, day] = date.split('-').map(Number);
    const dueDay = Math.min(rule.dayOfMonth, daysInMonth(year, month));
    return day === dueDay;
  }

  private findAccountByName(name: string): Account | undefined {
    const data = this.requireData();
    if (!data) {
      return undefined;
    }

    return data.accounts.find((account) => account.name.toLowerCase() === name.trim().toLowerCase());
  }

  private accountName(id: string): string {
    const data = this.requireData();
    const account = data?.accounts.find((item) => item.id === id);
    return account?.name ?? '';
  }

  private transactionFingerprint(transaction: Transaction): string {
    return [
      transaction.type,
      transaction.date,
      transaction.accountId ? this.accountName(transaction.accountId) : '',
      transaction.fromAccountId ? this.accountName(transaction.fromAccountId) : '',
      transaction.toAccountId ? this.accountName(transaction.toAccountId) : '',
      transaction.category,
      transaction.amount,
      transaction.fee ?? 0,
      transaction.note,
    ].join('|');
  }

  private csvFingerprint(record: Record<string, string>): string {
    return [
      record['type']?.trim().toLowerCase() ?? '',
      record['date']?.trim() ?? '',
      record['account']?.trim() ?? '',
      record['fromAccount']?.trim() ?? '',
      record['toAccount']?.trim() ?? '',
      record['category']?.trim() ?? '',
      this.toMoney(Number(record['amount'] ?? 0)),
      this.toMoney(Number(record['fee'] ?? 0)),
      record['note']?.trim() ?? '',
    ].join('|');
  }

  private rowToRecord(headers: string[], row: string[]): Record<string, string> {
    return headers.reduce<Record<string, string>>((record, header, index) => {
      record[header] = row[index] ?? '';
      return record;
    }, {});
  }

  private parseCsv(text: string): string[][] {
    const rows: string[][] = [];
    let row: string[] = [];
    let cell = '';
    let insideQuotes = false;

    for (let index = 0; index < text.length; index += 1) {
      const character = text[index];
      const nextCharacter = text[index + 1];

      if (character === '"' && insideQuotes && nextCharacter === '"') {
        cell += '"';
        index += 1;
        continue;
      }

      if (character === '"') {
        insideQuotes = !insideQuotes;
        continue;
      }

      if (character === ',' && !insideQuotes) {
        row.push(cell);
        cell = '';
        continue;
      }

      if ((character === '\n' || character === '\r') && !insideQuotes) {
        if (character === '\r' && nextCharacter === '\n') {
          index += 1;
        }

        row.push(cell);
        rows.push(row);
        row = [];
        cell = '';
        continue;
      }

      cell += character;
    }

    if (cell.length > 0 || row.length > 0) {
      row.push(cell);
      rows.push(row);
    }

    return rows.filter((item) => item.some((value) => value.trim().length > 0));
  }

  private escapeCsv(value: string): string {
    if (/[",\n\r]/.test(value)) {
      return `"${value.replace(/"/g, '""')}"`;
    }

    return value;
  }

  private readAmount(value: unknown, mustBePositive: boolean): number | null {
    if (value === null || value === undefined || value === '') {
      return null;
    }

    const numberValue = typeof value === 'number' ? value : Number(String(value).replace(/\s/g, ''));
    if (!Number.isFinite(numberValue)) {
      return null;
    }

    const money = this.toMoney(numberValue);
    if (mustBePositive && money <= 0) {
      return money;
    }

    return money;
  }

  private toMoney(value: number): number {
    return Math.round(value * 100) / 100;
  }

  private sum(values: number[]): number {
    return this.toMoney(values.reduce((total, value) => total + value, 0));
  }

  private save(): void {
    this.storageSet(STORAGE_KEY, JSON.stringify(this.state));
  }

  private storageGet(key: string): string | null {
    try {
      return typeof localStorage === 'undefined' ? null : localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  private storageSet(key: string, value: string): void {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(key, value);
      }
    } catch {
      return;
    }
  }

  private makeId(prefix: string): string {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
      return `${prefix}_${crypto.randomUUID()}`;
    }

    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  }

  private ok<T>(message: string, data: T, warnings: string[] = []): ActionResult<T> {
    return { ok: true, message, data, warnings };
  }

  private fail<T = never>(message: string): ActionResult<T> {
    return { ok: false, message };
  }

  private clone<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T;
  }
}

export function createEmptyFinmateData(): FinmateData {
  return {
    accounts: [],
    transactions: [],
    budgets: [],
    recurringRules: [],
    debts: [],
  };
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function createSeedState(): FinmateState {
  const demoUser: User = {
    id: 'user_demo',
    name: 'Demo User',
    email: DEMO_EMAIL,
    password: DEMO_PASSWORD,
    failedLoginAttempts: 0,
  };

  const month = todayIso().slice(0, 7);
  const today = todayIso();
  const cashId = 'account_cash';
  const bcaId = 'account_bca';
  const danaId = 'account_dana';

  return {
    users: [demoUser],
    activeUserId: demoUser.id,
    dataByUser: {
      [demoUser.id]: {
        accounts: [
          { id: cashId, name: 'Cash', type: 'Cash', balance: 350000, createdAt: today },
          { id: bcaId, name: 'BCA', type: 'Bank', balance: 3000000, createdAt: today },
          { id: danaId, name: 'DANA', type: 'E-Wallet', balance: 250000, createdAt: today },
        ],
        transactions: [
          {
            id: 'tx_expense_food',
            type: 'expense',
            accountId: cashId,
            category: 'Makanan',
            amount: 125000,
            date: today,
            note: 'Makan minggu ini',
            createdAt: today,
          },
          {
            id: 'tx_transfer_dana',
            type: 'transfer',
            fromAccountId: bcaId,
            toAccountId: danaId,
            category: 'Transfer',
            amount: 100000,
            fee: 2500,
            date: today,
            note: 'Top up DANA',
            createdAt: today,
          },
          {
            id: 'tx_income_salary',
            type: 'income',
            accountId: bcaId,
            category: 'Gaji',
            amount: 4000000,
            date: `${month}-01`,
            note: 'Gaji bulanan',
            createdAt: today,
          },
        ],
        budgets: [
          { id: 'budget_food', category: 'Makanan', month, limit: 1000000 },
          { id: 'budget_transport', category: 'Transportasi', month, limit: 500000 },
          { id: 'budget_entertainment', category: 'Hiburan', month, limit: 300000 },
        ],
        recurringRules: [
          {
            id: 'recurring_salary',
            name: 'Gaji Bulanan',
            type: 'income',
            accountId: bcaId,
            category: 'Gaji',
            amount: 4000000,
            dayOfMonth: 25,
            startsOn: `${month}-01`,
            active: true,
          },
          {
            id: 'recurring_spotify',
            name: 'Spotify',
            type: 'expense',
            accountId: danaId,
            category: 'Hiburan',
            amount: 54990,
            dayOfMonth: 10,
            startsOn: `${month}-01`,
            active: true,
          },
        ],
        debts: [
          {
            id: 'debt_laptop',
            kind: 'debt',
            person: 'Cicilan Laptop',
            amount: 1200000,
            paidAmount: 600000,
            dueDate: `${month}-28`,
            note: 'Cicilan bulan ini',
            status: 'partial',
            createdAt: today,
          },
          {
            id: 'debt_friend',
            kind: 'receivable',
            person: 'Rafi',
            amount: 150000,
            paidAmount: 0,
            dueDate: `${month}-20`,
            note: 'Pinjam makan',
            status: 'unpaid',
            createdAt: today,
          },
        ],
      },
    },
  };
}

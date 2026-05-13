import { Component, OnInit } from '@angular/core';
import {
  ACCOUNT_TYPES,
  ActionResult,
  Account,
  AccountType,
  BudgetSummary,
  DebtEntry,
  EXPENSE_CATEGORIES,
  FinmateData,
  INCOME_CATEGORIES,
  ImportResult,
  RecurringRule,
  ReportFilter,
  ReportResult,
  Transaction,
  TransactionType,
  User,
  createEmptyFinmateData,
  todayIso,
} from '../services/finmate-store.service';
import { SupabaseService } from '../services/supabase.service';

type AuthMode = 'login' | 'register';
type SectionKey = 'dashboard' | 'accounts' | 'transactions' | 'budget' | 'recurring' | 'debts' | 'reports' | 'csv';
type NoticeTone = 'success' | 'warning' | 'danger' | 'medium';

interface SectionItem {
  key: SectionKey;
  label: string;
  icon: string;
}

interface ImportRecord {
  type: string;
  date: string;
  account: string;
  fromAccount: string;
  toAccount: string;
  category: string;
  amount: string;
  fee: string;
  note: string;
}

const SESSION_KEY = 'finmate_session_user_id';
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
  standalone: false,
})
export class HomePage implements OnInit {
  isAppInitializing = true;

  readonly accountTypes: readonly AccountType[] = ACCOUNT_TYPES;
  readonly incomeCategories: readonly string[] = INCOME_CATEGORIES;
  readonly expenseCategories: readonly string[] = EXPENSE_CATEGORIES;
  readonly sections: SectionItem[] = [
    { key: 'dashboard', label: 'Dashboard', icon: 'grid-outline' },
    { key: 'accounts', label: 'Akun', icon: 'wallet-outline' },
    { key: 'transactions', label: 'Transaksi', icon: 'swap-horizontal-outline' },
    { key: 'budget', label: 'Budget', icon: 'speedometer-outline' },
    { key: 'recurring', label: 'Langganan', icon: 'repeat-outline' },
    { key: 'debts', label: 'Hutang', icon: 'receipt-outline' },
    { key: 'reports', label: 'Laporan', icon: 'bar-chart-outline' },
    { key: 'csv', label: 'CSV', icon: 'document-attach-outline' },
  ];

  currentUser: User | null = null;
  data: FinmateData = createEmptyFinmateData();
  budgetSummaries: BudgetSummary[] = [];
  report: ReportResult | null = null;

  authMode: AuthMode = 'login';
  selectedSection: SectionKey = 'dashboard';
  notice = '';
  noticeTone: NoticeTone = 'medium';

  today = todayIso();
  currentMonth = this.today.slice(0, 7);
  paymentForms: Record<string, number | null> = {};
  lastImport: ImportResult | null = null;

  loginForm = {
    email: '',
    password: '',
  };

  registerForm = {
    name: '',
    email: '',
    password: '',
  };

  accountForm = {
    name: '',
    type: 'Cash' as AccountType,
    initialBalance: 0 as number | null,
  };

  transactionForm = {
    type: 'expense' as 'income' | 'expense',
    accountId: '',
    category: 'Makanan',
    amount: null as number | null,
    date: this.today,
    note: '',
  };

  transferForm = {
    fromAccountId: '',
    toAccountId: '',
    amount: null as number | null,
    fee: 0 as number | null,
    date: this.today,
    note: '',
  };

  budgetForm = {
    category: 'Makanan',
    month: this.currentMonth,
    limit: null as number | null,
  };

  recurringForm = {
    name: '',
    type: 'expense' as 'income' | 'expense',
    accountId: '',
    category: 'Tagihan',
    amount: null as number | null,
    dayOfMonth: 1 as number | null,
    startsOn: this.today,
    endsOn: '',
    active: true,
  };

  debtForm = {
    kind: 'debt' as 'debt' | 'receivable',
    person: '',
    amount: null as number | null,
    dueDate: this.today,
    note: '',
  };

  reportFilter: ReportFilter = {
    startDate: `${this.currentMonth}-01`,
    endDate: this.today,
    accountId: 'all',
    category: 'all',
  };

  constructor(private readonly supabaseService: SupabaseService) {}

  get transactionCategories(): readonly string[] {
    return this.transactionForm.type === 'income' ? this.incomeCategories : this.expenseCategories;
  }

  get recurringCategories(): readonly string[] {
    return this.recurringForm.type === 'income' ? this.incomeCategories : this.expenseCategories;
  }

  async ngOnInit(): Promise<void> {
    this.isAppInitializing = true;
    await this.restoreSession();

    if (this.currentUser) {
      await this.loadAllData();
      await this.generateRecurringToday(false);
    }

    this.isAppInitializing = false;
  }

  async submitRegister2(): Promise<void> {
    const name = this.registerForm.name.trim();
    const email = this.registerForm.email.trim().toLowerCase();
    const password = this.registerForm.password;

    if (!name) {
      this.showNotice('Name wajib diisi.', 'danger');
      return;
    }

    if (!email) {
      this.showNotice('Email wajib diisi.', 'danger');
      return;
    }

    if (!EMAIL_PATTERN.test(email)) {
      this.showNotice('Format email tidak valid.', 'danger');
      return;
    }

    if (!password) {
      this.showNotice('Password wajib diisi.', 'danger');
      return;
    }

    if (password.length < 6) {
      this.showNotice('Password minimal 6 karakter.', 'danger');
      return;
    }

    const result = await this.supabaseService.signUpManual(email, name, password);
    if (result.error) {
      this.showNotice(result.error.message, 'danger');
      return;
    }

    this.registerForm = { name: '', email: '', password: '' };
    this.authMode = 'login';
    this.showNotice('Registrasi berhasil. Silakan login.', 'success');
  }

  async submitLogin2(): Promise<void> {
    const email = this.loginForm.email.trim().toLowerCase();
    const password = this.loginForm.password;

    if (!email) {
      this.showNotice('Email wajib diisi.', 'danger');
      return;
    }

    if (!password) {
      this.showNotice('Password wajib diisi.', 'danger');
      return;
    }

    const result = await this.supabaseService.signInManual(email, password);
    if (result.error || !result.data) {
      this.showNotice('Email atau password salah.', 'danger');
      return;
    }

    this.currentUser = result.data;
    this.setSessionUserId(result.data.id);
    await this.loadAllData();
    this.showNotice(`Selamat datang, ${result.data.name}.`, 'success');
  }

  logout(): void {
    this.clearSessionUserId();
    this.currentUser = null;
    this.data = createEmptyFinmateData();
    this.report = null;
    this.budgetSummaries = [];
    this.showNotice('Logout berhasil.', 'medium');
  }

  async addAccount(): Promise<void> {
    const user = this.requireUser();
    if (!user) {
      return;
    }

    const name = this.accountForm.name.trim();
    const balance = this.readAmount(this.accountForm.initialBalance);

    if (!name) {
      this.showNotice('Account name wajib diisi.', 'danger');
      return;
    }

    if (balance === null) {
      this.showNotice('Initial balance wajib berupa angka.', 'danger');
      return;
    }

    if (balance < 0) {
      this.showNotice('Initial balance tidak boleh negatif.', 'danger');
      return;
    }

    if (this.data.accounts.some((account) => account.name.toLowerCase() === name.toLowerCase())) {
      this.showNotice('Account name sudah digunakan.', 'danger');
      return;
    }

    const result = await this.supabaseService.addAccount(user.id, name, this.accountForm.type, balance);
    if (result.error) {
      this.showNotice(result.error.message, 'danger');
      return;
    }

    this.accountForm = { name: '', type: 'Cash', initialBalance: 0 };
    await this.loadAllData();
    this.showNotice('Akun berhasil ditambahkan.', 'success');
  }

  async addTransaction(): Promise<void> {
    const result = await this.createIncomeExpenseTransaction({
      type: this.transactionForm.type,
      accountId: this.transactionForm.accountId,
      category: this.transactionForm.category,
      amount: this.transactionForm.amount,
      date: this.transactionForm.date,
      note: this.transactionForm.note,
    });

    this.handleResult(result.ok, result.message, result.warnings);
    if (result.ok) {
      this.transactionForm.amount = null;
      this.transactionForm.note = '';
      await this.loadAllData();
    }
  }

  async transfer(): Promise<void> {
    const result = await this.createTransferTransaction({
      fromAccountId: this.transferForm.fromAccountId,
      toAccountId: this.transferForm.toAccountId,
      amount: this.transferForm.amount,
      fee: this.transferForm.fee,
      date: this.transferForm.date,
      note: this.transferForm.note,
    });

    this.handleResult(result.ok, result.message, result.warnings);
    if (result.ok) {
      this.transferForm.amount = null;
      this.transferForm.fee = 0;
      this.transferForm.note = '';
      await this.loadAllData();
    }
  }

  async saveBudget(): Promise<void> {
    const user = this.requireUser();
    if (!user) {
      return;
    }

    const category = this.budgetForm.category.trim();
    const limit = this.readAmount(this.budgetForm.limit);

    if (!category) {
      this.showNotice('Kategori budget wajib dipilih.', 'danger');
      return;
    }

    if (!/^\d{4}-\d{2}$/.test(this.budgetForm.month)) {
      this.showNotice('Periode budget wajib dipilih.', 'danger');
      return;
    }

    if (limit === null || limit <= 0) {
      this.showNotice('Budget harus lebih dari 0.', 'danger');
      return;
    }

    const result = await this.supabaseService.upsertBudget(user.id, { ...this.budgetForm, category }, limit);
    if (result.error) {
      this.showNotice(result.error.message, 'danger');
      return;
    }

    this.budgetForm.limit = null;
    await this.loadAllData();
    this.showNotice('Budget berhasil disimpan.', 'success');
  }

  refreshBudgetPeriod(): void {
    this.refreshDerivedState();
  }

  async addRecurring(): Promise<void> {
    const user = this.requireUser();
    if (!user) {
      return;
    }

    const name = this.recurringForm.name.trim();
    const amount = this.readAmount(this.recurringForm.amount);
    const dayOfMonth = Number(this.recurringForm.dayOfMonth);

    if (!name) {
      this.showNotice('Nama recurring wajib diisi.', 'danger');
      return;
    }

    if (!this.data.accounts.some((account) => account.id === this.recurringForm.accountId)) {
      this.showNotice('Akun recurring wajib dipilih.', 'danger');
      return;
    }

    if (!this.recurringForm.category.trim()) {
      this.showNotice('Kategori recurring wajib dipilih.', 'danger');
      return;
    }

    if (amount === null || amount <= 0) {
      this.showNotice('Nominal recurring harus lebih dari 0.', 'danger');
      return;
    }

    if (!Number.isInteger(dayOfMonth) || dayOfMonth < 1 || dayOfMonth > 31) {
      this.showNotice('Tanggal recurring harus di antara 1 sampai 31.', 'danger');
      return;
    }

    if (!this.recurringForm.startsOn) {
      this.showNotice('Tanggal mulai recurring wajib diisi.', 'danger');
      return;
    }

    if (this.recurringForm.endsOn && this.recurringForm.endsOn < this.recurringForm.startsOn) {
      this.showNotice('Tanggal selesai tidak boleh sebelum tanggal mulai.', 'danger');
      return;
    }

    const result = await this.supabaseService.addRecurringRule(user.id, { ...this.recurringForm, name }, amount, dayOfMonth);
    if (result.error) {
      this.showNotice(result.error.message, 'danger');
      return;
    }

    this.recurringForm = {
      ...this.recurringForm,
      name: '',
      amount: null,
      dayOfMonth: 1,
      endsOn: '',
    };
    await this.loadAllData();
    this.showNotice('Recurring transaction berhasil dibuat.', 'success');
  }

  async toggleRecurring(id: string, active: boolean): Promise<void> {
    const result = await this.supabaseService.updateRecurringActive(id, active);
    if (result.error) {
      this.showNotice(result.error.message, 'danger');
      return;
    }

    await this.loadAllData();
    this.showNotice(active ? 'Recurring diaktifkan.' : 'Recurring dinonaktifkan.', 'success');
  }

  async generateRecurringToday(showMessage = true): Promise<void> {
    const user = this.requireUser(false);
    if (!user) {
      return;
    }

    const created: Transaction[] = [];
    const warnings: string[] = [];

    for (const rule of this.data.recurringRules) {
      if (!this.isRecurringDue(rule, this.today)) {
        continue;
      }

      const duplicate = this.data.transactions.some((transaction) => this.matchesRecurringTransaction(transaction, rule, this.today));
      if (duplicate) {
        continue;
      }

      const account = this.data.accounts.find((item) => item.id === rule.accountId);
      if (!account) {
        warnings.push(`${rule.name}: akun tidak ditemukan.`);
        continue;
      }

      if (rule.type === 'expense' && account.balance < rule.amount) {
        warnings.push(`${rule.name}: saldo ${account.name} tidak mencukupi.`);
        continue;
      }

      const result = await this.createIncomeExpenseTransaction({
        type: rule.type,
        accountId: rule.accountId,
        category: rule.category,
        amount: rule.amount,
        date: this.today,
        note: `Auto: ${rule.name}`,
        recurringId: rule.id,
      });

      if (result.ok && result.data) {
        created.push(result.data);
      } else {
        warnings.push(`${rule.name}: ${result.message}`);
      }
    }

    if (created.length > 0 || warnings.length > 0) {
      await this.loadAllData();
    }

    if (showMessage) {
      this.showNotice(`${created.length} transaksi recurring dibuat.`, warnings.length > 0 ? 'warning' : 'success', warnings);
    }
  }

  async addDebt(): Promise<void> {
    const user = this.requireUser();
    if (!user) {
      return;
    }

    const person = this.debtForm.person.trim();
    const amount = this.readAmount(this.debtForm.amount);

    if (!person) {
      this.showNotice('Nama orang wajib diisi.', 'danger');
      return;
    }

    if (amount === null || amount <= 0) {
      this.showNotice('Nominal hutang/piutang harus lebih dari 0.', 'danger');
      return;
    }

    if (!this.debtForm.dueDate) {
      this.showNotice('Tanggal jatuh tempo wajib diisi.', 'danger');
      return;
    }

    const status = this.resolveDebtStatus(amount, 0, this.debtForm.dueDate);
    const result = await this.supabaseService.addDebt(user.id, { ...this.debtForm, person }, amount, status);
    if (result.error) {
      this.showNotice(result.error.message, 'danger');
      return;
    }

    this.debtForm = {
      ...this.debtForm,
      person: '',
      amount: null,
      note: '',
    };
    await this.loadAllData();
    this.showNotice(this.debtForm.kind === 'debt' ? 'Hutang berhasil dicatat.' : 'Piutang berhasil dicatat.', 'success');
  }

  async payDebt(id: string): Promise<void> {
    const payment = this.readAmount(this.paymentForms[id]);
    const entry = this.data.debts.find((item) => item.id === id);

    if (!entry) {
      this.showNotice('Data hutang/piutang tidak ditemukan.', 'danger');
      return;
    }

    if (payment === null || payment <= 0) {
      this.showNotice('Nominal pembayaran harus lebih dari 0.', 'danger');
      return;
    }

    const remaining = this.toMoney(entry.amount - entry.paidAmount);
    if (payment > remaining) {
      this.showNotice('Pembayaran melebihi sisa nominal.', 'danger');
      return;
    }

    const paidAmount = this.toMoney(entry.paidAmount + payment);
    const status = this.resolveDebtStatus(entry.amount, paidAmount, entry.dueDate);
    const result = await this.supabaseService.updateDebtPayment(id, paidAmount, status);

    if (result.error) {
      this.showNotice(result.error.message, 'danger');
      return;
    }

    this.paymentForms[id] = null;
    await this.loadAllData();
    this.showNotice(status === 'paid' ? 'Status berubah menjadi lunas.' : 'Pembayaran sebagian berhasil dicatat.', 'success');
  }

  runReport(showMessage = true): void {
    const result = this.buildReport(this.reportFilter);
    if (result.ok && result.data) {
      this.report = result.data;
      if (showMessage) {
        this.showNotice(result.message, 'success', result.warnings);
      }
      return;
    }

    this.report = null;
    this.showNotice(result.message, 'danger', result.warnings);
  }

  exportCsv(): void {
    if (!this.currentUser) {
      this.showNotice('Silakan login terlebih dahulu.', 'danger');
      return;
    }

    const headers = ['type', 'date', 'account', 'fromAccount', 'toAccount', 'category', 'amount', 'fee', 'note'];
    const rows = this.data.transactions
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
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `finmate-transactions-${this.today}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
    this.showNotice('CSV berhasil dibuat.', 'success');
  }

  importCsv(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];

    if (!file) {
      return;
    }

    if (!file.name.toLowerCase().endsWith('.csv')) {
      this.showNotice('File harus berformat CSV.', 'danger');
      input.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = async () => {
      const result = await this.importTransactionsCsvText(String(reader.result ?? ''));
      this.lastImport = result.data ?? null;
      this.handleResult(result.ok, result.message, result.warnings);
      input.value = '';
    };
    reader.readAsText(file);
  }

  onTransactionTypeChange(): void {
    this.transactionForm.category = this.transactionForm.type === 'income' ? 'Gaji' : 'Makanan';
  }

  onRecurringTypeChange(): void {
    this.recurringForm.category = this.recurringForm.type === 'income' ? 'Gaji' : 'Tagihan';
  }

  accountName(id: string | undefined): string {
    if (!id) {
      return '-';
    }

    return this.data.accounts.find((account) => account.id === id)?.name ?? '-';
  }

  transactionTitle(transaction: Transaction): string {
    if (transaction.type === 'transfer') {
      return `${this.accountName(transaction.fromAccountId)} ke ${this.accountName(transaction.toAccountId)}`;
    }

    return `${transaction.category} dari ${this.accountName(transaction.accountId)}`;
  }

  transactionAmount(transaction: Transaction): string {
    if (transaction.type === 'income') {
      return `+${this.formatCurrency(transaction.amount)}`;
    }

    if (transaction.type === 'transfer') {
      const total = transaction.amount + (transaction.fee ?? 0);
      return `-${this.formatCurrency(total)}`;
    }

    return `-${this.formatCurrency(transaction.amount)}`;
  }

  debtLabel(entry: DebtEntry): string {
    if (entry.status === 'paid') {
      return 'Lunas';
    }

    if (entry.status === 'partial') {
      return 'Dibayar sebagian';
    }

    if (entry.status === 'overdue') {
      return 'Terlambat';
    }

    return 'Belum dibayar';
  }

  debtColor(entry: DebtEntry): string {
    if (entry.status === 'paid') {
      return 'success';
    }

    if (entry.status === 'partial') {
      return 'warning';
    }

    if (entry.status === 'overdue') {
      return 'danger';
    }

    return 'medium';
  }

  budgetColor(status: string): string {
    if (status === 'over') {
      return 'danger';
    }

    if (status === 'full' || status === 'warning') {
      return 'warning';
    }

    return 'success';
  }

  budgetStatusLabel(summary: BudgetSummary): string {
    if (summary.status === 'over') {
      return 'Overbudget';
    }

    if (summary.status === 'full') {
      return 'Budget habis';
    }

    if (summary.status === 'warning') {
      return 'Mendekati batas';
    }

    return 'Aman';
  }

  recurringAccount(rule: RecurringRule): string {
    return this.accountName(rule.accountId);
  }

  formatCurrency(value: number): string {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      maximumFractionDigits: 0,
    }).format(value);
  }

  dailyBarHeight(value: number): number {
    const totals = this.report?.dailyTotals ?? [];
    const max = Math.max(0, ...totals.map((item) => Math.max(item.income, item.expense)));
    if (max <= 0 || value <= 0) {
      return 4;
    }

    return Math.max(8, Math.round((value / max) * 100));
  }

  totalBalance(): number {
    return this.toMoney(this.data.accounts.reduce((total, account) => total + account.balance, 0));
  }

  remainingDebt(entry: DebtEntry): number {
    return Math.max(entry.amount - entry.paidAmount, 0);
  }

  trackById(_index: number, item: Account | Transaction | BudgetSummary | RecurringRule | DebtEntry): string {
    return item.id;
  }

  private async restoreSession(): Promise<void> {
    const userId = this.getSessionUserId();
    if (!userId) {
      return;
    }

    const result = await this.supabaseService.getProfileById(userId);
    if (result.data && !result.error) {
      this.currentUser = result.data;
      return;
    }

    this.clearSessionUserId();
  }

  private async loadAllData(): Promise<void> {
    const user = this.requireUser(false);
    if (!user) {
      return;
    }

    const result = await this.supabaseService.getAllData(user.id);
    if (result.error || !result.data) {
      this.data = createEmptyFinmateData();
      this.showNotice(result.error?.message ?? 'Gagal mengambil data dari Supabase.', 'danger');
      return;
    }

    this.data = result.data;
    this.refreshDerivedState();
    this.runReport(false);
  }

  private refreshDerivedState(): void {
    this.data.debts = this.data.debts.map((entry) => ({
      ...entry,
      status: this.resolveDebtStatus(entry.amount, entry.paidAmount, entry.dueDate),
    }));
    this.budgetSummaries = this.getBudgetSummaries(this.budgetForm.month);

    if (!this.transactionForm.accountId && this.data.accounts[0]) {
      this.transactionForm.accountId = this.data.accounts[0].id;
    }

    if (!this.transferForm.fromAccountId && this.data.accounts[0]) {
      this.transferForm.fromAccountId = this.data.accounts[0].id;
    }

    if (!this.transferForm.toAccountId && this.data.accounts[1]) {
      this.transferForm.toAccountId = this.data.accounts[1].id;
    }

    if (!this.recurringForm.accountId && this.data.accounts[0]) {
      this.recurringForm.accountId = this.data.accounts[0].id;
    }
  }

  private async createIncomeExpenseTransaction(input: {
    type: Exclude<TransactionType, 'transfer'>;
    accountId: string;
    category: string;
    amount: unknown;
    date: string;
    note?: string;
    recurringId?: string;
  }): Promise<ActionResult<Transaction>> {
    const user = this.requireUser(false);
    if (!user) {
      return this.fail('Silakan login terlebih dahulu.');
    }

    const amount = this.readAmount(input.amount);
    const account = this.data.accounts.find((item) => item.id === input.accountId);
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

    const previousBalance = account.balance;
    const nextBalance = input.type === 'income' ? this.toMoney(account.balance + amount) : this.toMoney(account.balance - amount);
    const updatedAccount = await this.supabaseService.updateAccountBalance(account.id, nextBalance);

    if (updatedAccount.error) {
      return this.fail(updatedAccount.error.message);
    }

    account.balance = nextBalance;
    const inserted = await this.supabaseService.addTransaction(user.id, {
      type: input.type,
      accountId: account.id,
      category,
      amount,
      date: input.date,
      note: input.note ?? '',
      recurringId: input.recurringId,
    });

    if (inserted.error || !inserted.data) {
      await this.supabaseService.updateAccountBalance(account.id, previousBalance);
      account.balance = previousBalance;
      return this.fail(inserted.error?.message ?? 'Gagal menyimpan transaksi.');
    }

    this.data.transactions.unshift(inserted.data);
    const warnings = input.type === 'expense' ? this.getBudgetWarnings(category, input.date) : [];
    return this.ok(`${input.type === 'income' ? 'Income' : 'Expense'} berhasil ditambahkan.`, inserted.data, warnings);
  }

  private async createTransferTransaction(input: {
    fromAccountId: string;
    toAccountId: string;
    amount: unknown;
    fee: unknown;
    date: string;
    note?: string;
  }): Promise<ActionResult<Transaction>> {
    const user = this.requireUser(false);
    if (!user) {
      return this.fail('Silakan login terlebih dahulu.');
    }

    const amount = this.readAmount(input.amount);
    const fee = this.readAmount(input.fee) ?? 0;
    const fromAccount = this.data.accounts.find((account) => account.id === input.fromAccountId);
    const toAccount = this.data.accounts.find((account) => account.id === input.toAccountId);

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

    const previousFromBalance = fromAccount.balance;
    const previousToBalance = toAccount.balance;
    const nextFromBalance = this.toMoney(fromAccount.balance - totalDebit);
    const nextToBalance = this.toMoney(toAccount.balance + amount);

    const updateFrom = await this.supabaseService.updateAccountBalance(fromAccount.id, nextFromBalance);
    if (updateFrom.error) {
      return this.fail(updateFrom.error.message);
    }

    const updateTo = await this.supabaseService.updateAccountBalance(toAccount.id, nextToBalance);
    if (updateTo.error) {
      await this.supabaseService.updateAccountBalance(fromAccount.id, previousFromBalance);
      return this.fail(updateTo.error.message);
    }

    fromAccount.balance = nextFromBalance;
    toAccount.balance = nextToBalance;

    const inserted = await this.supabaseService.addTransaction(user.id, {
      type: 'transfer',
      fromAccountId: fromAccount.id,
      toAccountId: toAccount.id,
      category: 'Transfer',
      amount,
      fee,
      date: input.date,
      note: input.note ?? '',
    });

    if (inserted.error || !inserted.data) {
      await Promise.all([
        this.supabaseService.updateAccountBalance(fromAccount.id, previousFromBalance),
        this.supabaseService.updateAccountBalance(toAccount.id, previousToBalance),
      ]);
      fromAccount.balance = previousFromBalance;
      toAccount.balance = previousToBalance;
      return this.fail(inserted.error?.message ?? 'Gagal menyimpan transfer.');
    }

    this.data.transactions.unshift(inserted.data);
    return this.ok('Transfer berhasil dicatat.', inserted.data);
  }

  private buildReport(filter: ReportFilter): ActionResult<ReportResult> {
    if (!this.currentUser) {
      return this.fail('Silakan login terlebih dahulu.');
    }

    if (filter.startDate && filter.endDate && filter.startDate > filter.endDate) {
      return this.fail('Start date tidak boleh lebih besar dari end date.');
    }

    const transactions = this.data.transactions
      .filter((transaction) => !filter.startDate || transaction.date >= filter.startDate)
      .filter((transaction) => !filter.endDate || transaction.date <= filter.endDate)
      .filter((transaction) => this.matchesAccountFilter(transaction, filter.accountId))
      .filter((transaction) => this.matchesCategoryFilter(transaction, filter.category));

    let totalIncome = 0;
    let totalExpense = 0;
    const categoryTotals = new Map<string, number>();
    const dailyTotals = new Map<string, { date: string; income: number; expense: number }>();

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

    return this.ok('Laporan berhasil dibuat.', {
      totalIncome,
      totalExpense,
      netCashflow: this.toMoney(totalIncome - totalExpense),
      largestExpenseCategory: sortedCategories[0]?.category ?? '-',
      categoryTotals: sortedCategories,
      dailyTotals: [...dailyTotals.values()].sort((first, second) => first.date.localeCompare(second.date)),
      accountBalances: this.data.accounts.map((account) => ({
        accountId: account.id,
        name: account.name,
        balance: account.balance,
      })),
      transactions,
    });
  }

  private getBudgetSummaries(month: string): BudgetSummary[] {
    return this.data.budgets
      .filter((budget) => budget.month === month)
      .map((budget) => {
        const spent = this.sum(
          this.data.transactions
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

  private async importTransactionsCsvText(text: string): Promise<ActionResult<ImportResult>> {
    if (!this.currentUser) {
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
    const fingerprints = new Set(this.data.transactions.map((transaction) => this.transactionFingerprint(transaction)));

    for (const [index, row] of rows.slice(1).entries()) {
      const line = index + 2;
      const record = this.rowToRecord(headers, row);
      const type = record.type.trim().toLowerCase();

      if (!['income', 'expense', 'transfer'].includes(type)) {
        errors.push(`Baris ${line}: type tidak valid.`);
        continue;
      }

      if (!record.date || Number.isNaN(Date.parse(record.date))) {
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
        result = await this.createTransferTransaction({
          fromAccountId: this.findAccountByName(record.fromAccount)?.id ?? '',
          toAccountId: this.findAccountByName(record.toAccount)?.id ?? '',
          amount: record.amount,
          fee: record.fee,
          date: record.date,
          note: record.note,
        });
      } else {
        result = await this.createIncomeExpenseTransaction({
          type: type as Exclude<TransactionType, 'transfer'>,
          accountId: this.findAccountByName(record.account)?.id ?? '',
          category: record.category,
          amount: record.amount,
          date: record.date,
          note: record.note,
        });
      }

      if (result.ok && result.data) {
        imported += 1;
        fingerprints.add(this.transactionFingerprint(result.data));
      } else {
        errors.push(`Baris ${line}: ${result.message}`);
      }
    }

    await this.loadAllData();
    const message = errors.length > 0 ? 'Import selesai dengan beberapa error.' : 'Import CSV berhasil.';
    return this.ok(message, { imported, skipped, errors }, errors);
  }

  private getBudgetWarnings(category: string, date: string): string[] {
    return this.getBudgetSummaries(date.slice(0, 7))
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

  private resolveBudgetStatus(spent: number, limit: number): BudgetSummary['status'] {
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

  private resolveDebtStatus(amount: number, paidAmount: number, dueDate: string): DebtEntry['status'] {
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

  private isRecurringDue(rule: RecurringRule, date: string): boolean {
    if (!rule.active || date < rule.startsOn || (rule.endsOn && date > rule.endsOn)) {
      return false;
    }

    const [year, month, day] = date.split('-').map(Number);
    const dueDay = Math.min(rule.dayOfMonth, new Date(year, month, 0).getDate());
    return day === dueDay;
  }

  private matchesRecurringTransaction(transaction: Transaction, rule: RecurringRule, date: string): boolean {
    return (
      transaction.date === date &&
      transaction.type === rule.type &&
      transaction.accountId === rule.accountId &&
      transaction.category === rule.category &&
      transaction.amount === rule.amount &&
      transaction.note === `Auto: ${rule.name}`
    );
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

  private findAccountByName(name: string): Account | undefined {
    return this.data.accounts.find((account) => account.name.toLowerCase() === name.trim().toLowerCase());
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

  private csvFingerprint(record: ImportRecord): string {
    return [
      record.type.trim().toLowerCase(),
      record.date.trim(),
      record.account.trim(),
      record.fromAccount.trim(),
      record.toAccount.trim(),
      record.category.trim(),
      this.toMoney(Number(record.amount || 0)),
      this.toMoney(Number(record.fee || 0)),
      record.note.trim(),
    ].join('|');
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

  private rowToRecord(headers: string[], row: string[]): ImportRecord {
    const record = headers.reduce<Record<string, string>>((current, header, index) => {
      current[header] = row[index] ?? '';
      return current;
    }, {});

    return {
      type: record['type'] ?? '',
      date: record['date'] ?? '',
      account: record['account'] ?? '',
      fromAccount: record['fromAccount'] ?? '',
      toAccount: record['toAccount'] ?? '',
      category: record['category'] ?? '',
      amount: record['amount'] ?? '',
      fee: record['fee'] ?? '',
      note: record['note'] ?? '',
    };
  }

  private escapeCsv(value: string): string {
    if (/[",\n\r]/.test(value)) {
      return `"${value.replace(/"/g, '""')}"`;
    }

    return value;
  }

  private readAmount(value: unknown): number | null {
    if (value === null || value === undefined || value === '') {
      return null;
    }

    const numberValue = typeof value === 'number' ? value : Number(String(value).replace(/\s/g, ''));
    if (!Number.isFinite(numberValue)) {
      return null;
    }

    return this.toMoney(numberValue);
  }

  private toMoney(value: number): number {
    return Math.round(value * 100) / 100;
  }

  private sum(values: number[]): number {
    return this.toMoney(values.reduce((total, value) => total + value, 0));
  }

  private requireUser(showError = true): User | null {
    if (this.currentUser) {
      return this.currentUser;
    }

    if (showError) {
      this.showNotice('Silakan login terlebih dahulu.', 'danger');
    }

    return null;
  }

  private getSessionUserId(): string | null {
    try {
      return typeof sessionStorage === 'undefined' ? null : sessionStorage.getItem(SESSION_KEY);
    } catch {
      return null;
    }
  }

  private setSessionUserId(userId: string): void {
    try {
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.setItem(SESSION_KEY, userId);
      }
    } catch {
      return;
    }
  }

  private clearSessionUserId(): void {
    try {
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.removeItem(SESSION_KEY);
      }
    } catch {
      return;
    }
  }

  private handleResult(ok: boolean, message: string, warnings: string[] | undefined): void {
    const hasWarnings = !!warnings && warnings.length > 0;
    this.showNotice(message, ok ? (hasWarnings ? 'warning' : 'success') : 'danger', warnings);
  }

  private showNotice(message: string, tone: NoticeTone, warnings: string[] = []): void {
    this.notice = warnings.length > 0 ? `${message} ${warnings.join(' ')}` : message;
    this.noticeTone = tone;
  }

  private ok<T>(message: string, data: T, warnings: string[] = []): ActionResult<T> {
    return { ok: true, message, data, warnings };
  }

  private fail<T = never>(message: string): ActionResult<T> {
    return { ok: false, message };
  }
}

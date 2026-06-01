import { Component, OnInit } from '@angular/core';
import {
  ACCOUNT_TYPES,
  ActionResult,
  Account,
  AccountType,
  BudgetSummary,
  DebtEntry,
  DebtStatus,
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

interface PreparedImportRecord {
  line: number;
  record: ImportRecord;
  type: TransactionType;
}

type BackupRecordType = 'account' | 'transaction' | 'budget' | 'recurring' | 'debt';

interface BackupRecord {
  recordType: string;
  name: string;
  accountType: string;
  balance: string;
  transactionType: string;
  date: string;
  account: string;
  fromAccount: string;
  toAccount: string;
  category: string;
  amount: string;
  fee: string;
  note: string;
  month: string;
  limit: string;
  recurringDay: string;
  startsOn: string;
  endsOn: string;
  active: string;
  debtKind: string;
  person: string;
  paidAmount: string;
  dueDate: string;
  status: string;
}

interface RecurringRunResult {
  createdCount: number;
  warnings: string[];
}

type TransactionDraft = Omit<Transaction, 'id' | 'createdAt'>;

interface BalanceUpdatePlan {
  nextBalances: Map<string, number>;
  previousBalances: Map<string, number>;
}

const SESSION_KEY = 'finmate_session_user_id';
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TRANSACTION_CSV_HEADERS = ['type', 'date', 'account', 'fromAccount', 'toAccount', 'category', 'amount', 'fee', 'note'] as const;
const BACKUP_CSV_HEADERS = [
  'recordType',
  'name',
  'accountType',
  'balance',
  'transactionType',
  'date',
  'account',
  'fromAccount',
  'toAccount',
  'category',
  'amount',
  'fee',
  'note',
  'month',
  'limit',
  'recurringDay',
  'startsOn',
  'endsOn',
  'active',
  'debtKind',
  'person',
  'paidAmount',
  'dueDate',
  'status',
] as const;

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
  paymentAccountForms: Record<string, string> = {};
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
  editingAccountId: string | null = null;

  transactionForm = {
    type: 'expense' as 'income' | 'expense',
    accountId: '',
    category: 'Makanan',
    amount: null as number | null,
    date: this.today,
    note: '',
  };
  editingTransactionId: string | null = null;

  transferForm = {
    fromAccountId: '',
    toAccountId: '',
    amount: null as number | null,
    fee: 0 as number | null,
    date: this.today,
    note: '',
  };
  editingTransferId: string | null = null;

  budgetForm = {
    category: 'Makanan',
    month: this.currentMonth,
    limit: null as number | null,
  };
  editingBudgetId: string | null = null;

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
  editingRecurringId: string | null = null;

  debtForm = {
    kind: 'debt' as 'debt' | 'receivable',
    person: '',
    amount: null as number | null,
    dueDate: this.today,
    note: '',
  };
  editingDebtId: string | null = null;

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
    const recurringRun = await this.generateRecurringToday(false);
    const recurringMessage = recurringRun.createdCount > 0 ? ` ${recurringRun.createdCount} transaksi recurring otomatis dicatat.` : '';
    this.showNotice(
      `Selamat datang, ${result.data.name}.${recurringMessage}`,
      recurringRun.warnings.length > 0 ? 'warning' : 'success',
      recurringRun.warnings
    );
  }

  logout(): void {
    this.clearSessionUserId();
    this.currentUser = null;
    this.data = createEmptyFinmateData();
    this.report = null;
    this.budgetSummaries = [];
    this.showNotice('Logout berhasil.', 'medium');
  }

  async saveAccount(): Promise<void> {
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
      this.showNotice(this.editingAccountId ? 'Balance tidak boleh negatif.' : 'Initial balance tidak boleh negatif.', 'danger');
      return;
    }

    if (this.data.accounts.some((account) => account.id !== this.editingAccountId && account.name.toLowerCase() === name.toLowerCase())) {
      this.showNotice('Account name sudah digunakan.', 'danger');
      return;
    }

    const accountId = this.editingAccountId;
    const wasEditing = !!accountId;
    const result = accountId
      ? await this.supabaseService.updateAccount(accountId, name, this.accountForm.type, balance)
      : await this.supabaseService.addAccount(user.id, name, this.accountForm.type, balance);
    if (result.error) {
      this.showNotice(result.error.message, 'danger');
      return;
    }

    this.resetAccountForm();
    await this.loadAllData();
    this.showNotice(wasEditing ? 'Akun berhasil diperbarui.' : 'Akun berhasil ditambahkan.', 'success');
  }

  startEditAccount(account: Account): void {
    this.editingAccountId = account.id;
    this.accountForm = {
      name: account.name,
      type: account.type,
      initialBalance: account.balance,
    };
    this.showNotice(`Mode edit akun ${account.name}.`, 'medium');
  }

  cancelEditAccount(): void {
    this.resetAccountForm();
    this.showNotice('Edit akun dibatalkan.', 'medium');
  }

  async deleteAccount(account: Account): Promise<void> {
    if (this.isAccountInUse(account.id)) {
      this.showNotice('Akun masih digunakan oleh transaksi atau recurring transaction, jadi belum bisa dihapus.', 'danger');
      return;
    }

    if (!window.confirm(`Hapus akun ${account.name}?`)) {
      return;
    }

    const result = await this.supabaseService.deleteAccount(account.id);
    if (result.error) {
      this.showNotice(result.error.message, 'danger');
      return;
    }

    if (this.editingAccountId === account.id) {
      this.resetAccountForm();
    }

    await this.loadAllData();
    this.showNotice('Akun berhasil dihapus.', 'success');
  }

  async addTransaction(): Promise<void> {
    const original = this.editingTransactionId ? this.data.transactions.find((transaction) => transaction.id === this.editingTransactionId) : null;
    if (this.editingTransactionId && (!original || original.type === 'transfer')) {
      this.resetTransactionForm();
      this.showNotice('Transaksi yang diedit tidak ditemukan.', 'danger');
      return;
    }

    const input = {
      type: this.transactionForm.type,
      accountId: this.transactionForm.accountId,
      category: this.transactionForm.category,
      amount: this.transactionForm.amount,
      date: this.transactionForm.date,
      note: this.transactionForm.note,
    };
    const result = original ? await this.updateIncomeExpenseTransaction(original, input) : await this.createIncomeExpenseTransaction(input);

    this.handleResult(result.ok, result.message, result.warnings);
    if (result.ok) {
      if (original) {
        this.resetTransactionForm();
      } else {
        this.transactionForm.amount = null;
        this.transactionForm.note = '';
      }
      await this.loadAllData();
    }
  }

  async transfer(): Promise<void> {
    const original = this.editingTransferId ? this.data.transactions.find((transaction) => transaction.id === this.editingTransferId) : null;
    if (this.editingTransferId && original?.type !== 'transfer') {
      this.resetTransferForm();
      this.showNotice('Transfer yang diedit tidak ditemukan.', 'danger');
      return;
    }

    const input = {
      fromAccountId: this.transferForm.fromAccountId,
      toAccountId: this.transferForm.toAccountId,
      amount: this.transferForm.amount,
      fee: this.transferForm.fee,
      date: this.transferForm.date,
      note: this.transferForm.note,
    };
    const result = original ? await this.updateTransferTransaction(original, input) : await this.createTransferTransaction(input);

    this.handleResult(result.ok, result.message, result.warnings);
    if (result.ok) {
      if (original) {
        this.resetTransferForm();
      } else {
        this.transferForm.amount = null;
        this.transferForm.fee = 0;
        this.transferForm.note = '';
      }
      await this.loadAllData();
    }
  }

  startEditTransaction(transaction: Transaction): void {
    if (transaction.type === 'transfer') {
      this.editingTransactionId = null;
      this.editingTransferId = transaction.id;
      this.transferForm = {
        fromAccountId: transaction.fromAccountId ?? '',
        toAccountId: transaction.toAccountId ?? '',
        amount: transaction.amount,
        fee: transaction.fee ?? 0,
        date: transaction.date,
        note: transaction.note,
      };
      this.showNotice(`Mode edit transfer ${this.transactionTitle(transaction)}.`, 'medium');
      return;
    }

    this.editingTransferId = null;
    this.editingTransactionId = transaction.id;
    this.transactionForm = {
      type: transaction.type,
      accountId: transaction.accountId ?? '',
      category: transaction.category,
      amount: transaction.amount,
      date: transaction.date,
      note: transaction.note,
    };
    this.showNotice(`Mode edit transaksi ${transaction.category}.`, 'medium');
  }

  cancelTransactionEdit(): void {
    this.resetTransactionForm();
    this.showNotice('Edit transaksi dibatalkan.', 'medium');
  }

  cancelTransferEdit(): void {
    this.resetTransferForm();
    this.showNotice('Edit transfer dibatalkan.', 'medium');
  }

  async deleteTransaction(transaction: Transaction): Promise<void> {
    if (!window.confirm(`Hapus ${this.transactionTitle(transaction)}?`)) {
      return;
    }

    const plan = this.buildTransactionBalancePlan(transaction, null);
    if (!plan.ok || !plan.data) {
      this.showNotice(plan.message, 'danger');
      return;
    }

    const balanceResult = await this.persistAccountBalancePlan(plan.data);
    if (!balanceResult.ok) {
      this.showNotice(balanceResult.message, 'danger');
      return;
    }

    const deleted = await this.supabaseService.deleteTransaction(transaction.id);
    if (deleted.error) {
      await this.restoreAccountBalances(plan.data.previousBalances);
      this.showNotice(deleted.error.message, 'danger');
      return;
    }

    if (this.editingTransactionId === transaction.id) {
      this.resetTransactionForm();
    }

    if (this.editingTransferId === transaction.id) {
      this.resetTransferForm();
    }

    await this.loadAllData();
    this.showNotice('Transaksi berhasil dihapus.', 'success');
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

    if (
      this.data.budgets.some(
        (budget) => budget.id !== this.editingBudgetId && budget.category === category && budget.month === this.budgetForm.month
      )
    ) {
      this.showNotice('Budget untuk kategori dan bulan tersebut sudah ada.', 'danger');
      return;
    }

    const budgetId = this.editingBudgetId;
    const wasEditing = !!budgetId;
    const result = budgetId
      ? await this.supabaseService.updateBudget(budgetId, { ...this.budgetForm, category }, limit)
      : await this.supabaseService.upsertBudget(user.id, { ...this.budgetForm, category }, limit);
    if (result.error) {
      this.showNotice(result.error.message, 'danger');
      return;
    }

    this.resetBudgetForm(this.budgetForm.month);
    await this.loadAllData();
    this.showNotice(wasEditing ? 'Budget berhasil diperbarui.' : 'Budget berhasil disimpan.', 'success');
  }

  refreshBudgetPeriod(): void {
    this.refreshDerivedState();
  }

  startEditBudget(summary: BudgetSummary): void {
    this.editingBudgetId = summary.id;
    this.budgetForm = {
      category: summary.category,
      month: summary.month,
      limit: summary.limit,
    };
    this.showNotice(`Mode edit budget ${summary.category}.`, 'medium');
  }

  cancelBudgetEdit(): void {
    this.resetBudgetForm();
    this.refreshDerivedState();
    this.showNotice('Edit budget dibatalkan.', 'medium');
  }

  async deleteBudget(summary: BudgetSummary): Promise<void> {
    if (!window.confirm(`Hapus budget ${summary.category} untuk ${summary.month}?`)) {
      return;
    }

    const result = await this.supabaseService.deleteBudget(summary.id);
    if (result.error) {
      this.showNotice(result.error.message, 'danger');
      return;
    }

    if (this.editingBudgetId === summary.id) {
      this.resetBudgetForm();
    }

    await this.loadAllData();
    this.showNotice('Budget berhasil dihapus.', 'success');
  }

  async saveRecurring(): Promise<void> {
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

    const recurringId = this.editingRecurringId;
    const wasEditing = !!recurringId;
    const result = recurringId
      ? await this.supabaseService.updateRecurringRule(recurringId, { ...this.recurringForm, name }, amount, dayOfMonth)
      : await this.supabaseService.addRecurringRule(user.id, { ...this.recurringForm, name }, amount, dayOfMonth);
    if (result.error) {
      this.showNotice(result.error.message, 'danger');
      return;
    }

    this.resetRecurringForm();
    await this.loadAllData();

    if (wasEditing) {
      this.showNotice('Recurring transaction berhasil diperbarui.', 'success');
      return;
    }

    const recurringRun = await this.generateRecurringToday(false);
    const recurringMessage =
      recurringRun.createdCount > 0 ? ` ${recurringRun.createdCount} transaksi jatuh tempo otomatis dicatat.` : '';
    this.showNotice(
      `Recurring transaction berhasil dibuat.${recurringMessage}`,
      recurringRun.warnings.length > 0 ? 'warning' : 'success',
      recurringRun.warnings
    );
  }

  startEditRecurring(rule: RecurringRule): void {
    this.editingRecurringId = rule.id;
    this.recurringForm = {
      name: rule.name,
      type: rule.type,
      accountId: rule.accountId,
      category: rule.category,
      amount: rule.amount,
      dayOfMonth: rule.dayOfMonth,
      startsOn: rule.startsOn,
      endsOn: rule.endsOn ?? '',
      active: rule.active,
    };
    this.showNotice(`Mode edit recurring ${rule.name}.`, 'medium');
  }

  cancelRecurringEdit(): void {
    this.resetRecurringForm();
    this.showNotice('Edit recurring dibatalkan.', 'medium');
  }

  async deleteRecurring(rule: RecurringRule): Promise<void> {
    if (!window.confirm(`Hapus recurring ${rule.name}? Histori transaksi yang sudah tercatat tetap disimpan.`)) {
      return;
    }

    const result = await this.supabaseService.deleteRecurringRule(rule.id);
    if (result.error) {
      this.showNotice(result.error.message, 'danger');
      return;
    }

    if (this.editingRecurringId === rule.id) {
      this.resetRecurringForm();
    }

    await this.loadAllData();
    this.showNotice('Recurring transaction berhasil dihapus.', 'success');
  }

  async toggleRecurring(id: string, active: boolean): Promise<void> {
    const result = await this.supabaseService.updateRecurringActive(id, active);
    if (result.error) {
      this.showNotice(result.error.message, 'danger');
      return;
    }

    await this.loadAllData();

    if (!active) {
      this.showNotice('Recurring dinonaktifkan. Auto debet tidak akan dijalankan.', 'success');
      return;
    }

    const recurringRun = await this.generateRecurringToday(false);
    const recurringMessage =
      recurringRun.createdCount > 0 ? ` ${recurringRun.createdCount} transaksi jatuh tempo otomatis dicatat.` : '';
    this.showNotice(
      `Recurring diaktifkan.${recurringMessage}`,
      recurringRun.warnings.length > 0 ? 'warning' : 'success',
      recurringRun.warnings
    );
  }

  async generateRecurringToday(showMessage = true): Promise<RecurringRunResult> {
    const user = this.requireUser(false);
    if (!user) {
      return { createdCount: 0, warnings: [] };
    }

    const runDate = todayIso();
    this.today = runDate;
    const created: Transaction[] = [];
    const warnings: string[] = [];
    const dueItems: Array<{ dueDate: string; rule: RecurringRule; ruleIndex: number }> = [];
    this.data.recurringRules.forEach((rule, ruleIndex) => {
      for (const dueDate of this.getRecurringDueDates(rule, runDate)) {
        dueItems.push({ dueDate, rule, ruleIndex });
      }
    });
    dueItems.sort(
      (first, second) =>
        first.dueDate.localeCompare(second.dueDate) ||
        this.recurringTypeWeight(first.rule) - this.recurringTypeWeight(second.rule) ||
        first.ruleIndex - second.ruleIndex
    );

    for (const { dueDate, rule } of dueItems) {
      const duplicate = this.data.transactions.some((transaction) => this.matchesRecurringTransaction(transaction, rule, dueDate));
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
        date: dueDate,
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
      this.showNotice(`${created.length} transaksi recurring jatuh tempo dibuat.`, warnings.length > 0 ? 'warning' : 'success', warnings);
    }

    return { createdCount: created.length, warnings };
  }

  async saveDebt(): Promise<void> {
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

    const currentDebt = this.editingDebtId ? this.data.debts.find((item) => item.id === this.editingDebtId) : null;
    if (this.editingDebtId && !currentDebt) {
      this.resetDebtForm();
      this.showNotice('Data hutang/piutang tidak ditemukan.', 'danger');
      return;
    }

    if (currentDebt && amount < currentDebt.paidAmount) {
      this.showNotice('Nominal tidak boleh lebih kecil dari nominal yang sudah dibayar/diterima.', 'danger');
      return;
    }

    const status = this.resolveDebtStatus(amount, currentDebt?.paidAmount ?? 0, this.debtForm.dueDate);
    const debtId = this.editingDebtId;
    const wasEditing = !!debtId;
    const savedKind = this.debtForm.kind;
    const result = debtId
      ? await this.supabaseService.updateDebt(debtId, { ...this.debtForm, person }, amount, status)
      : await this.supabaseService.addDebt(user.id, { ...this.debtForm, person }, amount, status);
    if (result.error) {
      this.showNotice(result.error.message, 'danger');
      return;
    }

    this.resetDebtForm();
    await this.loadAllData();
    this.showNotice(wasEditing ? 'Data hutang/piutang berhasil diperbarui.' : savedKind === 'debt' ? 'Hutang berhasil dicatat.' : 'Piutang berhasil dicatat.', 'success');
  }

  startEditDebt(entry: DebtEntry): void {
    this.editingDebtId = entry.id;
    this.debtForm = {
      kind: entry.kind,
      person: entry.person,
      amount: entry.amount,
      dueDate: entry.dueDate,
      note: entry.note,
    };
    this.showNotice(`Mode edit ${entry.kind === 'debt' ? 'hutang' : 'piutang'} ${entry.person}.`, 'medium');
  }

  cancelDebtEdit(): void {
    this.resetDebtForm();
    this.showNotice('Edit hutang/piutang dibatalkan.', 'medium');
  }

  async deleteDebt(entry: DebtEntry): Promise<void> {
    if (!window.confirm(`Hapus data ${entry.kind === 'debt' ? 'hutang' : 'piutang'} ${entry.person}?`)) {
      return;
    }

    const result = await this.supabaseService.deleteDebt(entry.id);
    if (result.error) {
      this.showNotice(result.error.message, 'danger');
      return;
    }

    if (this.editingDebtId === entry.id) {
      this.resetDebtForm();
    }

    delete this.paymentForms[entry.id];
    delete this.paymentAccountForms[entry.id];
    await this.loadAllData();
    this.showNotice('Data hutang/piutang berhasil dihapus.', 'success');
  }

  async payDebt(id: string): Promise<void> {
    const payment = this.readAmount(this.paymentForms[id]);
    const accountId = this.paymentAccountForms[id];
    const entry = this.data.debts.find((item) => item.id === id);
    const account = this.data.accounts.find((item) => item.id === accountId);

    if (!entry) {
      this.showNotice('Data hutang/piutang tidak ditemukan.', 'danger');
      return;
    }

    if (!account) {
      this.showNotice('Akun pembayaran wajib dipilih.', 'danger');
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

    if (entry.kind === 'debt' && account.balance < payment) {
      this.showNotice('Saldo akun tidak mencukupi untuk membayar hutang.', 'danger');
      return;
    }

    const previousBalance = account.balance;
    const nextBalance = this.toMoney(entry.kind === 'debt' ? account.balance - payment : account.balance + payment);
    const balanceResult = await this.supabaseService.updateAccountBalance(account.id, nextBalance);
    if (balanceResult.error) {
      this.showNotice(balanceResult.error.message, 'danger');
      return;
    }

    account.balance = nextBalance;
    const paidAmount = this.toMoney(entry.paidAmount + payment);
    const status = this.resolveDebtStatus(entry.amount, paidAmount, entry.dueDate);
    const result = await this.supabaseService.updateDebtPayment(id, paidAmount, status);

    if (result.error) {
      await this.supabaseService.updateAccountBalance(account.id, previousBalance);
      account.balance = previousBalance;
      this.showNotice(result.error.message, 'danger');
      return;
    }

    this.paymentForms[id] = null;
    await this.loadAllData();
    this.showNotice(
      status === 'paid'
        ? 'Status berubah menjadi lunas dan saldo akun diperbarui.'
        : entry.kind === 'debt'
          ? 'Pembayaran sebagian berhasil dicatat dan saldo akun diperbarui.'
          : 'Penerimaan sebagian berhasil dicatat dan saldo akun diperbarui.',
      'success'
    );
  }

  addDebt(): Promise<void> {
    return this.saveDebt();
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

    const csv = this.buildFinmateBackupCsv();
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `finmate-backup-${this.today}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
    this.showNotice('Backup CSV berhasil dibuat.', 'success');
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
      const text = String(reader.result ?? '');
      const result = this.isFinmateBackupCsv(text)
        ? await this.importFinmateBackupCsvText(text)
        : await this.importTransactionsCsvText(text);
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

  private resetAccountForm(): void {
    this.editingAccountId = null;
    this.accountForm = {
      name: '',
      type: 'Cash',
      initialBalance: 0,
    };
  }

  private resetTransactionForm(): void {
    this.editingTransactionId = null;
    this.transactionForm = {
      type: 'expense',
      accountId: this.data.accounts[0]?.id ?? '',
      category: 'Makanan',
      amount: null,
      date: this.today,
      note: '',
    };
  }

  private resetTransferForm(): void {
    this.editingTransferId = null;
    const fromAccountId = this.data.accounts[0]?.id ?? '';
    this.transferForm = {
      fromAccountId,
      toAccountId: this.data.accounts.find((account) => account.id !== fromAccountId)?.id ?? '',
      amount: null,
      fee: 0,
      date: this.today,
      note: '',
    };
  }

  private resetBudgetForm(month = this.budgetForm.month): void {
    this.editingBudgetId = null;
    this.budgetForm = {
      category: 'Makanan',
      month,
      limit: null,
    };
  }

  private resetRecurringForm(): void {
    this.editingRecurringId = null;
    this.recurringForm = {
      name: '',
      type: 'expense',
      accountId: this.data.accounts[0]?.id ?? '',
      category: 'Tagihan',
      amount: null,
      dayOfMonth: 1,
      startsOn: this.today,
      endsOn: '',
      active: true,
    };
  }

  private resetDebtForm(): void {
    this.editingDebtId = null;
    this.debtForm = {
      kind: 'debt',
      person: '',
      amount: null,
      dueDate: this.today,
      note: '',
    };
  }

  private isAccountInUse(accountId: string): boolean {
    return (
      this.data.transactions.some(
        (transaction) =>
          transaction.accountId === accountId || transaction.fromAccountId === accountId || transaction.toAccountId === accountId
      ) || this.data.recurringRules.some((rule) => rule.accountId === accountId)
    );
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

    const firstAccount = this.data.accounts[0];
    const accountExists = (accountId: string): boolean => this.data.accounts.some((account) => account.id === accountId);

    if (!accountExists(this.transactionForm.accountId)) {
      this.transactionForm.accountId = firstAccount?.id ?? '';
    }

    if (!accountExists(this.transferForm.fromAccountId)) {
      this.transferForm.fromAccountId = firstAccount?.id ?? '';
    }

    if (!accountExists(this.transferForm.toAccountId) || this.transferForm.toAccountId === this.transferForm.fromAccountId) {
      this.transferForm.toAccountId = this.data.accounts.find((account) => account.id !== this.transferForm.fromAccountId)?.id ?? '';
    }

    if (!accountExists(this.recurringForm.accountId)) {
      this.recurringForm.accountId = firstAccount?.id ?? '';
    }

    if (this.reportFilter.accountId !== 'all' && !accountExists(this.reportFilter.accountId)) {
      this.reportFilter.accountId = 'all';
    }

    for (const debt of this.data.debts) {
      if (!accountExists(this.paymentAccountForms[debt.id])) {
        this.paymentAccountForms[debt.id] = firstAccount?.id ?? '';
      }
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

  private async updateIncomeExpenseTransaction(
    original: Transaction,
    input: {
      type: Exclude<TransactionType, 'transfer'>;
      accountId: string;
      category: string;
      amount: unknown;
      date: string;
      note?: string;
    }
  ): Promise<ActionResult<Transaction>> {
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

    const replacement: TransactionDraft = {
      type: input.type,
      accountId: account.id,
      category,
      amount,
      date: input.date,
      note: input.note ?? '',
      recurringId: original.recurringId,
    };
    const plan = this.buildTransactionBalancePlan(original, replacement);
    if (!plan.ok || !plan.data) {
      return this.fail(plan.message);
    }

    const balanceResult = await this.persistAccountBalancePlan(plan.data);
    if (!balanceResult.ok) {
      return this.fail(balanceResult.message);
    }

    const updated = await this.supabaseService.updateTransaction(original.id, replacement);
    if (updated.error || !updated.data) {
      await this.restoreAccountBalances(plan.data.previousBalances);
      return this.fail(updated.error?.message ?? 'Gagal memperbarui transaksi.');
    }

    const warnings = input.type === 'expense' ? this.getBudgetWarnings(category, input.date) : [];
    return this.ok('Transaksi berhasil diperbarui.', updated.data, warnings);
  }

  private async updateTransferTransaction(
    original: Transaction,
    input: {
      fromAccountId: string;
      toAccountId: string;
      amount: unknown;
      fee: unknown;
      date: string;
      note?: string;
    }
  ): Promise<ActionResult<Transaction>> {
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

    const replacement: TransactionDraft = {
      type: 'transfer',
      fromAccountId: fromAccount.id,
      toAccountId: toAccount.id,
      category: 'Transfer',
      amount,
      fee,
      date: input.date,
      note: input.note ?? '',
      recurringId: original.recurringId,
    };
    const plan = this.buildTransactionBalancePlan(original, replacement);
    if (!plan.ok || !plan.data) {
      return this.fail(plan.message);
    }

    const balanceResult = await this.persistAccountBalancePlan(plan.data);
    if (!balanceResult.ok) {
      return this.fail(balanceResult.message);
    }

    const updated = await this.supabaseService.updateTransaction(original.id, replacement);
    if (updated.error || !updated.data) {
      await this.restoreAccountBalances(plan.data.previousBalances);
      return this.fail(updated.error?.message ?? 'Gagal memperbarui transfer.');
    }

    return this.ok('Transfer berhasil diperbarui.', updated.data);
  }

  private buildTransactionBalancePlan(original: Transaction | null, replacement: TransactionDraft | null): ActionResult<BalanceUpdatePlan> {
    const currentBalances = new Map(this.data.accounts.map((account) => [account.id, account.balance]));
    const nextBalances = new Map(currentBalances);
    const affectedAccountIds = new Set<string>();

    const applyEffect = (transaction: Transaction | TransactionDraft, multiplier: number): string | null => {
      const applyDelta = (accountId: string | undefined, delta: number): string | null => {
        if (!accountId || !nextBalances.has(accountId)) {
          return 'Akun pada transaksi tidak ditemukan.';
        }

        affectedAccountIds.add(accountId);
        nextBalances.set(accountId, this.toMoney((nextBalances.get(accountId) ?? 0) + delta));
        return null;
      };

      if (transaction.type === 'income') {
        return applyDelta(transaction.accountId, transaction.amount * multiplier);
      }

      if (transaction.type === 'expense') {
        return applyDelta(transaction.accountId, -transaction.amount * multiplier);
      }

      const debit = this.toMoney(transaction.amount + (transaction.fee ?? 0));
      return applyDelta(transaction.fromAccountId, -debit * multiplier) ?? applyDelta(transaction.toAccountId, transaction.amount * multiplier);
    };

    if (original) {
      const error = applyEffect(original, -1);
      if (error) {
        return this.fail(error);
      }
    }

    if (replacement) {
      const error = applyEffect(replacement, 1);
      if (error) {
        return this.fail(error);
      }
    }

    for (const accountId of affectedAccountIds) {
      if ((nextBalances.get(accountId) ?? 0) < 0) {
        return this.fail('Saldo akun tidak mencukupi untuk perubahan transaksi ini.');
      }
    }

    const changedBalances = new Map<string, number>();
    const previousBalances = new Map<string, number>();
    for (const accountId of affectedAccountIds) {
      const previousBalance = currentBalances.get(accountId) ?? 0;
      const nextBalance = nextBalances.get(accountId) ?? 0;
      if (previousBalance !== nextBalance) {
        previousBalances.set(accountId, previousBalance);
        changedBalances.set(accountId, nextBalance);
      }
    }

    return this.ok('Perubahan saldo valid.', { nextBalances: changedBalances, previousBalances });
  }

  private async persistAccountBalancePlan(plan: BalanceUpdatePlan): Promise<ActionResult<void>> {
    const updatedAccountIds: string[] = [];

    for (const [accountId, balance] of plan.nextBalances) {
      const result = await this.supabaseService.updateAccountBalance(accountId, balance);
      if (result.error) {
        await this.restoreAccountBalances(new Map(updatedAccountIds.map((id) => [id, plan.previousBalances.get(id) ?? 0])));
        return this.fail(result.error.message);
      }

      updatedAccountIds.push(accountId);
      this.applyLocalAccountBalances(new Map([[accountId, balance]]));
    }

    return this.ok('Saldo akun berhasil diperbarui.', undefined);
  }

  private async restoreAccountBalances(balances: Map<string, number>): Promise<void> {
    await Promise.all([...balances.entries()].map(([accountId, balance]) => this.supabaseService.updateAccountBalance(accountId, balance)));
    this.applyLocalAccountBalances(balances);
  }

  private applyLocalAccountBalances(balances: Map<string, number>): void {
    for (const account of this.data.accounts) {
      const balance = balances.get(account.id);
      if (balance !== undefined) {
        account.balance = balance;
      }
    }
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

  private buildFinmateBackupCsv(): string {
    const rows: string[][] = [[...BACKUP_CSV_HEADERS]];

    for (const account of this.data.accounts) {
      rows.push(this.backupRow({ recordType: 'account', name: account.name, accountType: account.type, balance: String(account.balance) }));
    }

    for (const transaction of this.data.transactions.slice().reverse()) {
      rows.push(
        this.backupRow({
          recordType: 'transaction',
          transactionType: transaction.type,
          date: transaction.date,
          account: transaction.accountId ? this.accountName(transaction.accountId) : '',
          fromAccount: transaction.fromAccountId ? this.accountName(transaction.fromAccountId) : '',
          toAccount: transaction.toAccountId ? this.accountName(transaction.toAccountId) : '',
          category: transaction.category,
          amount: String(transaction.amount),
          fee: String(transaction.fee ?? 0),
          note: transaction.note,
        })
      );
    }

    for (const budget of this.data.budgets) {
      rows.push(this.backupRow({ recordType: 'budget', category: budget.category, month: budget.month, limit: String(budget.limit) }));
    }

    for (const rule of this.data.recurringRules) {
      rows.push(
        this.backupRow({
          recordType: 'recurring',
          name: rule.name,
          transactionType: rule.type,
          account: this.accountName(rule.accountId),
          category: rule.category,
          amount: String(rule.amount),
          recurringDay: String(rule.dayOfMonth),
          startsOn: rule.startsOn,
          endsOn: rule.endsOn ?? '',
          active: String(rule.active),
        })
      );
    }

    for (const debt of this.data.debts) {
      rows.push(
        this.backupRow({
          recordType: 'debt',
          debtKind: debt.kind,
          person: debt.person,
          amount: String(debt.amount),
          paidAmount: String(debt.paidAmount),
          dueDate: debt.dueDate,
          note: debt.note,
          status: debt.status,
        })
      );
    }

    return rows.map((row) => row.map((cell) => this.escapeCsv(cell)).join(',')).join('\n');
  }

  private backupRow(record: Partial<BackupRecord>): string[] {
    const normalized = this.emptyBackupRecord(record);
    return BACKUP_CSV_HEADERS.map((header) => normalized[header]);
  }

  private emptyBackupRecord(record: Partial<BackupRecord> = {}): BackupRecord {
    return {
      recordType: record.recordType ?? '',
      name: record.name ?? '',
      accountType: record.accountType ?? '',
      balance: record.balance ?? '',
      transactionType: record.transactionType ?? '',
      date: record.date ?? '',
      account: record.account ?? '',
      fromAccount: record.fromAccount ?? '',
      toAccount: record.toAccount ?? '',
      category: record.category ?? '',
      amount: record.amount ?? '',
      fee: record.fee ?? '',
      note: record.note ?? '',
      month: record.month ?? '',
      limit: record.limit ?? '',
      recurringDay: record.recurringDay ?? '',
      startsOn: record.startsOn ?? '',
      endsOn: record.endsOn ?? '',
      active: record.active ?? '',
      debtKind: record.debtKind ?? '',
      person: record.person ?? '',
      paidAmount: record.paidAmount ?? '',
      dueDate: record.dueDate ?? '',
      status: record.status ?? '',
    };
  }

  private isFinmateBackupCsv(text: string): boolean {
    const rows = this.parseCsv(text);
    const headers = rows[0]?.map((header) => header.trim()) ?? [];
    return headers.join('|') === BACKUP_CSV_HEADERS.join('|');
  }

  private async importFinmateBackupCsvText(text: string): Promise<ActionResult<ImportResult>> {
    const user = this.requireUser(false);
    if (!user) {
      return this.fail('Silakan login terlebih dahulu.');
    }

    if (!text.trim()) {
      return this.fail('File CSV kosong.');
    }

    const rows = this.parseCsv(text);
    if (rows.length < 2) {
      return this.fail('CSV tidak memiliki data backup.');
    }

    const headers = rows[0].map((header) => header.trim());
    if (headers.join('|') !== BACKUP_CSV_HEADERS.join('|')) {
      return this.fail('Kolom CSV backup tidak sesuai format FinMate.');
    }

    const records = rows.slice(1).map((row, index) => ({
      line: index + 2,
      record: this.rowToBackupRecord(headers, row),
    }));
    let imported = 0;
    let skipped = 0;
    const errors: string[] = [];
    const warnings: string[] = [];

    const accountRows = records.filter(({ record }) => record.recordType.trim().toLowerCase() === 'account');
    for (const { line, record } of accountRows) {
      const name = record.name.trim();
      const balance = this.readAmount(record.balance);
      const type = this.normalizeAccountType(record.accountType);

      if (!name) {
        errors.push(`Baris ${line}: nama akun wajib diisi.`);
        continue;
      }

      if (balance === null || balance < 0) {
        errors.push(`Baris ${line}: balance akun tidak valid.`);
        continue;
      }

      const existing = this.findAccountByName(name);
      const result = existing
        ? await this.supabaseService.updateAccount(existing.id, name, type, balance)
        : await this.supabaseService.addAccount(user.id, name, type, balance);

      if (result.error || !result.data) {
        errors.push(`Baris ${line}: ${result.error?.message ?? 'Gagal menyimpan akun.'}`);
        continue;
      }

      imported += 1;
      const currentIndex = this.data.accounts.findIndex((account) => account.id === result.data?.id);
      if (currentIndex >= 0) {
        this.data.accounts[currentIndex] = result.data;
      } else {
        this.data.accounts.push(result.data);
      }
    }

    await this.loadAllData();
    const accountIdsByName = new Map(this.data.accounts.map((account) => [this.csvAccountKey(account.name), account.id]));
    const fingerprints = new Set(this.data.transactions.map((transaction) => this.transactionFingerprint(transaction)));

    for (const { line, record } of records) {
      const recordType = record.recordType.trim().toLowerCase() as BackupRecordType;
      if (recordType === 'account') {
        continue;
      }

      if (!['transaction', 'budget', 'recurring', 'debt'].includes(recordType)) {
        errors.push(`Baris ${line}: recordType tidak valid.`);
        continue;
      }

      if (recordType === 'transaction') {
        const result = await this.importBackupTransactionRow(user.id, record, line, accountIdsByName, fingerprints);
        if (result.ok && result.data) {
          imported += 1;
          fingerprints.add(this.transactionFingerprint(result.data));
        } else if (result.message === 'SKIPPED') {
          skipped += 1;
        } else {
          errors.push(`Baris ${line}: ${result.message}`);
        }
        continue;
      }

      if (recordType === 'budget') {
        const result = await this.importBackupBudgetRow(user.id, record, line);
        if (result.ok) {
          imported += 1;
        } else {
          errors.push(`Baris ${line}: ${result.message}`);
        }
        continue;
      }

      if (recordType === 'recurring') {
        const result = await this.importBackupRecurringRow(user.id, record, accountIdsByName);
        if (result.ok) {
          imported += 1;
        } else if (result.message === 'SKIPPED') {
          skipped += 1;
        } else {
          errors.push(`Baris ${line}: ${result.message}`);
        }
        continue;
      }

      const result = await this.importBackupDebtRow(user.id, record);
      if (result.ok) {
        imported += 1;
      } else {
        errors.push(`Baris ${line}: ${result.message}`);
      }
    }

    await this.loadAllData();
    this.runReport(false);
    warnings.push('Laporan dihitung ulang otomatis dari data backup yang berhasil diimpor.');
    const message = errors.length > 0 ? 'Import backup selesai dengan beberapa error.' : 'Import backup CSV berhasil.';
    return this.ok(message, { imported, skipped, errors }, [...warnings, ...errors]);
  }

  private async importBackupTransactionRow(
    userId: string,
    record: BackupRecord,
    line: number,
    accountIdsByName: Map<string, string>,
    fingerprints: Set<string>
  ): Promise<ActionResult<Transaction>> {
    const type = record.transactionType.trim().toLowerCase();
    const date = this.normalizeCsvDate(record.date);
    const amount = this.readAmount(record.amount);
    const fee = this.readAmount(record.fee) ?? 0;

    if (!['income', 'expense', 'transfer'].includes(type)) {
      return this.fail('transactionType tidak valid.');
    }

    if (!date) {
      return this.fail('tanggal transaksi tidak valid.');
    }

    if (amount === null || amount <= 0 || fee < 0) {
      return this.fail('nominal transaksi tidak valid.');
    }

    const normalizedRecord = { ...record, type, date, amount: String(amount), fee: String(fee) };
    if (fingerprints.has(this.csvFingerprint(normalizedRecord))) {
      return this.fail('SKIPPED');
    }

    const transaction =
      type === 'transfer'
        ? {
            type: 'transfer' as const,
            fromAccountId: accountIdsByName.get(this.csvAccountKey(record.fromAccount)),
            toAccountId: accountIdsByName.get(this.csvAccountKey(record.toAccount)),
            category: record.category.trim() || 'Transfer',
            amount,
            fee,
            date,
            note: record.note,
          }
        : {
            type: type as Exclude<TransactionType, 'transfer'>,
            accountId: accountIdsByName.get(this.csvAccountKey(record.account)),
            category: record.category.trim(),
            amount,
            fee: 0,
            date,
            note: record.note,
          };

    if (type === 'transfer' && (!transaction.fromAccountId || !transaction.toAccountId)) {
      return this.fail('akun transfer tidak ditemukan.');
    }

    if (type !== 'transfer' && !transaction.accountId) {
      return this.fail('akun transaksi tidak ditemukan.');
    }

    if (!transaction.category) {
      return this.fail('kategori transaksi wajib diisi.');
    }

    const result = await this.supabaseService.addTransaction(userId, transaction);
    if (result.error || !result.data) {
      return this.fail(result.error?.message ?? 'Gagal menyimpan transaksi.');
    }

    return this.ok('Transaksi backup berhasil diimpor.', result.data);
  }

  private async importBackupBudgetRow(userId: string, record: BackupRecord, line: number): Promise<ActionResult<void>> {
    const category = record.category.trim();
    const limit = this.readAmount(record.limit);

    if (!category) {
      return this.fail('kategori budget wajib diisi.');
    }

    if (!/^\d{4}-\d{2}$/.test(record.month)) {
      return this.fail('bulan budget tidak valid.');
    }

    if (limit === null || limit <= 0) {
      return this.fail('limit budget tidak valid.');
    }

    const result = await this.supabaseService.upsertBudget(userId, { category, month: record.month, limit }, limit);
    if (result.error) {
      return this.fail(result.error.message || `Gagal import budget di baris ${line}.`);
    }

    return this.ok('Budget backup berhasil diimpor.', undefined);
  }

  private async importBackupRecurringRow(
    userId: string,
    record: BackupRecord,
    accountIdsByName: Map<string, string>
  ): Promise<ActionResult<void>> {
    const name = record.name.trim();
    const type = record.transactionType.trim().toLowerCase();
    const accountId = accountIdsByName.get(this.csvAccountKey(record.account));
    const amount = this.readAmount(record.amount);
    const dayOfMonth = Number(record.recurringDay);
    const startsOn = this.normalizeCsvDate(record.startsOn);
    const parsedEndsOn = record.endsOn.trim() ? this.normalizeCsvDate(record.endsOn) : null;
    const endsOn = parsedEndsOn ?? undefined;

    if (!name) {
      return this.fail('nama recurring wajib diisi.');
    }

    if (type !== 'income' && type !== 'expense') {
      return this.fail('jenis recurring tidak valid.');
    }

    if (!accountId) {
      return this.fail('akun recurring tidak ditemukan.');
    }

    if (!record.category.trim()) {
      return this.fail('kategori recurring wajib diisi.');
    }

    if (amount === null || amount <= 0) {
      return this.fail('nominal recurring tidak valid.');
    }

    if (!Number.isInteger(dayOfMonth) || dayOfMonth < 1 || dayOfMonth > 31) {
      return this.fail('tanggal recurring tidak valid.');
    }

    if (!startsOn || (record.endsOn.trim() && !parsedEndsOn)) {
      return this.fail('tanggal mulai/selesai recurring tidak valid.');
    }

    const duplicate = this.data.recurringRules.some(
      (rule) =>
        rule.name.toLowerCase() === name.toLowerCase() &&
        rule.type === type &&
        rule.accountId === accountId &&
        rule.category === record.category.trim() &&
        rule.amount === amount &&
        rule.dayOfMonth === dayOfMonth &&
        rule.startsOn === startsOn &&
        (rule.endsOn ?? '') === (endsOn ?? '')
    );
    if (duplicate) {
      return this.fail('SKIPPED');
    }

    const result = await this.supabaseService.addRecurringRule(
      userId,
      {
        name,
        type: type as Exclude<TransactionType, 'transfer'>,
        accountId,
        category: record.category.trim(),
        amount,
        dayOfMonth,
        startsOn,
        endsOn,
        active: this.parseCsvBoolean(record.active),
      },
      amount,
      dayOfMonth
    );

    if (result.error) {
      return this.fail(result.error.message);
    }

    return this.ok('Recurring backup berhasil diimpor.', undefined);
  }

  private async importBackupDebtRow(userId: string, record: BackupRecord): Promise<ActionResult<void>> {
    const kind = record.debtKind.trim().toLowerCase();
    const person = record.person.trim();
    const amount = this.readAmount(record.amount);
    const paidAmount = this.readAmount(record.paidAmount) ?? 0;
    const dueDate = this.normalizeCsvDate(record.dueDate);
    const status = this.normalizeDebtStatus(record.status);

    if (kind !== 'debt' && kind !== 'receivable') {
      return this.fail('jenis hutang/piutang tidak valid.');
    }

    if (!person) {
      return this.fail('nama hutang/piutang wajib diisi.');
    }

    if (amount === null || amount <= 0 || paidAmount < 0 || paidAmount > amount) {
      return this.fail('nominal hutang/piutang tidak valid.');
    }

    if (!dueDate) {
      return this.fail('jatuh tempo hutang/piutang tidak valid.');
    }

    const result = await this.supabaseService.addDebt(
      userId,
      { kind: kind as 'debt' | 'receivable', person, amount, dueDate, note: record.note },
      amount,
      status
    );
    if (result.error || !result.data) {
      return this.fail(result.error?.message ?? 'Gagal import hutang/piutang.');
    }

    if (paidAmount > 0) {
      const payment = await this.supabaseService.updateDebtPayment(result.data.id, paidAmount, status);
      if (payment.error) {
        return this.fail(payment.error.message);
      }
    }

    return this.ok('Hutang/piutang backup berhasil diimpor.', undefined);
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
    const preparedRecords: PreparedImportRecord[] = [];

    for (const [index, row] of rows.slice(1).entries()) {
      const line = index + 2;
      const record = this.rowToRecord(headers, row);
      const type = record.type.trim().toLowerCase();

      if (!['income', 'expense', 'transfer'].includes(type)) {
        errors.push(`Baris ${line}: type tidak valid.`);
        continue;
      }

      const normalizedDate = this.normalizeCsvDate(record.date);
      if (!normalizedDate) {
        errors.push(`Baris ${line}: tanggal tidak valid.`);
        continue;
      }

      record.date = normalizedDate;

      if (type === 'transfer') {
        if (!record.fromAccount.trim()) {
          errors.push(`Baris ${line}: fromAccount wajib diisi untuk transfer.`);
          continue;
        }

        if (!record.toAccount.trim()) {
          errors.push(`Baris ${line}: toAccount wajib diisi untuk transfer.`);
          continue;
        }
      } else if (!record.account.trim()) {
        errors.push(`Baris ${line}: account wajib diisi.`);
        continue;
      }

      preparedRecords.push({ line, record, type: type as TransactionType });
    }

    const ensuredAccounts = await this.ensureCsvImportAccounts(preparedRecords);
    if (!ensuredAccounts.ok) {
      errors.push(ensuredAccounts.message);
    }

    for (const { line, record, type } of preparedRecords) {
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
    const warnings = [...(ensuredAccounts.warnings ?? []), ...errors];
    return this.ok(message, { imported, skipped, errors }, warnings);
  }

  private async ensureCsvImportAccounts(records: PreparedImportRecord[]): Promise<ActionResult<string[]>> {
    const user = this.requireUser(false);
    if (!user) {
      return this.fail('Silakan login terlebih dahulu.');
    }

    const accountNames = this.collectCsvAccountNames(records);
    if (accountNames.length === 0) {
      return this.ok('Tidak ada akun baru dari CSV.', []);
    }

    const openingBalances = this.calculateCsvOpeningBalances(records);
    const createdAccounts: string[] = [];

    for (const accountName of accountNames) {
      if (this.findAccountByName(accountName)) {
        continue;
      }

      const initialBalance = openingBalances.get(this.csvAccountKey(accountName)) ?? 0;
      const result = await this.supabaseService.addAccount(
        user.id,
        accountName,
        this.inferCsvAccountType(accountName),
        initialBalance
      );

      if (result.error || !result.data) {
        return this.fail(`Gagal membuat akun ${accountName}: ${result.error?.message ?? 'Unknown error'}`);
      }

      this.data.accounts.push(result.data);
      createdAccounts.push(initialBalance > 0 ? `${accountName} (${this.formatCurrency(initialBalance)})` : accountName);
    }

    const warnings =
      createdAccounts.length > 0
        ? [`Akun dibuat otomatis dari CSV: ${createdAccounts.join(', ')}. Saldo dalam tanda kurung adalah saldo pembuka agar histori transaksi bisa diimpor.`]
        : [];
    return this.ok('Akun CSV siap dipakai.', createdAccounts, warnings);
  }

  private collectCsvAccountNames(records: PreparedImportRecord[]): string[] {
    const names = new Map<string, string>();
    const remember = (name: string): void => {
      const normalized = name.trim();
      if (normalized) {
        names.set(this.csvAccountKey(normalized), normalized);
      }
    };

    for (const { record, type } of records) {
      if (type === 'transfer') {
        remember(record.fromAccount);
        remember(record.toAccount);
      } else {
        remember(record.account);
      }
    }

    return [...names.values()];
  }

  private calculateCsvOpeningBalances(records: PreparedImportRecord[]): Map<string, number> {
    const openingBalances = new Map<string, number>();
    const runningBalances = new Map<string, number>();

    const applyDelta = (name: string, delta: number): void => {
      const key = this.csvAccountKey(name);
      if (!runningBalances.has(key)) {
        runningBalances.set(key, this.findAccountByName(name)?.balance ?? 0);
        openingBalances.set(key, 0);
      }

      const nextBalance = this.toMoney((runningBalances.get(key) ?? 0) + delta);
      if (nextBalance >= 0) {
        runningBalances.set(key, nextBalance);
        return;
      }

      openingBalances.set(key, this.toMoney((openingBalances.get(key) ?? 0) - nextBalance));
      runningBalances.set(key, 0);
    };

    for (const { record, type } of records) {
      const amount = this.readAmount(record.amount);
      const fee = this.readAmount(record.fee) ?? 0;
      if (amount === null || amount <= 0 || fee < 0) {
        continue;
      }

      if (type === 'income') {
        applyDelta(record.account, amount);
      } else if (type === 'expense') {
        applyDelta(record.account, -amount);
      } else {
        applyDelta(record.fromAccount, -this.toMoney(amount + fee));
        applyDelta(record.toAccount, amount);
      }
    }

    return openingBalances;
  }

  private inferCsvAccountType(name: string): AccountType {
    const normalized = name.trim().toLowerCase();
    if (['cash', 'tunai'].includes(normalized)) {
      return 'Cash';
    }

    if (['dana', 'ovo', 'gopay', 'shopeepay', 'linkaja'].includes(normalized)) {
      return 'E-Wallet';
    }

    return 'Bank';
  }

  private normalizeAccountType(value: string): AccountType {
    return this.accountTypes.includes(value as AccountType) ? (value as AccountType) : this.inferCsvAccountType(value);
  }

  private normalizeDebtStatus(value: string): DebtStatus {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'paid' || normalized === 'partial' || normalized === 'overdue' || normalized === 'unpaid') {
      return normalized;
    }

    return 'unpaid';
  }

  private parseCsvBoolean(value: string): boolean {
    return ['true', '1', 'yes', 'ya', 'aktif'].includes(value.trim().toLowerCase());
  }

  private csvAccountKey(name: string): string {
    return name.trim().toLowerCase();
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

  private getRecurringDueDates(rule: RecurringRule, untilDate: string): string[] {
    if (!rule.active || untilDate < rule.startsOn) {
      return [];
    }

    const endDate = rule.endsOn && rule.endsOn < untilDate ? rule.endsOn : untilDate;
    const [startYear, startMonth] = rule.startsOn.split('-').map(Number);
    const [endYear, endMonth] = endDate.split('-').map(Number);
    const dueDates: string[] = [];
    let year = startYear;
    let month = startMonth;

    while (year < endYear || (year === endYear && month <= endMonth)) {
      const dueDate = this.monthlyRecurringDate(year, month, rule.dayOfMonth);
      if (dueDate >= rule.startsOn && dueDate <= endDate) {
        dueDates.push(dueDate);
      }

      month += 1;
      if (month > 12) {
        month = 1;
        year += 1;
      }
    }

    return dueDates;
  }

  private monthlyRecurringDate(year: number, month: number, dayOfMonth: number): string {
    const lastDayOfMonth = new Date(year, month, 0).getDate();
    const dueDay = Math.min(dayOfMonth, lastDayOfMonth);
    return `${year}-${this.padDatePart(month)}-${this.padDatePart(dueDay)}`;
  }

  private padDatePart(value: number): string {
    return String(value).padStart(2, '0');
  }

  private recurringTypeWeight(rule: RecurringRule): number {
    return rule.type === 'income' ? 0 : 1;
  }

  private matchesRecurringTransaction(transaction: Transaction, rule: RecurringRule, date: string): boolean {
    if (transaction.recurringId) {
      return transaction.recurringId === rule.id && transaction.date === date;
    }

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

  private rowToBackupRecord(headers: string[], row: string[]): BackupRecord {
    const record = headers.reduce<Record<string, string>>((current, header, index) => {
      current[header] = row[index] ?? '';
      return current;
    }, {});

    return this.emptyBackupRecord({
      recordType: record['recordType'],
      name: record['name'],
      accountType: record['accountType'],
      balance: record['balance'],
      transactionType: record['transactionType'],
      date: record['date'],
      account: record['account'],
      fromAccount: record['fromAccount'],
      toAccount: record['toAccount'],
      category: record['category'],
      amount: record['amount'],
      fee: record['fee'],
      note: record['note'],
      month: record['month'],
      limit: record['limit'],
      recurringDay: record['recurringDay'],
      startsOn: record['startsOn'],
      endsOn: record['endsOn'],
      active: record['active'],
      debtKind: record['debtKind'],
      person: record['person'],
      paidAmount: record['paidAmount'],
      dueDate: record['dueDate'],
      status: record['status'],
    });
  }

  private normalizeCsvDate(value: string): string | null {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }

    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      return trimmed;
    }

    const slashDate = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (slashDate) {
      const [, month, day, year] = slashDate;
      return `${year}-${this.padDatePart(Number(month))}-${this.padDatePart(Number(day))}`;
    }

    const parsed = new Date(trimmed);
    if (Number.isNaN(parsed.getTime())) {
      return null;
    }

    return parsed.toISOString().slice(0, 10);
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

  async payRecurring(rule: RecurringRule): Promise<void> {
    const user = this.requireUser(false);
    if (!user) {
      return;
    }

    const account = this.data.accounts.find((item) => item.id === rule.accountId);
    if (!account) {
      this.showNotice(`Akun untuk ${rule.name} tidak ditemukan.`, 'danger');
      return;
    }

    if (rule.type === 'expense' && account.balance < rule.amount) {
      this.showNotice(`Saldo ${account.name} tidak mencukupi untuk ${rule.name}.`, 'danger');
      return;
    }

    const result = await this.createIncomeExpenseTransaction({
      type: rule.type,
      accountId: rule.accountId,
      category: rule.category,
      amount: rule.amount,
      date: this.today,
      note: `Manual (Pay Now): ${rule.name}`,
      recurringId: rule.id,
    });

    if (result.ok) {
      await this.loadAllData();
      this.showNotice(`Pembayaran ${rule.name} berhasil dicatat.`, 'success', result.warnings);
    } else {
      this.handleResult(result.ok, result.message, result.warnings);
    }
  }
}



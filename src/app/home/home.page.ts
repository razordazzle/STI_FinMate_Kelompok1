import { Component, OnInit } from '@angular/core';
import {
  ACCOUNT_TYPES,
  Account,
  AccountType,
  BudgetSummary,
  DebtEntry,
  EXPENSE_CATEGORIES,
  FinmateData,
  FinmateStoreService,
  INCOME_CATEGORIES,
  ImportResult,
  RecurringRule,
  ReportFilter,
  ReportResult,
  Transaction,
  User,
  createEmptyFinmateData,
  todayIso,
} from '../services/finmate-store.service';

type AuthMode = 'login' | 'register';
type SectionKey = 'dashboard' | 'accounts' | 'transactions' | 'budget' | 'recurring' | 'debts' | 'reports' | 'csv';
type NoticeTone = 'success' | 'warning' | 'danger' | 'medium';

interface SectionItem {
  key: SectionKey;
  label: string;
  icon: string;
}

@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
  standalone: false,
})
export class HomePage implements OnInit {
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
    email: 'demo@finmate.test',
    password: 'password123',
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

  constructor(private readonly store: FinmateStoreService) {}

  get transactionCategories(): readonly string[] {
    return this.transactionForm.type === 'income' ? this.incomeCategories : this.expenseCategories;
  }

  get recurringCategories(): readonly string[] {
    return this.recurringForm.type === 'income' ? this.incomeCategories : this.expenseCategories;
  }

  ngOnInit(): void {
    const recurring = this.store.generateDueTransactions(this.today);
    this.refresh();
    this.runReport(false);

    if (recurring.ok && recurring.data && recurring.data.created.length > 0) {
      this.showNotice(recurring.message, recurring.warnings && recurring.warnings.length > 0 ? 'warning' : 'success', recurring.warnings);
    }
  }

  submitLogin(): void {
    const result = this.store.login(this.loginForm.email, this.loginForm.password);
    this.handleResult(result.ok, result.message, result.warnings);
    if (result.ok) {
      this.refresh();
      this.runReport(false);
    }
  }

  submitRegister(): void {
    const result = this.store.register(this.registerForm.name, this.registerForm.email, this.registerForm.password);
    this.handleResult(result.ok, result.message, result.warnings);
    if (result.ok) {
      this.registerForm = { name: '', email: '', password: '' };
      this.refresh();
      this.runReport(false);
    }
  }

  loginDemo(): void {
    const result = this.store.loginDemo();
    this.handleResult(result.ok, result.message, result.warnings);
    if (result.ok) {
      this.refresh();
      this.runReport(false);
    }
  }

  logout(): void {
    this.store.logout();
    this.currentUser = null;
    this.data = createEmptyFinmateData();
    this.report = null;
    this.showNotice('Logout berhasil.', 'medium');
  }

  addAccount(): void {
    const result = this.store.addAccount(this.accountForm);
    this.handleResult(result.ok, result.message, result.warnings);
    if (result.ok) {
      this.accountForm = { name: '', type: 'Cash', initialBalance: 0 };
      this.refreshAfterMutation();
    }
  }

  addTransaction(): void {
    const result = this.store.addTransaction(this.transactionForm);
    this.handleResult(result.ok, result.message, result.warnings);
    if (result.ok) {
      this.transactionForm.amount = null;
      this.transactionForm.note = '';
      this.refreshAfterMutation();
    }
  }

  transfer(): void {
    const result = this.store.transfer(this.transferForm);
    this.handleResult(result.ok, result.message, result.warnings);
    if (result.ok) {
      this.transferForm.amount = null;
      this.transferForm.fee = 0;
      this.transferForm.note = '';
      this.refreshAfterMutation();
    }
  }

  saveBudget(): void {
    const result = this.store.setBudget(this.budgetForm);
    this.handleResult(result.ok, result.message, result.warnings);
    if (result.ok) {
      this.budgetForm.limit = null;
      this.refreshAfterMutation();
    }
  }

  refreshBudgetPeriod(): void {
    this.refresh();
  }

  addRecurring(): void {
    const result = this.store.addRecurring(this.recurringForm);
    this.handleResult(result.ok, result.message, result.warnings);
    if (result.ok) {
      this.recurringForm = {
        ...this.recurringForm,
        name: '',
        amount: null,
        dayOfMonth: 1,
        endsOn: '',
      };
      this.refreshAfterMutation();
    }
  }

  toggleRecurring(id: string, active: boolean): void {
    const result = this.store.toggleRecurring(id, active);
    this.handleResult(result.ok, result.message, result.warnings);
    if (result.ok) {
      this.refreshAfterMutation();
    }
  }

  generateRecurringToday(): void {
    const result = this.store.generateDueTransactions(this.today);
    this.handleResult(result.ok, result.message, result.warnings);
    if (result.ok) {
      this.refreshAfterMutation();
    }
  }

  addDebt(): void {
    const result = this.store.addDebt(this.debtForm);
    this.handleResult(result.ok, result.message, result.warnings);
    if (result.ok) {
      this.debtForm = {
        ...this.debtForm,
        person: '',
        amount: null,
        note: '',
      };
      this.refreshAfterMutation();
    }
  }

  payDebt(id: string): void {
    const result = this.store.recordDebtPayment(id, this.paymentForms[id]);
    this.handleResult(result.ok, result.message, result.warnings);
    if (result.ok) {
      this.paymentForms[id] = null;
      this.refreshAfterMutation();
    }
  }

  runReport(showMessage = true): void {
    const result = this.store.buildReport(this.reportFilter);
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
    const result = this.store.exportTransactionsCsv();
    if (!result.ok || !result.data) {
      this.showNotice(result.message, 'danger', result.warnings);
      return;
    }

    const blob = new Blob([result.data], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `finmate-transactions-${this.today}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
    this.showNotice(result.message, 'success');
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
    reader.onload = () => {
      const result = this.store.importTransactionsCsv(String(reader.result ?? ''));
      this.lastImport = result.data ?? null;
      this.handleResult(result.ok, result.message, result.warnings);
      if (result.ok) {
        this.refreshAfterMutation();
      }
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
    return this.data.accounts.reduce((total, account) => total + account.balance, 0);
  }

  remainingDebt(entry: DebtEntry): number {
    return Math.max(entry.amount - entry.paidAmount, 0);
  }

  trackById(_index: number, item: Account | Transaction | BudgetSummary | RecurringRule | DebtEntry): string {
    return item.id;
  }

  private refreshAfterMutation(): void {
    this.refresh();
    this.runReport(false);
  }

  private refresh(): void {
    this.currentUser = this.store.getCurrentUser();
    this.data = this.store.getCurrentData();
    this.budgetSummaries = this.store.getBudgetSummaries(this.budgetForm.month);

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

  private handleResult(ok: boolean, message: string, warnings: string[] | undefined): void {
    const hasWarnings = !!warnings && warnings.length > 0;
    this.showNotice(message, ok ? (hasWarnings ? 'warning' : 'success') : 'danger', warnings);
  }

  private showNotice(message: string, tone: NoticeTone, warnings: string[] = []): void {
    this.notice = warnings.length > 0 ? `${message} ${warnings.join(' ')}` : message;
    this.noticeTone = tone;
  }
}

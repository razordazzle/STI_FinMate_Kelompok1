import { FinmateStoreService, todayIso } from './finmate-store.service';

describe('FinmateStoreService', () => {
  let service: FinmateStoreService;

  beforeEach(() => {
    service = new FinmateStoreService();
    service.resetForTesting();
    service.register('Fazle', 'fazle@example.com', 'secret1');
  });

  it('validates register and login inputs', () => {
    expect(service.register('', 'new@example.com', 'secret1').ok).toBeFalse();
    expect(service.register('New User', 'bad-email', 'secret1').ok).toBeFalse();
    expect(service.register('New User', 'fazle@example.com', 'secret1').ok).toBeFalse();
    expect(service.login('fazle@example.com', 'wrong-password').ok).toBeFalse();
    expect(service.login('fazle@example.com', 'secret1').ok).toBeTrue();
  });

  it('creates financial accounts with equivalence validation', () => {
    expect(service.addAccount({ name: '', type: 'Cash', initialBalance: 0 }).ok).toBeFalse();
    expect(service.addAccount({ name: 'Cash', type: 'Cash', initialBalance: -1 }).ok).toBeFalse();

    const account = service.addAccount({ name: 'Cash', type: 'Cash', initialBalance: 0 });

    expect(account.ok).toBeTrue();
    expect(service.addAccount({ name: 'Cash', type: 'Cash', initialBalance: 10000 }).ok).toBeFalse();
  });

  it('edits accounts and deletes only unused accounts', () => {
    const cash = service.addAccount({ name: 'Cash', type: 'Cash', initialBalance: 100000 }).data!;
    const bca = service.addAccount({ name: 'BCA', type: 'Bank', initialBalance: 200000 }).data!;
    const dana = service.addAccount({ name: 'DANA', type: 'E-Wallet', initialBalance: 0 }).data!;

    const updated = service.updateAccount(cash.id, { name: 'Dompet', type: 'Other', balance: 125000 });

    expect(updated.ok).toBeTrue();
    expect(updated.data?.name).toBe('Dompet');
    expect(updated.data?.type).toBe('Other');
    expect(updated.data?.balance).toBe(125000);
    expect(service.updateAccount(cash.id, { name: 'BCA', type: 'Cash', balance: 1000 }).ok).toBeFalse();
    expect(service.deleteAccount(dana.id).ok).toBeTrue();

    service.addTransaction({
      type: 'expense',
      accountId: bca.id,
      category: 'Makanan',
      amount: 25000,
      date: todayIso(),
    });

    expect(service.deleteAccount(bca.id).ok).toBeFalse();
  });

  it('updates account balance for income and expense transactions', () => {
    const account = service.addAccount({ name: 'Cash', type: 'Cash', initialBalance: 100000 }).data!;

    expect(
      service.addTransaction({
        type: 'income',
        accountId: account.id,
        category: 'Gaji',
        amount: 50000,
        date: todayIso(),
      }).ok
    ).toBeTrue();
    expect(service.getCurrentData().accounts[0].balance).toBe(150000);

    expect(
      service.addTransaction({
        type: 'expense',
        accountId: account.id,
        category: 'Makanan',
        amount: 25000,
        date: todayIso(),
      }).ok
    ).toBeTrue();
    expect(service.getCurrentData().accounts[0].balance).toBe(125000);

    expect(
      service.addTransaction({
        type: 'expense',
        accountId: account.id,
        category: 'Belanja',
        amount: 200000,
        date: todayIso(),
      }).ok
    ).toBeFalse();
  });

  it('transfers money between accounts and applies admin fee', () => {
    const bca = service.addAccount({ name: 'BCA', type: 'Bank', initialBalance: 200000 }).data!;
    const dana = service.addAccount({ name: 'DANA', type: 'E-Wallet', initialBalance: 0 }).data!;

    const result = service.transfer({
      fromAccountId: bca.id,
      toAccountId: dana.id,
      amount: 100000,
      fee: 2500,
      date: todayIso(),
    });

    const accounts = service.getCurrentData().accounts;

    expect(result.ok).toBeTrue();
    expect(accounts.find((account) => account.id === bca.id)?.balance).toBe(97500);
    expect(accounts.find((account) => account.id === dana.id)?.balance).toBe(100000);
    expect(service.transfer({ fromAccountId: bca.id, toAccountId: bca.id, amount: 1000, fee: 0, date: todayIso() }).ok).toBeFalse();
  });

  it('edits and deletes income, expense, and transfer transactions with balance updates', () => {
    const cash = service.addAccount({ name: 'Cash', type: 'Cash', initialBalance: 100000 }).data!;
    const bca = service.addAccount({ name: 'BCA', type: 'Bank', initialBalance: 200000 }).data!;
    const dana = service.addAccount({ name: 'DANA', type: 'E-Wallet', initialBalance: 0 }).data!;

    const expense = service.addTransaction({
      type: 'expense',
      accountId: cash.id,
      category: 'Makanan',
      amount: 25000,
      date: todayIso(),
    }).data!;

    expect(
      service.updateTransaction(expense.id, {
        type: 'expense',
        accountId: cash.id,
        category: 'Makanan',
        amount: 40000,
        date: todayIso(),
      }).ok
    ).toBeTrue();
    expect(service.getCurrentData().accounts.find((account) => account.id === cash.id)?.balance).toBe(60000);
    expect(service.deleteTransaction(expense.id).ok).toBeTrue();
    expect(service.getCurrentData().accounts.find((account) => account.id === cash.id)?.balance).toBe(100000);

    const transfer = service.transfer({
      fromAccountId: bca.id,
      toAccountId: dana.id,
      amount: 50000,
      fee: 2500,
      date: todayIso(),
    }).data!;

    expect(service.updateTransfer(transfer.id, { fromAccountId: bca.id, toAccountId: dana.id, amount: 75000, fee: 5000, date: todayIso() }).ok).toBeTrue();
    expect(service.getCurrentData().accounts.find((account) => account.id === bca.id)?.balance).toBe(120000);
    expect(service.getCurrentData().accounts.find((account) => account.id === dana.id)?.balance).toBe(75000);
    expect(service.deleteTransaction(transfer.id).ok).toBeTrue();
    expect(service.getCurrentData().accounts.find((account) => account.id === bca.id)?.balance).toBe(200000);
    expect(service.getCurrentData().accounts.find((account) => account.id === dana.id)?.balance).toBe(0);
  });

  it('marks budget boundary values as full and overbudget', () => {
    const account = service.addAccount({ name: 'Cash', type: 'Cash', initialBalance: 200000 }).data!;
    const month = todayIso().slice(0, 7);

    service.setBudget({ category: 'Makanan', month, limit: 100000 });
    service.addTransaction({ type: 'expense', accountId: account.id, category: 'Makanan', amount: 100000, date: todayIso() });

    expect(service.getBudgetSummaries(month)[0].status).toBe('full');

    service.addTransaction({ type: 'expense', accountId: account.id, category: 'Makanan', amount: 1, date: todayIso() });

    expect(service.getBudgetSummaries(month)[0].status).toBe('over');
  });

  it('edits and deletes budgets', () => {
    const month = todayIso().slice(0, 7);
    const nextMonth = '2026-06';
    const food = service.setBudget({ category: 'Makanan', month, limit: 100000 }).data!;
    const transport = service.setBudget({ category: 'Transportasi', month, limit: 50000 }).data!;

    const updated = service.updateBudget(food.id, { category: 'Hiburan', month: nextMonth, limit: 75000 });

    expect(updated.ok).toBeTrue();
    expect(updated.data?.category).toBe('Hiburan');
    expect(updated.data?.month).toBe(nextMonth);
    expect(updated.data?.limit).toBe(75000);
    expect(service.updateBudget(updated.data!.id, { category: 'Transportasi', month, limit: 100000 }).ok).toBeFalse();
    expect(service.deleteBudget(transport.id).ok).toBeTrue();
    expect(service.getCurrentData().budgets.some((budget) => budget.id === transport.id)).toBeFalse();
  });

  it('generates recurring transactions once per due date', () => {
    const account = service.addAccount({ name: 'BCA', type: 'Bank', initialBalance: 100000 }).data!;
    const today = todayIso();
    const day = Number(today.slice(8, 10));

    service.addRecurring({
      name: 'Subscription',
      type: 'expense',
      accountId: account.id,
      category: 'Hiburan',
      amount: 50000,
      dayOfMonth: day,
      startsOn: today,
      active: true,
    });

    expect(service.generateDueTransactions(today).data?.created.length).toBe(1);
    expect(service.generateDueTransactions(today).data?.created.length).toBe(0);
  });

  it('moves debt state from partial to paid', () => {
    const account = service.addAccount({ name: 'Cash', type: 'Cash', initialBalance: 150000 }).data!;
    const debt = service.addDebt({
      kind: 'debt',
      person: 'Cicilan Laptop',
      amount: 100000,
      dueDate: todayIso(),
    }).data!;

    expect(service.recordDebtPayment(debt.id, 50000, account.id).data?.status).toBe('partial');
    expect(service.getCurrentData().accounts.find((item) => item.id === account.id)?.balance).toBe(100000);
    expect(service.recordDebtPayment(debt.id, 50000, account.id).data?.status).toBe('paid');
    expect(service.getCurrentData().accounts.find((item) => item.id === account.id)?.balance).toBe(50000);
  });

  it('edits and deletes debts and adds receivable payments to accounts', () => {
    const account = service.addAccount({ name: 'BCA', type: 'Bank', initialBalance: 100000 }).data!;
    const receivable = service.addDebt({
      kind: 'receivable',
      person: 'Rafi',
      amount: 150000,
      dueDate: todayIso(),
    }).data!;

    expect(service.updateDebt(receivable.id, { kind: 'receivable', person: 'Rafi Update', amount: 200000, dueDate: todayIso() }).ok).toBeTrue();
    expect(service.recordDebtPayment(receivable.id, 50000, account.id).data?.status).toBe('partial');
    expect(service.getCurrentData().accounts.find((item) => item.id === account.id)?.balance).toBe(150000);
    expect(service.updateDebt(receivable.id, { kind: 'receivable', person: 'Rafi Update', amount: 25000, dueDate: todayIso() }).ok).toBeFalse();
    expect(service.deleteDebt(receivable.id).ok).toBeTrue();
    expect(service.getCurrentData().debts.some((item) => item.id === receivable.id)).toBeFalse();
  });

  it('builds financial reports and rejects invalid date ranges', () => {
    const account = service.addAccount({ name: 'Cash', type: 'Cash', initialBalance: 100000 }).data!;
    const today = todayIso();

    service.addTransaction({ type: 'income', accountId: account.id, category: 'Gaji', amount: 100000, date: today });
    service.addTransaction({ type: 'expense', accountId: account.id, category: 'Makanan', amount: 25000, date: today });

    const report = service.buildReport({ startDate: today, endDate: today, accountId: 'all', category: 'all' });

    expect(report.ok).toBeTrue();
    expect(report.data?.totalIncome).toBe(100000);
    expect(report.data?.totalExpense).toBe(25000);
    expect(service.buildReport({ startDate: '2026-12-31', endDate: '2026-01-01', accountId: 'all', category: 'all' }).ok).toBeFalse();
  });

  it('imports and exports transaction CSV data', () => {
    service.addAccount({ name: 'Cash', type: 'Cash', initialBalance: 100000 });

    const csv = `type,date,account,fromAccount,toAccount,category,amount,fee,note\nincome,${todayIso()},Cash,,,Gaji,50000,0,CSV import`;
    const imported = service.importTransactionsCsv(csv);
    const exported = service.exportTransactionsCsv();

    expect(imported.ok).toBeTrue();
    expect(imported.data?.imported).toBe(1);
    expect(exported.data).toContain('CSV import');
    expect(service.importTransactionsCsv('wrong,header\nvalue').ok).toBeFalse();
  });
});

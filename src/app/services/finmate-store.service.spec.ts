import { FinmateStoreService, todayIso } from './finmate-store.service';

describe('FinmateStoreService', () => {
  let service: FinmateStoreService;

  beforeEach(() => {
    localStorage.clear();
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

  it('marks budget boundary values as full and overbudget', () => {
    const account = service.addAccount({ name: 'Cash', type: 'Cash', initialBalance: 200000 }).data!;
    const month = todayIso().slice(0, 7);

    service.setBudget({ category: 'Makanan', month, limit: 100000 });
    service.addTransaction({ type: 'expense', accountId: account.id, category: 'Makanan', amount: 100000, date: todayIso() });

    expect(service.getBudgetSummaries(month)[0].status).toBe('full');

    service.addTransaction({ type: 'expense', accountId: account.id, category: 'Makanan', amount: 1, date: todayIso() });

    expect(service.getBudgetSummaries(month)[0].status).toBe('over');
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
    const debt = service.addDebt({
      kind: 'debt',
      person: 'Cicilan Laptop',
      amount: 100000,
      dueDate: todayIso(),
    }).data!;

    expect(service.recordDebtPayment(debt.id, 50000).data?.status).toBe('partial');
    expect(service.recordDebtPayment(debt.id, 50000).data?.status).toBe('paid');
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

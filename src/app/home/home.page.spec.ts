import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';

import { HomePage } from './home.page';
import { SupabaseService } from '../services/supabase.service';

describe('HomePage', () => {
  let component: HomePage;
  let fixture: ComponentFixture<HomePage>;
  let supabaseService: jasmine.SpyObj<SupabaseService>;

  beforeEach(async () => {
    sessionStorage.clear();
    supabaseService = jasmine.createSpyObj<SupabaseService>('SupabaseService', [
      'getProfileById',
      'getAllData',
      'addAccount',
      'updateAccount',
      'addTransaction',
      'upsertBudget',
      'addRecurringRule',
      'addDebt',
      'updateDebtPayment',
    ]);
    supabaseService.getProfileById.and.resolveTo({ data: null, error: null });
    supabaseService.getAllData.and.resolveTo({ data: null, error: null });

    await TestBed.configureTestingModule({
      declarations: [HomePage],
      imports: [CommonModule, FormsModule, IonicModule.forRoot()],
      providers: [
        {
          provide: SupabaseService,
          useValue: supabaseService,
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(HomePage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('backs up all data and restores account balances without replaying transaction totals', async () => {
    const account = { id: 'account-a', name: 'BCA', type: 'Bank' as const, balance: 408286, createdAt: '2026-06-01' };
    const transaction = {
      id: 'transaction-a',
      type: 'expense' as const,
      accountId: account.id,
      category: 'Makanan',
      amount: 14000,
      fee: 0,
      date: '2026-05-13',
      note: 'POKPOK',
      createdAt: '2026-06-01',
    };
    const budget = { id: 'budget-a', category: 'Makanan', month: '2026-05', limit: 188500 };
    const recurring = {
      id: 'recurring-a',
      name: 'Spotify',
      type: 'expense' as const,
      accountId: account.id,
      category: 'Hiburan',
      amount: 39900,
      dayOfMonth: 15,
      startsOn: '2026-05-01',
      active: true,
    };
    const debt = {
      id: 'debt-a',
      kind: 'debt' as const,
      person: 'Marita',
      amount: 18000,
      paidAmount: 9000,
      dueDate: '2026-05-31',
      note: 'Pinjam makan',
      status: 'partial' as const,
      createdAt: '2026-06-01',
    };

    component.currentUser = { id: 'user-b', name: 'User B', email: 'b@example.test', password: 'secret', failedLoginAttempts: 0 };
    component.data = {
      accounts: [account],
      transactions: [transaction],
      budgets: [budget],
      recurringRules: [recurring],
      debts: [debt],
    };

    const csv = (component as any).buildFinmateBackupCsv() as string;
    expect(csv).toContain('account,BCA,Bank,408286');
    expect(csv).toContain('transaction,,,,expense,2026-05-13,BCA,,,Makanan,14000,0,POKPOK');
    expect(csv).toContain('recurring,Spotify,,,expense,,BCA,,,Hiburan,39900,,,');
    expect(csv).toContain('debt,,,,,,,,,,18000,,Pinjam makan');

    const importedAccount = { ...account, id: 'account-b' };
    const emptyImportedData = { accounts: [importedAccount], transactions: [], budgets: [], recurringRules: [], debts: [] };
    supabaseService.getAllData.and.resolveTo({ data: emptyImportedData, error: null });
    supabaseService.addAccount.and.resolveTo({ data: importedAccount, error: null });
    supabaseService.addTransaction.and.resolveTo({ data: { ...transaction, id: 'transaction-b', accountId: importedAccount.id }, error: null });
    supabaseService.upsertBudget.and.resolveTo({ data: { ...budget, id: 'budget-b' }, error: null });
    supabaseService.addRecurringRule.and.resolveTo({ data: { ...recurring, id: 'recurring-b', accountId: importedAccount.id }, error: null });
    supabaseService.addDebt.and.resolveTo({ data: { ...debt, id: 'debt-b', paidAmount: 0, status: 'partial' }, error: null });
    supabaseService.updateDebtPayment.and.resolveTo({ data: { ...debt, id: 'debt-b' }, error: null });

    component.data = { accounts: [], transactions: [], budgets: [], recurringRules: [], debts: [] };
    const imported = await (component as any).importFinmateBackupCsvText(csv);

    expect(imported.ok).toBeTrue();
    expect(imported.data.imported).toBe(5);
    expect(supabaseService.addAccount).toHaveBeenCalledWith('user-b', 'BCA', 'Bank', 408286);
    expect(supabaseService.addTransaction).toHaveBeenCalledWith(
      'user-b',
      jasmine.objectContaining({ type: 'expense', accountId: 'account-b', amount: 14000 })
    );
    expect(supabaseService.upsertBudget).toHaveBeenCalled();
    expect(supabaseService.addRecurringRule).toHaveBeenCalled();
    expect(supabaseService.updateDebtPayment).toHaveBeenCalledWith('debt-b', 9000, 'partial');
  });
});

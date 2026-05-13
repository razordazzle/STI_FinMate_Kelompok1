import { Injectable } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { environment } from './../../environments/environment';
import {
  Account,
  AccountType,
  Budget,
  CreateBudgetInput,
  CreateDebtInput,
  CreateRecurringInput,
  DebtEntry,
  DebtStatus,
  FinmateData,
  RecurringRule,
  Transaction,
  TransactionType,
  User,
  createEmptyFinmateData,
} from './finmate-store.service';

interface ServiceError {
  message: string;
}

interface ServiceResponse<T> {
  data: T | null;
  error: ServiceError | null;
}

interface ProfileRow {
  id: string;
  name: string;
  email: string;
  password: string;
  created_at?: string;
}

interface AccountRow {
  id: string;
  user_id: string;
  name: string;
  type: string;
  balance: number | string;
  created_at: string;
}

interface TransactionRow {
  id: string;
  user_id: string;
  type: TransactionType;
  account_id: string | null;
  to_account_id: string | null;
  category: string;
  amount: number | string;
  fee: number | string | null;
  date: string;
  note: string | null;
  recurring_id?: string | null;
  created_at: string;
}

interface BudgetRow {
  id: string;
  user_id: string;
  category: string;
  month: string;
  limit_amount: number | string;
  created_at?: string;
}

interface RecurringRow {
  id: string;
  user_id: string;
  name: string;
  type: Exclude<TransactionType, 'transfer'>;
  account_id: string;
  category: string;
  amount: number | string;
  day_of_month: number;
  starts_on: string;
  ends_on: string | null;
  active: boolean;
  created_at: string;
}

interface DebtRow {
  id: string;
  user_id: string;
  kind: 'debt' | 'receivable';
  person: string;
  amount: number | string;
  paid_amount: number | string;
  due_date: string;
  note: string | null;
  status: DebtStatus;
  created_at: string;
}

@Injectable({
  providedIn: 'root',
})
export class SupabaseService {
  private readonly supabase: SupabaseClient;

  constructor() {
    this.supabase = createClient(environment.supabaseUrl, environment.supabaseKey, {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false,
      },
    });
  }

  async signUpManual(email: string, name: string, password: string): Promise<ServiceResponse<User>> {
    const normalizedEmail = email.trim().toLowerCase();
    const normalizedName = name.trim();

    const existing = await this.supabase.from('profiles').select('id').eq('email', normalizedEmail).maybeSingle();
    if (existing.error) {
      return this.failure(existing.error.message);
    }

    if (existing.data) {
      return this.failure('Email sudah terdaftar.');
    }

    const { data, error } = await this.supabase
      .from('profiles')
      .insert({
        id: crypto.randomUUID(),
        name: normalizedName,
        email: normalizedEmail,
        password,
      })
      .select('*')
      .single();

    if (error) {
      return this.failure(error.message);
    }

    return { data: this.mapProfile(data as ProfileRow), error: null };
  }

  async signInManual(email: string, password: string): Promise<ServiceResponse<User>> {
    const { data, error } = await this.supabase
      .from('profiles')
      .select('*')
      .eq('email', email.trim().toLowerCase())
      .eq('password', password)
      .maybeSingle();

    if (error) {
      return this.failure(error.message);
    }

    return { data: data ? this.mapProfile(data as ProfileRow) : null, error: null };
  }

  async getProfileById(userId: string): Promise<ServiceResponse<User>> {
    const { data, error } = await this.supabase.from('profiles').select('*').eq('id', userId).maybeSingle();

    if (error) {
      return this.failure(error.message);
    }

    return { data: data ? this.mapProfile(data as ProfileRow) : null, error: null };
  }

  async getAllData(userId: string): Promise<ServiceResponse<FinmateData>> {
    const [accounts, transactions, budgets, recurringRules, debts] = await Promise.all([
      this.getAccounts(userId),
      this.getTransactions(userId),
      this.getBudgets(userId),
      this.getRecurringRules(userId),
      this.getDebts(userId),
    ]);

    const error = accounts.error ?? transactions.error ?? budgets.error ?? recurringRules.error ?? debts.error;
    if (error) {
      return this.failure(error.message);
    }

    return {
      data: {
        accounts: accounts.data ?? [],
        transactions: transactions.data ?? [],
        budgets: budgets.data ?? [],
        recurringRules: recurringRules.data ?? [],
        debts: debts.data ?? [],
      },
      error: null,
    };
  }

  async getAccounts(userId: string): Promise<ServiceResponse<Account[]>> {
    const { data, error } = await this.supabase
      .from('accounts')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: true });

    if (error) {
      return this.failure(error.message);
    }

    return { data: (data as AccountRow[]).map((row) => this.mapAccount(row)), error: null };
  }

  async addAccount(userId: string, name: string, type: AccountType, balance: number): Promise<ServiceResponse<Account>> {
    const { data, error } = await this.supabase
      .from('accounts')
      .insert({
        user_id: userId,
        name,
        type,
        balance,
      })
      .select('*')
      .single();

    if (error) {
      return this.failure(error.message);
    }

    return { data: this.mapAccount(data as AccountRow), error: null };
  }

  async updateAccountBalance(accountId: string, balance: number): Promise<ServiceResponse<Account>> {
    const { data, error } = await this.supabase
      .from('accounts')
      .update({ balance })
      .eq('id', accountId)
      .select('*')
      .single();

    if (error) {
      return this.failure(error.message);
    }

    return { data: this.mapAccount(data as AccountRow), error: null };
  }

  async getTransactions(userId: string): Promise<ServiceResponse<Transaction[]>> {
    const { data, error } = await this.supabase
      .from('transactions')
      .select('*')
      .eq('user_id', userId)
      .order('date', { ascending: false })
      .order('created_at', { ascending: false });

    if (error) {
      return this.failure(error.message);
    }

    return { data: (data as TransactionRow[]).map((row) => this.mapTransaction(row)), error: null };
  }

  async addTransaction(userId: string, transaction: Omit<Transaction, 'id' | 'createdAt'>): Promise<ServiceResponse<Transaction>> {
    const { data, error } = await this.supabase
      .from('transactions')
      .insert({
        user_id: userId,
        type: transaction.type,
        account_id: transaction.accountId ?? transaction.fromAccountId ?? null,
        to_account_id: transaction.toAccountId ?? null,
        category: transaction.category,
        amount: transaction.amount,
        fee: transaction.fee ?? 0,
        date: transaction.date,
        note: transaction.note,
      })
      .select('*')
      .single();

    if (error) {
      return this.failure(error.message);
    }

    return { data: this.mapTransaction(data as TransactionRow), error: null };
  }

  async deleteTransaction(transactionId: string): Promise<ServiceResponse<null>> {
    const { error } = await this.supabase.from('transactions').delete().eq('id', transactionId);

    if (error) {
      return this.failure(error.message);
    }

    return { data: null, error: null };
  }

  async getBudgets(userId: string): Promise<ServiceResponse<Budget[]>> {
    const { data, error } = await this.supabase
      .from('budgets')
      .select('*')
      .eq('user_id', userId)
      .order('month', { ascending: false });

    if (error) {
      return this.failure(error.message);
    }

    return { data: (data as BudgetRow[]).map((row) => this.mapBudget(row)), error: null };
  }

  async upsertBudget(userId: string, input: CreateBudgetInput, limit: number): Promise<ServiceResponse<Budget>> {
    const existing = await this.supabase
      .from('budgets')
      .select('*')
      .eq('user_id', userId)
      .eq('category', input.category)
      .eq('month', input.month)
      .maybeSingle();

    if (existing.error) {
      return this.failure(existing.error.message);
    }

    const query = existing.data
      ? this.supabase.from('budgets').update({ limit_amount: limit }).eq('id', (existing.data as BudgetRow).id)
      : this.supabase.from('budgets').insert({
          user_id: userId,
          category: input.category,
          month: input.month,
          limit_amount: limit,
        });

    const { data, error } = await query.select('*').single();

    if (error) {
      return this.failure(error.message);
    }

    return { data: this.mapBudget(data as BudgetRow), error: null };
  }

  async getRecurringRules(userId: string): Promise<ServiceResponse<RecurringRule[]>> {
    const { data, error } = await this.supabase
      .from('recurring_transactions')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      return this.failure(error.message);
    }

    return { data: (data as RecurringRow[]).map((row) => this.mapRecurring(row)), error: null };
  }

  async addRecurringRule(userId: string, input: CreateRecurringInput, amount: number, dayOfMonth: number): Promise<ServiceResponse<RecurringRule>> {
    const { data, error } = await this.supabase
      .from('recurring_transactions')
      .insert({
        user_id: userId,
        name: input.name.trim(),
        type: input.type,
        account_id: input.accountId,
        category: input.category,
        amount,
        day_of_month: dayOfMonth,
        starts_on: input.startsOn,
        ends_on: input.endsOn || null,
        active: input.active,
      })
      .select('*')
      .single();

    if (error) {
      return this.failure(error.message);
    }

    return { data: this.mapRecurring(data as RecurringRow), error: null };
  }

  async updateRecurringActive(id: string, active: boolean): Promise<ServiceResponse<RecurringRule>> {
    const { data, error } = await this.supabase
      .from('recurring_transactions')
      .update({ active })
      .eq('id', id)
      .select('*')
      .single();

    if (error) {
      return this.failure(error.message);
    }

    return { data: this.mapRecurring(data as RecurringRow), error: null };
  }

  async getDebts(userId: string): Promise<ServiceResponse<DebtEntry[]>> {
    const { data, error } = await this.supabase
      .from('debts')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      return this.failure(error.message);
    }

    return { data: (data as DebtRow[]).map((row) => this.mapDebt(row)), error: null };
  }

  async addDebt(userId: string, input: CreateDebtInput, amount: number, status: DebtStatus): Promise<ServiceResponse<DebtEntry>> {
    const { data, error } = await this.supabase
      .from('debts')
      .insert({
        user_id: userId,
        kind: input.kind,
        person: input.person.trim(),
        amount,
        paid_amount: 0,
        due_date: input.dueDate,
        note: input.note ?? '',
        status,
      })
      .select('*')
      .single();

    if (error) {
      return this.failure(error.message);
    }

    return { data: this.mapDebt(data as DebtRow), error: null };
  }

  async updateDebtPayment(id: string, paidAmount: number, status: DebtStatus): Promise<ServiceResponse<DebtEntry>> {
    const { data, error } = await this.supabase
      .from('debts')
      .update({
        paid_amount: paidAmount,
        status,
      })
      .eq('id', id)
      .select('*')
      .single();

    if (error) {
      return this.failure(error.message);
    }

    return { data: this.mapDebt(data as DebtRow), error: null };
  }

  emptyData(): FinmateData {
    return createEmptyFinmateData();
  }

  private mapProfile(row: ProfileRow): User {
    return {
      id: row.id,
      name: row.name,
      email: row.email,
      password: row.password,
      failedLoginAttempts: 0,
    };
  }

  private mapAccount(row: AccountRow): Account {
    return {
      id: row.id,
      name: row.name,
      type: this.normalizeAccountType(row.type),
      balance: Number(row.balance),
      createdAt: row.created_at,
    };
  }

  private mapTransaction(row: TransactionRow): Transaction {
    const base = {
      id: row.id,
      type: row.type,
      category: row.category,
      amount: Number(row.amount),
      fee: Number(row.fee ?? 0),
      date: row.date,
      note: row.note ?? '',
      recurringId: row.recurring_id ?? undefined,
      createdAt: row.created_at,
    };

    if (row.type === 'transfer') {
      return {
        ...base,
        fromAccountId: row.account_id ?? undefined,
        toAccountId: row.to_account_id ?? undefined,
      };
    }

    return {
      ...base,
      accountId: row.account_id ?? undefined,
    };
  }

  private mapBudget(row: BudgetRow): Budget {
    return {
      id: row.id,
      category: row.category,
      month: row.month,
      limit: Number(row.limit_amount),
    };
  }

  private mapRecurring(row: RecurringRow): RecurringRule {
    return {
      id: row.id,
      name: row.name,
      type: row.type,
      accountId: row.account_id,
      category: row.category,
      amount: Number(row.amount),
      dayOfMonth: row.day_of_month,
      startsOn: row.starts_on,
      endsOn: row.ends_on ?? undefined,
      active: row.active,
    };
  }

  private mapDebt(row: DebtRow): DebtEntry {
    return {
      id: row.id,
      kind: row.kind,
      person: row.person,
      amount: Number(row.amount),
      paidAmount: Number(row.paid_amount),
      dueDate: row.due_date,
      note: row.note ?? '',
      status: row.status,
      createdAt: row.created_at,
    };
  }

  private normalizeAccountType(type: string): AccountType {
    if (type === 'Cash' || type === 'Bank' || type === 'E-Wallet' || type === 'Other') {
      return type;
    }

    return 'Other';
  }

  private failure<T>(message: string): ServiceResponse<T> {
    return {
      data: null,
      error: { message },
    };
  }
}

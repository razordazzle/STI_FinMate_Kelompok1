import { Injectable } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { environment } from './../../environments/environment';
// d
@Injectable({
  providedIn: 'root',
})
export class SupabaseService {
  private supabase: SupabaseClient;
  constructor() {
    this.supabase = createClient(
      environment.supabaseUrl,
      environment.supabaseKey
    );
  }

  getTodos() {
    return this.supabase.from('todos').select('*');
  }

async getAccounts(userId: string) {
  return await this.supabase
    .from('accounts')
    .select('*')
    .eq('user_id', userId) 
    .order('created_at', { ascending: false });
}



async signUpManual(email: string, name: string, pass: string) {
  const newId = crypto.randomUUID();
  
  const { data, error } = await this.supabase
    .from('profiles')
    .insert({ 
      id: newId, 
      name: name,
      email: email,
      password: pass 
    })
    .select()
    .single();

  return { data, error };
}

async signInManual(email: string, pass: string) {
  return await this.supabase
    .from('profiles')
    .select('*')
    .eq('email', email)
    .eq('password', pass) 
    .single();
}

async getProfileById(userId: string) {
  return await this.supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();
}

async addAccount(userId: string, name: string, type: string, balance: number) {
  return await this.supabase
    .from('accounts')
    .insert({
      user_id: userId,
      name: name,
      type: type,
      balance: balance
    })
    .select() 
    .single();
}
}
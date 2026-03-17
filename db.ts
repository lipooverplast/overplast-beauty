
import { Product, Client, Invoice, RecurringInvoice, Profile, UserRole, UserStatus, StockTransaction, Payment } from './types';
import { supabase, isSupabaseConfigured } from './supabaseClient';

const STORAGE_KEYS = {
  PRODUCTS: 'novainv_products',
  CLIENTS: 'novainv_clients',
  INVOICES: 'novainv_invoices',
  RECURRING: 'novainv_recurring',
  PROFILES: 'novainv_profiles',
  TRANSACTIONS: 'novainv_transactions',
  PAYMENTS: 'novainv_payments'
};

export const isValidUUID = (uuid: string) => {
  if (!uuid) return false;
  const regex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return regex.test(uuid);
};

export const generateUUID = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

const getSafeSession = async () => {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) {
      if (error.message.includes('Refresh Token')) {
        console.warn("Auth: Invalid refresh token, signing out.");
        await supabase.auth.signOut();
      }
      return null;
    }
    return data.session;
  } catch (e) {
    return null;
  }
};

const getUserId = async () => {
  const session = await getSafeSession();
  const userId = session?.user?.id || null;
  return isValidUUID(userId || '') ? userId : null;
};

/**
 * Helper to retry database operations on transient network errors.
 */
async function withRetry(fn: () => any, maxRetries = 3, initialDelay = 1000): Promise<any> {
  let lastError: any;
  for (let i = 0; i < maxRetries; i++) {
    try {
      const result = await fn();
      return result;
    } catch (error: any) {
      lastError = error;
      const isNetworkError = error?.message === 'Failed to fetch' || 
                             error?.name === 'TypeError' && error?.message?.includes('fetch') ||
                             error?.status === 0 || error?.status >= 500;
      
      if (isNetworkError && i < maxRetries - 1) {
        const delay = initialDelay * Math.pow(2, i);
        console.warn(`Database Network Error. Retrying in ${delay}ms... (Attempt ${i + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      throw error;
    }
  }
  throw lastError;
}

export const db = {
  generateUUID,
  isValidUUID,
  
  getProfile: async (id: string): Promise<Profile | null> => {
    if (isSupabaseConfigured && supabase && isValidUUID(id)) {
      try {
        const { data, error } = await withRetry(() => supabase.from('profiles').select('*').eq('id', id).maybeSingle());
        if (error) return null;
        return data;
      } catch (e) { return null; }
    }
    return null;
  },

  ensureProfile: async (user: any): Promise<Profile | null> => {
    if (!isSupabaseConfigured || !supabase || !user || !isValidUUID(user.id)) return null;
    try {
      const { data: existingProfile } = await withRetry(() => supabase.from('profiles').select('*').eq('id', user.id).maybeSingle());
      if (existingProfile) return existingProfile;
      const { data: adminCheck } = await withRetry(() => supabase.from('profiles').select('id').eq('role', 'Admin').limit(1));
      const isFirstAdmin = !adminCheck || adminCheck.length === 0;
      const newProfile = { id: user.id, email: user.email, role: isFirstAdmin ? 'Admin' : 'Staff', status: 'Active' };
      const { data: createdProfile, error: upsertError } = await withRetry(() => supabase.from('profiles').upsert(newProfile).select().single());
      if (upsertError) throw upsertError;
      return createdProfile;
    } catch (e) { return null; }
  },

  getAllProfiles: async (): Promise<Profile[]> => {
    try {
      if (isSupabaseConfigured && supabase) {
        const { data, error } = await withRetry(() => supabase.from('profiles').select('*').order('email'));
        if (error) throw error;
        return data || [];
      }
    } catch (e: any) {
      console.error("Fetch Profiles Error:", e);
    }
    return [];
  },

  getProducts: async (userId?: string): Promise<Product[]> => {
    try {
      if (isSupabaseConfigured && supabase) {
        let query = supabase.from('products').select('*').order('name');
        
        if (userId) {
          query = query.eq('user_id', userId);
        }
        
        const { data, error } = await withRetry(() => query);
        if (error) throw error;
        return (data || []).map(p => ({
          id: p.id, name: p.name, sku: p.sku || '', category: p.category || 'General',
          price: Number(p.tp) || Number(p.price) || 0, cost: Number(p.cost) || 0,
          purchasePrice: Number(p.cost) || 0,
          mrp: Number(p.mrp) || 0, tp: Number(p.tp) || 0, stock: Number(p.stock) || 0,
          minStock: Number(p.min_stock) || 0, description: p.description || '',
          createdBy: p.user_id,
          createdByName: p.user_email,
          createdAt: p.created_at
        }));
      }
    } catch (err) {
      console.error("Error fetching products:", err);
    }
    const data = localStorage.getItem(STORAGE_KEYS.PRODUCTS);
    const products = data ? JSON.parse(data) : [];
    
    if (userId) {
      // For local storage, we don't easily know who the admin is, 
      // but we can assume products with no createdBy or specific admin email are shared
      // For simplicity in local mode, we'll just show all products if it's a small shop
      // or filter by userId. But the user wants admin products shared.
      return products.filter((p: any) => p.createdBy === userId || !p.createdBy);
    }
    return products;
  },

  saveProducts: async (productsToSave: Product[]) => {
    const processedProducts = productsToSave.map(p => {
      if (!isValidUUID(p.id)) {
        p.id = generateUUID();
      }
      return p;
    });

    if (isSupabaseConfigured && supabase) {
      const session = await getSafeSession();
      const userId = session?.user?.id;
      const userEmail = session?.user?.email;
      if (!userId) throw new Error("Please log in again. Session expired.");
      
      const dbRows = processedProducts.map(p => {
        const row: any = {
          id: p.id,
          name: p.name, sku: p.sku, category: p.category,
          price: p.tp, cost: p.purchasePrice, mrp: p.mrp, tp: p.tp, stock: p.stock,
          min_stock: p.minStock, description: p.description
        };
        row.user_id = p.createdBy || userId;
        row.user_email = p.createdByName || userEmail;
        return row;
      });
      const { error } = await withRetry(() => supabase.from('products').upsert(dbRows));
      if (error) throw new Error(error.message);
    }
    
    // Merge with existing LocalStorage data
    const localData = localStorage.getItem(STORAGE_KEYS.PRODUCTS);
    const existing = localData ? JSON.parse(localData) : [];
    const updated = [...existing];
    processedProducts.forEach(newP => {
      const idx = updated.findIndex(p => p.id === newP.id);
      if (idx > -1) updated[idx] = newP;
      else updated.push(newP);
    });
    localStorage.setItem(STORAGE_KEYS.PRODUCTS, JSON.stringify(updated));
  },

  getClients: async (userId?: string): Promise<Client[]> => {
    try {
      if (isSupabaseConfigured && supabase) {
        let query = supabase.from('clients').select('*').order('name');
        if (userId) query = query.eq('user_id', userId);
        const { data, error } = await withRetry(() => query);
        if (error) throw error;
        return (data || []).map(c => ({
          id: c.id,
          name: c.name,
          phone: c.phone || '',
          address: c.address || '',
          doctorName: c.doctor_name || '',
          hospitalName: c.hospital_name || '',
          doctorPhone: c.doctor_phone || '',
          createdBy: c.user_id,
          createdByName: c.user_email,
          createdAt: c.created_at
        }));
      }
    } catch (err) {}
    const data = localStorage.getItem(STORAGE_KEYS.CLIENTS);
    const clients = data ? JSON.parse(data) : [];
    if (userId) return clients.filter((c: any) => c.createdBy === userId);
    return clients;
  },

  saveClients: async (clientsToSave: Client[]) => {
    const processedClients = clientsToSave.map(c => {
      if (!isValidUUID(c.id)) {
        c.id = generateUUID();
      }
      return c;
    });

    if (isSupabaseConfigured && supabase) {
      const session = await getSafeSession();
      const userId = session?.user?.id;
      const userEmail = session?.user?.email;
      if (!userId) throw new Error("Please log in again. Session expired.");
      
      const dbRows = processedClients.map(c => {
        const row: any = { 
          id: c.id, 
          name: c.name, 
          phone: c.phone || '', 
          address: c.address || '',
          doctor_name: c.doctorName || '',
          hospital_name: c.hospitalName || '',
          doctor_phone: c.doctorPhone || ''
        };
        if (userId) {
          row.user_id = c.createdBy || userId;
          row.user_email = c.createdByName || userEmail;
        }
        return row;
      });
      const { error } = await withRetry(() => supabase.from('clients').upsert(dbRows));
      if (error) throw error;
    }
    
    // Merge with existing LocalStorage data
    const localData = localStorage.getItem(STORAGE_KEYS.CLIENTS);
    const existing = localData ? JSON.parse(localData) : [];
    const updated = [...existing];
    processedClients.forEach(newC => {
      const idx = updated.findIndex(c => c.id === newC.id);
      if (idx > -1) updated[idx] = newC;
      else updated.push(newC);
    });
    localStorage.setItem(STORAGE_KEYS.CLIENTS, JSON.stringify(updated));
  },

  getInvoices: async (userId?: string): Promise<Invoice[]> => {
    try {
      if (isSupabaseConfigured && supabase) {
        let query = supabase.from('invoices').select('*').order('date', { ascending: false });
        if (userId) query = query.eq('user_id', userId);
        const { data, error } = await withRetry(() => query);
        if (error) throw error;
        return (data || []).map(inv => ({
          id: inv.id, invoiceNumber: inv.invoice_number, clientId: inv.client_id,
          clientName: inv.client_name, date: inv.date, items: inv.items || [],
          subtotal: Number(inv.subtotal), 
          discountRate: Number(inv.discount_rate || 0),
          discountTotal: Number(inv.discount_total || 0),
          taxRate: Number(inv.tax_rate),
          taxTotal: Number(inv.tax_total), total: Number(inv.total),
          status: inv.status, 
          paymentMethod: inv.payment_method || 'Cash',
          paidAmount: Number(inv.paid_amount || 0),
          createdBy: inv.user_id,
          createdByName: inv.user_email,
          createdAt: inv.created_at
        }));
      }
    } catch (err) {}
    const data = localStorage.getItem(STORAGE_KEYS.INVOICES);
    const invoices = (data ? JSON.parse(data) : []).map((inv: any) => ({
      ...inv,
      items: inv.items || [],
      paidAmount: inv.paidAmount || 0
    }));
    if (userId) return invoices.filter((inv: any) => inv.createdBy === userId);
    return invoices;
  },

  saveInvoices: async (invoicesToSave: Invoice[]) => {
    const processedInvoices = invoicesToSave.map(inv => {
      if (!isValidUUID(inv.id)) {
        inv.id = generateUUID();
      }
      return {
        ...inv,
        paidAmount: inv.paidAmount || 0
      };
    });

    if (isSupabaseConfigured && supabase) {
      const session = await getSafeSession();
      const userId = session?.user?.id;
      const userEmail = session?.user?.email;
      if (!userId) throw new Error("Please log in again. Session expired.");
      
      const dbRows = processedInvoices.map(inv => {
        const row: any = {
          id: inv.id,
          user_id: inv.createdBy || userId,
          user_email: inv.createdByName || userEmail,
          invoice_number: inv.invoiceNumber, client_id: inv.clientId, client_name: inv.clientName,
          date: inv.date, items: inv.items, subtotal: inv.subtotal, 
          discount_rate: inv.discountRate || 0,
          discount_total: inv.discountTotal || 0,
          tax_rate: inv.taxRate,
          tax_total: inv.taxTotal, total: inv.total, status: inv.status, 
          payment_method: inv.paymentMethod || 'Cash',
          paid_amount: inv.paidAmount || 0
        };
        return row;
      });
      const { error } = await withRetry(() => supabase.from('invoices').upsert(dbRows));
      if (error) {
        if (error.code === '42703' || error.message.includes('column')) {
          throw new Error("Missing 'discount' or 'tax' columns in 'invoices' table. Please run the Repair Script in Settings.");
        }
        throw new Error(error.message);
      }
    }
    
    // Merge with local storage
    const localData = localStorage.getItem(STORAGE_KEYS.INVOICES);
    const existing = localData ? JSON.parse(localData) : [];
    const updated = [...existing];
    processedInvoices.forEach(newInv => {
      const idx = updated.findIndex(i => i.id === newInv.id);
      if (idx > -1) updated[idx] = newInv;
      else updated.push(newInv);
    });
    localStorage.setItem(STORAGE_KEYS.INVOICES, JSON.stringify(updated));
  },

  getRecurringInvoices: async (userId?: string): Promise<RecurringInvoice[]> => {
    try {
      if (isSupabaseConfigured && supabase) {
        let query = supabase.from('recurring_invoices').select('*');
        if (userId) query = query.eq('user_id', userId);
        const { data, error } = await withRetry(() => query);
        if (error) throw error;
        return (data || []).map(ri => ({
          id: ri.id,
          clientId: ri.client_id,
          clientName: ri.client_name,
          items: ri.items || [],
          subtotal: Number(ri.subtotal),
          discountRate: Number(ri.discount_rate || 0),
          discountTotal: Number(ri.discount_total || 0),
          taxRate: Number(ri.tax_rate),
          taxTotal: Number(ri.tax_total || 0),
          total: Number(ri.total),
          frequency: ri.frequency,
          startDate: ri.start_date,
          nextRunDate: ri.next_run_date,
          status: ri.status,
          lastGeneratedDate: ri.last_generated_date,
          createdBy: ri.user_id,
          createdByName: ri.user_email,
          createdAt: ri.created_at
        }));
      }
    } catch (err) {}
    const data = localStorage.getItem(STORAGE_KEYS.RECURRING);
    const recurring = data ? JSON.parse(data) : [];
    if (userId) return recurring.filter((ri: any) => ri.createdBy === userId);
    return recurring;
  },

  saveRecurringInvoices: async (recurring: RecurringInvoice[]) => {
    const processedRecurring = recurring.map(ri => {
      if (!isValidUUID(ri.id)) {
        ri.id = generateUUID();
      }
      return ri;
    });

    if (isSupabaseConfigured && supabase) {
      const session = await getSafeSession();
      const userId = session?.user?.id;
      const userEmail = session?.user?.email;
      if (!userId) throw new Error("Please log in again. Session expired.");

      const dbRows = processedRecurring.map(ri => {
        const row: any = {
          id: ri.id,
          user_id: ri.createdBy || userId,
          user_email: ri.createdByName || userEmail,
          client_id: ri.clientId, 
          client_name: ri.clientName, 
          items: ri.items,
          subtotal: ri.subtotal, 
          discount_rate: ri.discountRate || 0,
          discount_total: ri.discountTotal || 0,
          tax_rate: ri.taxRate, 
          tax_total: ri.taxTotal || 0,
          total: ri.total,
          frequency: ri.frequency, 
          start_date: ri.startDate, 
          next_run_date: ri.nextRunDate,
          status: ri.status
        };
        return row;
      });
      const { error } = await withRetry(() => supabase.from('recurring_invoices').upsert(dbRows));
      if (error) {
         if (error.code === '42P01') {
           throw new Error("Missing 'recurring_invoices' table. Please run the Repair Script in Settings.");
         }
         if (error.code === '42703' || error.message.includes('column')) {
           throw new Error("Missing 'discount' or 'tax' columns in 'recurring_invoices' table. Please run the Repair Script in Settings.");
         }
         throw new Error(error.message);
      }
    }
    
    // Merge local storage
    const localData = localStorage.getItem(STORAGE_KEYS.RECURRING);
    const existing = localData ? JSON.parse(localData) : [];
    const updated = [...existing];
    processedRecurring.forEach(newRI => {
      const idx = updated.findIndex(r => r.id === newRI.id);
      if (idx > -1) updated[idx] = newRI;
      else updated.push(newRI);
    });
    localStorage.setItem(STORAGE_KEYS.RECURRING, JSON.stringify(updated));
  },

  deleteRecurringInvoice: async (id: string) => {
    const idStr = String(id);
    
    const localData = localStorage.getItem(STORAGE_KEYS.RECURRING);
    if (localData) {
      const current = JSON.parse(localData);
      const filtered = current.filter((ri: any) => String(ri.id) !== idStr);
      localStorage.setItem(STORAGE_KEYS.RECURRING, JSON.stringify(filtered));
    }

    if (isSupabaseConfigured && supabase) {
      try {
        await supabase.from('recurring_invoices').delete().eq('id', id);
      } catch (e) {}
    }
  },

  deleteInvoice: async (id: string) => {
    const idStr = String(id);
    const localData = localStorage.getItem(STORAGE_KEYS.INVOICES);
    if (localData) {
      const current = JSON.parse(localData);
      const filtered = current.filter((inv: any) => String(inv.id) !== idStr);
      localStorage.setItem(STORAGE_KEYS.INVOICES, JSON.stringify(filtered));
    }

    if (isSupabaseConfigured && supabase) {
      try {
        await supabase.from('invoices').delete().eq('id', id);
      } catch (e) {}
    }
  },

  deleteProduct: async (id: string) => {
    const idStr = String(id);
    const localData = localStorage.getItem(STORAGE_KEYS.PRODUCTS);
    if (localData) {
      const current = JSON.parse(localData);
      const filtered = current.filter((p: any) => String(p.id) !== idStr);
      localStorage.setItem(STORAGE_KEYS.PRODUCTS, JSON.stringify(filtered));
    }

    if (isSupabaseConfigured && supabase) {
      try {
        await supabase.from('products').delete().eq('id', id);
      } catch (e) {}
    }
  },

  deleteStockTransaction: async (id: string) => {
    const idStr = String(id);
    const localData = localStorage.getItem(STORAGE_KEYS.TRANSACTIONS);
    if (localData) {
      const current = JSON.parse(localData);
      const filtered = current.filter((t: any) => String(t.id) !== idStr);
      localStorage.setItem(STORAGE_KEYS.TRANSACTIONS, JSON.stringify(filtered));
    }

    if (isSupabaseConfigured && supabase) {
      try {
        await supabase.from('stock_transactions').delete().eq('id', id);
      } catch (e) {}
    }
  },

  deleteClient: async (id: string) => {
    const idStr = String(id);
    
    const localData = localStorage.getItem(STORAGE_KEYS.CLIENTS);
    if (localData) {
      const current = JSON.parse(localData);
      const filtered = current.filter((c: any) => String(c.id) !== idStr);
      localStorage.setItem(STORAGE_KEYS.CLIENTS, JSON.stringify(filtered));
    }

    const localRecurring = localStorage.getItem(STORAGE_KEYS.RECURRING);
    if (localRecurring) {
      const recurring = JSON.parse(localRecurring);
      const filteredRec = recurring.filter((ri: any) => String(ri.clientId) !== idStr);
      localStorage.setItem(STORAGE_KEYS.RECURRING, JSON.stringify(filteredRec));
    }

    if (isSupabaseConfigured && supabase) {
      try {
        await supabase.from('clients').delete().eq('id', id);
        await supabase.from('recurring_invoices').delete().eq('client_id', id);
      } catch (e) {}
    }
  },

  getStockTransactions: async (userId?: string): Promise<StockTransaction[]> => {
    try {
      if (isSupabaseConfigured && supabase) {
        let query = supabase.from('stock_transactions').select('*').order('date', { ascending: false });
        
        if (userId) {
          query = query.eq('user_id', userId);
        }
        
        const { data, error } = await withRetry(() => query);
        if (error) throw error;
        return (data || []).map(t => ({
          id: t.id, productId: t.product_id, productName: t.product_name,
          type: t.type, quantity: Number(t.quantity), date: t.date, note: t.note,
          createdBy: t.user_id,
          createdByName: t.user_email,
          createdAt: t.created_at
        }));
      }
    } catch (err) {
      console.error("Error fetching transactions:", err);
    }
    const data = localStorage.getItem(STORAGE_KEYS.TRANSACTIONS);
    const transactions = data ? JSON.parse(data) : [];
    if (userId) return transactions.filter((t: any) => t.createdBy === userId || !t.createdBy);
    return transactions;
  },

  saveStockTransactions: async (transactions: StockTransaction[]) => {
    if (isSupabaseConfigured && supabase) {
      const session = await getSafeSession();
      const userId = session?.user?.id;
      const userEmail = session?.user?.email;
      const dbRows = transactions.map(t => {
        const row: any = {
          user_id: t.createdBy || userId, 
          user_email: t.createdByName || userEmail,
          product_id: t.productId, product_name: t.productName,
          type: t.type, quantity: t.quantity, date: t.date, note: t.note
        };
        row.id = isValidUUID(t.id) ? t.id : generateUUID();
        return row;
      });
      const { error } = await withRetry(() => supabase.from('stock_transactions').upsert(dbRows));
      if (error) throw new Error(error.message);
    }
    
    const localData = localStorage.getItem(STORAGE_KEYS.TRANSACTIONS);
    const existing = localData ? JSON.parse(localData) : [];
    const updated = [...existing, ...transactions];
    localStorage.setItem(STORAGE_KEYS.TRANSACTIONS, JSON.stringify(updated));
  },

  updateUserStatus: async (id: string, status: UserStatus) => {
    if (isSupabaseConfigured && supabase && isValidUUID(id)) {
      const { error } = await withRetry(() => supabase.from('profiles').update({ status }).eq('id', id));
      if (error) throw error;
    }
  },

  updateProfilePassword: async (id: string, password: string) => {
    if (isSupabaseConfigured && supabase && isValidUUID(id)) {
      const { error } = await withRetry(() => supabase.from('profiles').update({ password }).eq('id', id));
      if (error) throw error;
    }
  },

  deleteProfile: async (id: string) => {
    if (isSupabaseConfigured && supabase && isValidUUID(id)) {
      const { error } = await withRetry(() => supabase.from('profiles').delete().eq('id', id));
      if (error) throw error;
    }
  },

  getPayments: async (invoiceId?: string, userId?: string): Promise<Payment[]> => {
    try {
      if (isSupabaseConfigured && supabase) {
        let query = supabase.from('payments').select('*').order('date', { ascending: false });
        if (invoiceId) query = query.eq('invoice_id', invoiceId);
        if (userId) query = query.eq('user_id', userId);
        const { data, error } = await withRetry(() => query);
        if (error) throw error;
        return (data || []).map(p => ({
          id: p.id, invoiceId: p.invoice_id, amount: Number(p.amount),
          date: p.date, note: p.note,
          createdBy: p.user_id,
          createdByName: p.user_email
        }));
      }
    } catch (err) {}
    const data = localStorage.getItem(STORAGE_KEYS.PAYMENTS);
    const payments = data ? JSON.parse(data) : [];
    let filtered = payments;
    if (invoiceId) filtered = filtered.filter((p: any) => p.invoiceId === invoiceId);
    if (userId) filtered = filtered.filter((p: any) => p.createdBy === userId);
    return filtered;
  },

  savePayment: async (payment: Payment) => {
    if (!isValidUUID(payment.id)) payment.id = generateUUID();

    if (isSupabaseConfigured && supabase) {
      const session = await getSafeSession();
      const userId = session?.user?.id;
      const userEmail = session?.user?.email;
      
      const row = {
        id: payment.id,
        user_id: payment.createdBy || userId,
        user_email: payment.createdByName || userEmail,
        invoice_id: payment.invoiceId,
        amount: payment.amount,
        date: payment.date,
        note: payment.note
      };
      const { error } = await withRetry(() => supabase.from('payments').upsert(row));
      if (error) throw error;
    }

    const localData = localStorage.getItem(STORAGE_KEYS.PAYMENTS);
    const existing = localData ? JSON.parse(localData) : [];
    const idx = existing.findIndex((p: any) => p.id === payment.id);
    if (idx > -1) existing[idx] = payment;
    else existing.push(payment);
    localStorage.setItem(STORAGE_KEYS.PAYMENTS, JSON.stringify(existing));
  },

  exportDatabase: async (userId?: string) => {
    const [p, c, i] = await Promise.all([db.getProducts(userId), db.getClients(userId), db.getInvoices(userId)]);
    const data = { products: p, clients: c, invoices: i };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `overplast_backup_${userId || 'admin'}.json`;
    link.click();
  }
};

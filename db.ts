
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

const getUserId = async () => {
  if (!supabase) return null;
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const userId = session?.user?.id || null;
    return isValidUUID(userId || '') ? userId : null;
  } catch (e) {
    return null;
  }
};

export const db = {
  generateUUID,
  isValidUUID,
  
  getProfile: async (id: string): Promise<Profile | null> => {
    if (isSupabaseConfigured && supabase && isValidUUID(id)) {
      try {
        const { data, error } = await supabase.from('profiles').select('*').eq('id', id).maybeSingle();
        if (error) return null;
        return data;
      } catch (e) { return null; }
    }
    return null;
  },

  ensureProfile: async (user: any): Promise<Profile | null> => {
    if (!isSupabaseConfigured || !supabase || !user || !isValidUUID(user.id)) return null;
    try {
      const { data: existingProfile } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle();
      if (existingProfile) return existingProfile;
      const { data: adminCheck } = await supabase.from('profiles').select('id').eq('role', 'Admin').limit(1);
      const isFirstAdmin = !adminCheck || adminCheck.length === 0;
      const newProfile = { id: user.id, email: user.email, role: isFirstAdmin ? 'Admin' : 'Staff', status: 'Active' };
      const { data: createdProfile, error: upsertError } = await supabase.from('profiles').upsert(newProfile).select().single();
      if (upsertError) throw upsertError;
      return createdProfile;
    } catch (e) { return null; }
  },

  getAllProfiles: async (): Promise<Profile[]> => {
    if (isSupabaseConfigured && supabase) {
      const { data } = await supabase.from('profiles').select('*').order('email');
      return data || [];
    }
    return [];
  },

  getProducts: async (): Promise<Product[]> => {
    try {
      if (isSupabaseConfigured && supabase) {
        const { data, error } = await supabase.from('products').select('*').order('name');
        if (error) throw error;
        return (data || []).map(p => ({
          id: p.id, name: p.name, sku: p.sku || '', category: p.category || 'General',
          price: Number(p.tp) || Number(p.price) || 0, cost: Number(p.tp) || Number(p.cost) || 0,
          mrp: Number(p.mrp) || 0, tp: Number(p.tp) || 0, stock: Number(p.stock) || 0,
          minStock: Number(p.min_stock) || 0, description: p.description || ''
        }));
      }
    } catch (err) {}
    const data = localStorage.getItem(STORAGE_KEYS.PRODUCTS);
    return data ? JSON.parse(data) : [];
  },

  saveProducts: async (productsToSave: Product[]) => {
    const processedProducts = productsToSave.map(p => {
      if (!isValidUUID(p.id)) {
        p.id = generateUUID();
      }
      return p;
    });

    if (isSupabaseConfigured && supabase) {
      const userId = await getUserId();
      const dbRows = processedProducts.map(p => {
        const row: any = {
          id: p.id,
          name: p.name, sku: p.sku, category: p.category,
          price: p.tp, cost: p.tp, mrp: p.mrp, tp: p.tp, stock: p.stock,
          min_stock: p.minStock, description: p.description
        };
        if (userId) row.user_id = userId;
        return row;
      });
      const { error } = await supabase.from('products').upsert(dbRows);
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

  getClients: async (): Promise<Client[]> => {
    try {
      if (isSupabaseConfigured && supabase) {
        const { data, error } = await supabase.from('clients').select('*').order('name');
        if (error) throw error;
        return (data || []).map(c => ({
          id: c.id,
          name: c.name,
          email: c.email || '',
          phone: c.phone || '',
          address: c.address || '',
          doctorName: c.doctor_name || '',
          hospitalName: c.hospital_name || '',
          doctorPhone: c.doctor_phone || ''
        }));
      }
    } catch (err) {}
    const data = localStorage.getItem(STORAGE_KEYS.CLIENTS);
    return data ? JSON.parse(data) : [];
  },

  saveClients: async (clientsToSave: Client[]) => {
    const processedClients = clientsToSave.map(c => {
      if (!isValidUUID(c.id)) {
        c.id = generateUUID();
      }
      return c;
    });

    if (isSupabaseConfigured && supabase) {
      const userId = await getUserId();
      const dbRows = processedClients.map(c => {
        const row: any = { 
          id: c.id, 
          name: c.name, 
          email: c.email || '', 
          phone: c.phone || '', 
          address: c.address || '',
          doctor_name: c.doctorName || '',
          hospital_name: c.hospitalName || '',
          doctor_phone: c.doctorPhone || ''
        };
        if (userId) row.user_id = userId;
        return row;
      });
      const { error } = await supabase.from('clients').upsert(dbRows);
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

  getInvoices: async (): Promise<Invoice[]> => {
    try {
      if (isSupabaseConfigured && supabase) {
        const { data, error } = await supabase.from('invoices').select('*').order('date', { ascending: false });
        if (error) throw error;
        return (data || []).map(inv => ({
          id: inv.id, invoiceNumber: inv.invoice_number, clientId: inv.client_id,
          clientName: inv.client_name, date: inv.date, items: inv.items || [],
          subtotal: Number(inv.subtotal), taxRate: Number(inv.tax_rate),
          taxTotal: Number(inv.tax_total), total: Number(inv.total),
          status: inv.status, 
          paymentMethod: inv.payment_method || 'Cash',
          paidAmount: Number(inv.paid_amount || 0)
        }));
      }
    } catch (err) {}
    const data = localStorage.getItem(STORAGE_KEYS.INVOICES);
    return (data ? JSON.parse(data) : []).map((inv: any) => ({
      ...inv,
      items: inv.items || [],
      paidAmount: inv.paidAmount || 0
    }));
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
      const userId = await getUserId();
      if (!userId) throw new Error("Please log in again. Session expired.");
      
      const dbRows = processedInvoices.map(inv => {
        const row: any = {
          id: inv.id,
          user_id: userId,
          invoice_number: inv.invoiceNumber, client_id: inv.clientId, client_name: inv.clientName,
          date: inv.date, items: inv.items, subtotal: inv.subtotal, tax_rate: inv.taxRate,
          tax_total: inv.taxTotal, total: inv.total, status: inv.status, 
          payment_method: inv.paymentMethod || 'Cash',
          paid_amount: inv.paidAmount || 0
        };
        return row;
      });
      const { error } = await supabase.from('invoices').upsert(dbRows);
      if (error) throw new Error(error.message);
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

  getRecurringInvoices: async (): Promise<RecurringInvoice[]> => {
    try {
      if (isSupabaseConfigured && supabase) {
        const { data, error } = await supabase.from('recurring_invoices').select('*');
        if (error) throw error;
        return (data || []).map(ri => ({
          id: ri.id,
          clientId: ri.client_id,
          clientName: ri.client_name,
          items: ri.items || [],
          subtotal: Number(ri.subtotal),
          taxRate: Number(ri.tax_rate),
          total: Number(ri.total),
          frequency: ri.frequency,
          startDate: ri.start_date,
          nextRunDate: ri.next_run_date,
          status: ri.status,
          lastGeneratedDate: ri.last_generated_date
        }));
      }
    } catch (err) {}
    const data = localStorage.getItem(STORAGE_KEYS.RECURRING);
    return data ? JSON.parse(data) : [];
  },

  saveRecurringInvoices: async (recurring: RecurringInvoice[]) => {
    const processedRecurring = recurring.map(ri => {
      if (!isValidUUID(ri.id)) {
        ri.id = generateUUID();
      }
      return ri;
    });

    if (isSupabaseConfigured && supabase) {
      const userId = await getUserId();
      if (!userId) throw new Error("Please log in again. Session expired.");

      const dbRows = processedRecurring.map(ri => {
        const row: any = {
          id: ri.id,
          user_id: userId,
          client_id: ri.clientId, 
          client_name: ri.clientName, 
          items: ri.items,
          subtotal: ri.subtotal, 
          tax_rate: ri.taxRate, 
          total: ri.total,
          frequency: ri.frequency, 
          start_date: ri.startDate, 
          next_run_date: ri.nextRunDate,
          status: ri.status
        };
        return row;
      });
      const { error } = await supabase.from('recurring_invoices').upsert(dbRows);
      if (error) {
         if (error.code === '42P01') {
           throw new Error("Missing 'recurring_invoices' table. Please run the Repair Script in Settings.");
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

  getStockTransactions: async (): Promise<StockTransaction[]> => {
    try {
      if (isSupabaseConfigured && supabase) {
        const { data, error } = await supabase.from('stock_transactions').select('*').order('date', { ascending: false });
        if (error) throw error;
        return (data || []).map(t => ({
          id: t.id, productId: t.product_id, productName: t.product_name,
          type: t.type, quantity: Number(t.quantity), date: t.date, note: t.note
        }));
      }
    } catch (err) {}
    const data = localStorage.getItem(STORAGE_KEYS.TRANSACTIONS);
    return data ? JSON.parse(data) : [];
  },

  saveStockTransactions: async (transactions: StockTransaction[]) => {
    if (isSupabaseConfigured && supabase) {
      const userId = await getUserId();
      const dbRows = transactions.map(t => {
        const row: any = {
          user_id: userId, product_id: t.productId, product_name: t.productName,
          type: t.type, quantity: t.quantity, date: t.date, note: t.note
        };
        row.id = isValidUUID(t.id) ? t.id : generateUUID();
        return row;
      });
      const { error } = await supabase.from('stock_transactions').upsert(dbRows);
      if (error) throw new Error(error.message);
    }
    localStorage.setItem(STORAGE_KEYS.TRANSACTIONS, JSON.stringify(transactions));
  },

  updateUserStatus: async (id: string, status: UserStatus) => {
    if (isSupabaseConfigured && supabase && isValidUUID(id)) {
      const { error } = await supabase.from('profiles').update({ status }).eq('id', id);
      if (error) throw error;
    }
  },

  getPayments: async (invoiceId?: string): Promise<Payment[]> => {
    try {
      if (isSupabaseConfigured && supabase) {
        let query = supabase.from('payments').select('*').order('date', { ascending: false });
        if (invoiceId) query = query.eq('invoice_id', invoiceId);
        const { data, error } = await query;
        if (error) throw error;
        return (data || []).map(p => ({
          id: p.id, invoiceId: p.invoice_id, amount: Number(p.amount),
          date: p.date, note: p.note
        }));
      }
    } catch (err) {}
    const data = localStorage.getItem(STORAGE_KEYS.PAYMENTS);
    const payments = data ? JSON.parse(data) : [];
    if (invoiceId) return payments.filter((p: any) => p.invoiceId === invoiceId);
    return payments;
  },

  savePayment: async (payment: Payment) => {
    if (!isValidUUID(payment.id)) payment.id = generateUUID();

    if (isSupabaseConfigured && supabase) {
      const userId = await getUserId();
      const row = {
        id: payment.id,
        user_id: userId,
        invoice_id: payment.invoiceId,
        amount: payment.amount,
        date: payment.date,
        note: payment.note
      };
      const { error } = await supabase.from('payments').upsert(row);
      if (error) throw error;
    }

    const localData = localStorage.getItem(STORAGE_KEYS.PAYMENTS);
    const existing = localData ? JSON.parse(localData) : [];
    existing.push(payment);
    localStorage.setItem(STORAGE_KEYS.PAYMENTS, JSON.stringify(existing));
  },

  exportDatabase: async () => {
    const [p, c, i] = await Promise.all([db.getProducts(), db.getClients(), db.getInvoices()]);
    const data = { products: p, clients: c, invoices: i };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `overplast_backup.json`;
    link.click();
  }
};

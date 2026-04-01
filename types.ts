
export type UserRole = 'Admin' | 'Staff';
export type UserStatus = 'Active' | 'Suspended' | 'Pending';

export interface Profile {
  id: string;
  email: string;
  role: UserRole;
  status?: UserStatus;
  password?: string; // Stored for admin reference as requested
  last_login?: string;
  created_at?: string;
}

export interface Product {
  id: string;
  name: string;
  sku: string;
  size?: string;
  category: string;
  price: number;
  cost: number;
  mrp: number;
  tp: number;
  purchasePrice: number;
  stock: number;
  minStock: number;
  description: string;
  createdBy?: string;
  createdByName?: string;
  createdAt?: string;
}

export interface StockTransaction {
  id: string;
  productId: string;
  productName: string;
  productSize?: string;
  type: 'IN' | 'OUT' | 'RETURN';
  quantity: number;
  date: string;
  note?: string;
  createdBy?: string;
  createdByName?: string;
  createdAt?: string;
}

export interface Client {
  id: string;
  name: string; // Patient Name
  phone: string; // Patient Mobile No
  address: string;
  doctorName: string;
  hospitalName: string;
  doctorPhone: string;
  createdBy?: string;
  createdByName?: string;
  createdAt?: string;
}

export interface InvoiceItem {
  productId: string;
  name: string;
  size?: string;
  quantity: number;
  price: number; 
  mrp: number;
  tp: number;
  discount: number; 
  total: number; 
}

export interface Payment {
  id: string;
  invoiceId: string;
  amount: number;
  date: string;
  note?: string;
  createdBy?: string;
  createdByName?: string;
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  clientId: string;
  clientName: string;
  date: string;
  items: InvoiceItem[];
  subtotal: number;
  discountRate: number;
  discountTotal: number;
  taxRate: number; 
  taxTotal: number;
  total: number;
  status: 'Paid' | 'Pending' | 'Overdue' | 'Returned';
  paymentMethod: 'Cash' | 'Credit';
  paidAmount?: number;
  salesPerson?: string;
  createdBy?: string;
  createdByName?: string;
  createdAt?: string;
}

export type Frequency = 'Weekly' | 'Monthly' | 'Quarterly' | 'Yearly';

export interface RecurringInvoice {
  id: string;
  clientId: string;
  clientName: string;
  items: InvoiceItem[];
  subtotal: number;
  discountRate: number;
  discountTotal: number;
  taxRate: number;
  taxTotal: number;
  total: number;
  frequency: Frequency;
  startDate: string;
  nextRunDate: string;
  status: 'Active' | 'Paused' | 'Completed';
  lastGeneratedDate?: string;
  createdBy?: string;
  createdByName?: string;
  createdAt?: string;
}

export type ViewType = 'dashboard' | 'inventory' | 'invoices' | 'recurring' | 'clients' | 'settings' | 'users' | 'admin-office' | 'reports';

export interface FinancialStats {
  totalSales: number;
  totalProfit: number;
  pendingAmount: number;
  inventoryValue: number;
}

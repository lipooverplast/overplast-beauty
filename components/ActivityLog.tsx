
import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../db';
import { StockTransaction, Invoice, Client, Product, Profile } from '../types';
import { 
  Loader2, Activity, Search, Filter, Calendar, 
  User, Package, FileText, Users, ArrowRight,
  Clock, CheckCircle2, AlertCircle, RefreshCw
} from 'lucide-react';

interface ActivityItem {
  id: string;
  type: 'transaction' | 'invoice' | 'client' | 'product';
  action: string;
  user: string;
  userName: string;
  timestamp: string;
  details: string;
  metadata?: any;
}

interface ActivityLogProps {
  invoices?: Invoice[];
  clients?: Client[];
  products?: Product[];
  onRefresh?: () => void;
}

const ActivityLog: React.FC<ActivityLogProps> = ({ invoices: propInvoices, clients: propClients, products: propProducts, onRefresh }) => {
  const [loading, setLoading] = useState(!propInvoices);
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [selectedUser, setSelectedUser] = useState<string>('all');
  const [profiles, setProfiles] = useState<Profile[]>([]);

  useEffect(() => {
    fetchActivities();
  }, [propInvoices, propClients, propProducts]);

  const fetchActivities = async () => {
    if (!propInvoices) setLoading(true);
    try {
      const [transactions, invoices, clients, products, userProfiles] = await Promise.all([
        db.getStockTransactions(),
        propInvoices ? Promise.resolve(propInvoices) : db.getInvoices(),
        propClients ? Promise.resolve(propClients) : db.getClients(),
        propProducts ? Promise.resolve(propProducts) : db.getProducts(),
        db.getAllProfiles()
      ]);

      setProfiles(userProfiles);

      const allActivities: ActivityItem[] = [];

      // Process Transactions
      transactions.forEach(t => {
        allActivities.push({
          id: t.id,
          type: 'transaction',
          action: t.type === 'IN' ? 'Stock Added' : 'Stock Removed',
          user: t.createdBy || 'Unknown',
          userName: t.createdByName || 'Unknown User',
          timestamp: t.createdAt || t.date,
          details: `${t.type === 'IN' ? '+' : '-'}${t.quantity} ${t.productName}`,
          metadata: t
        });
      });

      // Process Invoices
      invoices.forEach(inv => {
        allActivities.push({
          id: inv.id,
          type: 'invoice',
          action: 'Invoice Created',
          user: inv.createdBy || 'Unknown',
          userName: inv.createdByName || 'Unknown User',
          timestamp: inv.createdAt || inv.date,
          details: `Invoice #${inv.invoiceNumber} for ${inv.clientName} - Rs. ${inv.total.toLocaleString()}`,
          metadata: inv
        });
      });

      // Process Clients
      clients.forEach(c => {
        allActivities.push({
          id: c.id,
          type: 'client',
          action: 'Client Registered',
          user: c.createdBy || 'Unknown',
          userName: c.createdByName || 'Unknown User',
          timestamp: c.createdAt || new Date().toISOString(),
          details: `Client: ${c.name} (${c.hospitalName})`,
          metadata: c
        });
      });

      // Process Products
      products.forEach(p => {
        allActivities.push({
          id: p.id,
          type: 'product',
          action: 'Product Added',
          user: p.createdBy || 'Unknown',
          userName: p.createdByName || 'Unknown User',
          timestamp: p.createdAt || new Date().toISOString(),
          details: `Product: ${p.name} - ${p.category}`,
          metadata: p
        });
      });

      // Sort by timestamp descending
      allActivities.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      setActivities(allActivities);
    } catch (err) {
      console.error("Failed to fetch activities", err);
    } finally {
      setLoading(false);
    }
  };

  const filteredActivities = useMemo(() => {
    return activities.filter(a => {
      const matchesSearch = 
        a.userName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        a.details.toLowerCase().includes(searchTerm.toLowerCase()) ||
        a.action.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesType = filterType === 'all' || a.type === filterType;
      const matchesUser = selectedUser === 'all' || a.user === selectedUser;

      return matchesSearch && matchesType && matchesUser;
    });
  }, [activities, searchTerm, filterType, selectedUser]);

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'transaction': return <Package size={16} />;
      case 'invoice': return <FileText size={16} />;
      case 'client': return <Users size={16} />;
      case 'product': return <Package size={16} />;
      default: return <Activity size={16} />;
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'transaction': return 'bg-blue-50 text-blue-600 border-blue-100';
      case 'invoice': return 'bg-green-50 text-green-600 border-green-100';
      case 'client': return 'bg-purple-50 text-purple-600 border-purple-100';
      case 'product': return 'bg-yellow-50 text-yellow-600 border-yellow-100';
      default: return 'bg-gray-50 text-gray-600 border-gray-100';
    }
  };

  if (loading) {
    return (
      <div className="py-20 flex flex-col items-center justify-center gap-4">
        <Loader2 className="animate-spin text-yellow-600" size={40} />
        <p className="text-xs font-black text-gray-400 uppercase tracking-widest">Scanning Activity Ledger...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="bg-white p-8 rounded-[2.5rem] border border-gray-200 shadow-sm space-y-6">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input 
              type="text" 
              placeholder="Search activities, users, or details..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-14 pr-6 py-4 bg-gray-50 border border-gray-100 rounded-2xl font-bold text-sm focus:ring-4 focus:ring-yellow-50 outline-none transition-all"
            />
          </div>
          
          <div className="flex gap-4">
            <select 
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="px-6 py-4 bg-gray-50 border border-gray-100 rounded-2xl font-black text-[10px] uppercase tracking-widest outline-none focus:ring-4 focus:ring-yellow-50"
            >
              <option value="all">All Types</option>
              <option value="transaction">Inventory</option>
              <option value="invoice">Invoices</option>
              <option value="client">Clients</option>
              <option value="product">Products</option>
            </select>

            <select 
              value={selectedUser}
              onChange={(e) => setSelectedUser(e.target.value)}
              className="px-6 py-4 bg-gray-50 border border-gray-100 rounded-2xl font-black text-[10px] uppercase tracking-widest outline-none focus:ring-4 focus:ring-yellow-50"
            >
              <option value="all">All Users</option>
              {profiles.map(p => (
                <option key={p.id} value={p.id}>{p.email}</option>
              ))}
            </select>

            <button 
              onClick={() => {
                if (onRefresh) onRefresh();
                fetchActivities();
              }} 
              className="p-4 bg-black text-white rounded-2xl hover:bg-gray-900 transition-all shadow-lg"
            >
              <RefreshCw size={20} />
            </button>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        {filteredActivities.length > 0 ? (
          filteredActivities.map((activity, idx) => (
            <div key={idx} className="bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm flex items-center justify-between hover:shadow-md transition-all group">
              <div className="flex items-center gap-6">
                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center border ${getTypeColor(activity.type)}`}>
                  {getTypeIcon(activity.type)}
                </div>
                <div>
                  <div className="flex items-center gap-3 mb-1">
                    <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">{activity.action}</span>
                    <span className="w-1 h-1 rounded-full bg-gray-300" />
                    <span className="text-[10px] font-black uppercase tracking-widest text-yellow-600 flex items-center gap-1">
                      <User size={10} /> {activity.userName}
                    </span>
                  </div>
                  <h4 className="text-sm font-black text-gray-900 leading-tight">{activity.details}</h4>
                </div>
              </div>
              
              <div className="text-right">
                <div className="flex items-center gap-2 text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">
                  <Clock size={12} />
                  {new Date(activity.timestamp).toLocaleDateString()} {new Date(activity.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
                <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <span className="text-[8px] font-black text-gray-300 uppercase tracking-widest">ID: {activity.id.slice(0, 8)}</span>
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="py-20 text-center opacity-20 border-2 border-dashed border-gray-200 rounded-[3rem]">
            <Activity size={48} className="mx-auto mb-4" />
            <p className="font-black uppercase tracking-widest">No matching activities found</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ActivityLog;

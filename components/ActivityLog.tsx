import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../db';
import { StockTransaction, Invoice, Client, Product, Profile, UserRole } from '../types';
import { 
  Loader2, Activity, Search, Filter, Calendar, 
  User, Package, FileText, Users, ArrowRight,
  Clock, CheckCircle2, AlertCircle, RefreshCw,
  Printer, Download, FileDown, ChevronDown
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import { APP_LOGO_URL, APP_NAME } from '../constants';

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
  userId?: string;
  role?: UserRole;
}

const ActivityLog: React.FC<ActivityLogProps> = ({ invoices: propInvoices, clients: propClients, products: propProducts, onRefresh, userId, role }) => {
  const [loading, setLoading] = useState(!propInvoices);
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [selectedUser, setSelectedUser] = useState<string>('all');
  const [selectedMonth, setSelectedMonth] = useState<string>(new Date().toISOString().slice(0, 7)); // YYYY-MM
  const [selectedDate, setSelectedDate] = useState<string>(''); // YYYY-MM-DD
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

  useEffect(() => {
    fetchActivities();
    
    // Auto-refresh every 60 seconds for live updates in the admin panel
    const interval = setInterval(fetchActivities, 60000);
    return () => clearInterval(interval);
  }, [propInvoices, propClients, propProducts]);

  const fetchActivities = async () => {
    // If we're not an admin, we should only see our own activities
    const filterId = role === 'Admin' ? undefined : userId;
    
    // We'll fetch from DB to ensure we have the most complete and up-to-date activity list
    try {
      const [transactions, invoices, clients, products, userProfiles] = await Promise.all([
        db.getStockTransactions(filterId),
        db.getInvoices(filterId),
        db.getClients(filterId),
        db.getProducts(filterId),
        db.getAllProfiles()
      ]);

      setProfiles(userProfiles);

      const allActivities: ActivityItem[] = [];

      // Process Transactions (Stock movements)
      transactions.forEach(t => {
        allActivities.push({
          id: t.id,
          type: 'transaction',
          action: t.type === 'IN' ? 'Stock Added' : (t.type === 'RETURN' ? 'Stock Returned' : 'Stock Removed'),
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
          details: `Client: ${c.name} (${c.hospitalName || 'No Hospital'})`,
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

      // Sort by timestamp descending (most recent first)
      allActivities.sort((a, b) => {
        const timeA = new Date(a.timestamp).getTime();
        const timeB = new Date(b.timestamp).getTime();
        
        if (isNaN(timeA) && isNaN(timeB)) return 0;
        if (isNaN(timeA)) return 1;
        if (isNaN(timeB)) return -1;
        
        return timeB - timeA;
      });
      
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
      
      const activityDate = a.timestamp?.includes('T') ? a.timestamp.split('T')[0] : (a.timestamp || '');
      const matchesMonth = !selectedMonth || activityDate.startsWith(selectedMonth);
      const matchesDate = !selectedDate || activityDate === selectedDate;

      return matchesSearch && matchesType && matchesUser && matchesMonth && matchesDate;
    });
  }, [activities, searchTerm, filterType, selectedUser, selectedMonth, selectedDate]);

  const exportToPdf = async () => {
    setIsGeneratingPdf(true);
    const element = document.getElementById('activity-report-area');
    if (!element) return;
    
    try {
      // Temporarily show the hidden report area
      element.classList.remove('hidden');
      
      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff'
      });
      
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      const imgWidth = canvas.width;
      const imgHeight = canvas.height;
      const ratio = pdfWidth / imgWidth;
      const canvasHeightInPdf = imgHeight * ratio;
      
      let heightLeft = canvasHeightInPdf;
      let position = 0;
      
      pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, canvasHeightInPdf);
      heightLeft -= pdfHeight;
      
      while (heightLeft > 0) {
        position = heightLeft - canvasHeightInPdf;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, canvasHeightInPdf);
        heightLeft -= pdfHeight;
      }
      
      pdf.save(`Activity_Log_${selectedMonth || 'All'}.pdf`);
      element.classList.add('hidden');
    } catch (err) {
      console.error("PDF Generation Error:", err);
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const handlePrint = () => {
    const printArea = document.getElementById('activity-report-area');
    if (!printArea) {
      alert("Error: Print area not found.");
      return;
    }

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert("Please allow popups to print.");
      return;
    }

    // Temporarily show the hidden report area to get its content correctly
    const originalDisplay = printArea.style.display;
    printArea.style.display = 'block';
    const content = printArea.innerHTML;
    printArea.style.display = originalDisplay;

    const styles = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'))
      .map(style => style.outerHTML)
      .join('\n');

    printWindow.document.write(`
      <html>
        <head>
          <title>Activity Log Report - ${selectedMonth || 'All'}</title>
          ${styles}
          <style>
            body { 
              background: white !important; 
              padding: 40px !important; 
              margin: 0 !important;
              color: black !important;
            }
            #activity-report-area { 
              display: block !important; 
              width: 100% !important; 
              visibility: visible !important;
            }
            .no-print { display: none !important; }
            @page { margin: 10mm; size: auto; }
          </style>
        </head>
        <body>
          <div id="activity-report-area">
            ${content}
          </div>
          <script>
            window.onload = function() {
              setTimeout(() => {
                window.focus();
                window.print();
                window.close();
              }, 500);
            };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

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
        <div className="flex flex-col xl:flex-row gap-6">
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
          
          <div className="flex flex-wrap gap-4">
            <div className="flex items-center gap-2 bg-gray-50 px-4 py-2 rounded-2xl border border-gray-100">
              <Calendar size={16} className="text-gray-400" />
              <input 
                type="month" 
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="bg-transparent border-none font-black text-[10px] uppercase tracking-widest outline-none focus:ring-0"
              />
            </div>

            <div className="flex items-center gap-2 bg-gray-50 px-4 py-2 rounded-2xl border border-gray-100">
              <Calendar size={16} className="text-gray-400" />
              <input 
                type="date" 
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="bg-transparent border-none font-black text-[10px] uppercase tracking-widest outline-none focus:ring-0"
              />
            </div>

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

            <div className="flex gap-2">
              <button 
                onClick={handlePrint}
                className="p-4 bg-white border border-gray-200 text-gray-600 rounded-2xl hover:bg-gray-50 transition-all shadow-sm"
                title="Print Log"
              >
                <Printer size={20} />
              </button>
              <button 
                onClick={exportToPdf}
                disabled={isGeneratingPdf}
                className="p-4 bg-black text-white rounded-2xl hover:bg-gray-900 transition-all shadow-lg disabled:opacity-50"
                title="Export PDF"
              >
                {isGeneratingPdf ? <Loader2 size={20} className="animate-spin" /> : <FileDown size={20} />}
              </button>
              <button 
                onClick={() => {
                  if (onRefresh) onRefresh();
                  fetchActivities();
                }} 
                className="p-4 bg-yellow-500 text-black rounded-2xl hover:bg-yellow-600 transition-all shadow-lg"
                title="Refresh"
              >
                <RefreshCw size={20} />
              </button>
            </div>
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

      {/* Hidden Report Area for PDF/Print */}
      <div id="activity-report-area" className="hidden p-16 bg-white">
        <div className="flex justify-between items-start mb-12">
          <div className="flex items-center gap-4">
            <img src={APP_LOGO_URL} alt={APP_NAME} className="w-16 h-16 object-contain" referrerPolicy="no-referrer" />
            <div>
              <h1 className="text-2xl font-black uppercase tracking-tighter">Activity Audit Log</h1>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{APP_NAME} - Executive Office</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Report Period</p>
            <p className="text-sm font-black text-gray-900 uppercase">{selectedMonth || 'All Time'} {selectedDate && `| ${selectedDate}`}</p>
          </div>
        </div>

        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-gray-900 text-white">
              <th className="p-4 text-[10px] font-black uppercase tracking-widest">Timestamp</th>
              <th className="p-4 text-[10px] font-black uppercase tracking-widest">Action</th>
              <th className="p-4 text-[10px] font-black uppercase tracking-widest">User</th>
              <th className="p-4 text-[10px] font-black uppercase tracking-widest">Details</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filteredActivities.map((a, i) => (
              <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                <td className="p-4 text-[10px] font-bold text-gray-600">
                  {new Date(a.timestamp).toLocaleString()}
                </td>
                <td className="p-4 text-[10px] font-black uppercase text-gray-900">{a.action}</td>
                <td className="p-4 text-[10px] font-bold text-gray-600">{a.userName}</td>
                <td className="p-4 text-xs font-black text-gray-900">{a.details}</td>
              </tr>
            ))}
          </tbody>
        </table>
        
        <div className="mt-12 pt-8 border-t border-gray-100 flex justify-between items-center">
          <p className="text-[8px] font-black text-gray-400 uppercase tracking-[0.3em]">Generated on {new Date().toLocaleString()}</p>
          <p className="text-[8px] font-black text-gray-400 uppercase tracking-[0.3em]">Confidential - Internal Use Only</p>
        </div>
      </div>
    </div>
  );
};

export default ActivityLog;

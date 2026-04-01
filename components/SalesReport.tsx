
import React, { useState, useMemo } from 'react';
import { 
  FileText, Download, Printer, Search, Calendar, 
  ArrowUpRight, ArrowDownRight, Package, User, 
  RefreshCcw, ChevronDown, ChevronUp, Filter
} from 'lucide-react';
import { Product, Invoice, StockTransaction, UserRole } from '../types';
import { APP_LOGO_URL, APP_NAME } from '../constants';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import * as XLSX from 'xlsx';

interface SalesReportProps {
  products: Product[];
  invoices: Invoice[];
  transactions: StockTransaction[];
  role: UserRole;
}

const SalesReport: React.FC<SalesReportProps> = ({ products, invoices, transactions, role }) => {
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7)); // YYYY-MM
  const [searchProduct, setSearchProduct] = useState('');
  const [searchSize, setSearchSize] = useState('All');
  const [searchMrp, setSearchMrp] = useState('');
  const [searchTp, setSearchTp] = useState('');
  const [searchSalesPerson, setSearchSalesPerson] = useState('');
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

  const sizes = useMemo(() => ['All', ...new Set(products.map(p => p.size).filter(Boolean))], [products]);

  const reportData = useMemo(() => {
    const monthStr = selectedMonth;
    
    const monthlyInvoices = invoices.filter(inv => inv.date.startsWith(monthStr) && inv.status !== 'Returned');
    const monthlyTransactions = transactions.filter(t => t.date.startsWith(monthStr));

    return products.map(product => {
      const productInvoices = monthlyInvoices.filter(inv => inv.items.some(i => i.productId === product.id));
      const salesCount = productInvoices.reduce((sum, inv) => {
        const item = inv.items.find(i => i.productId === product.id);
        return sum + (item?.quantity || 0);
      }, 0);

      const salesMap = new Map<string, number>();
      productInvoices.forEach(inv => {
        const item = inv.items.find(i => i.productId === product.id);
        if (!item) return;
        
        const creator = inv.createdByName || 'Admin';
        const displayName = inv.salesPerson ? `${inv.salesPerson} (${creator})` : creator;
        salesMap.set(displayName, (salesMap.get(displayName) || 0) + item.quantity);
      });

      const salesPersons = Array.from(salesMap.entries())
        .map(([name, qty]) => `${name} (${qty})`)
        .join(', ') || '-';

      const transfersCount = monthlyTransactions
        .filter(t => t.productId === product.id && t.type === 'OUT')
        .reduce((sum, t) => sum + t.quantity, 0);

      const returnsCount = monthlyTransactions
        .filter(t => t.productId === product.id && t.type === 'RETURN')
        .reduce((sum, t) => sum + t.quantity, 0);

      return {
        id: product.id,
        name: product.name,
        size: product.size || '-',
        category: product.category,
        mrp: product.mrp,
        tp: product.tp,
        sales: salesCount,
        salesPersons: salesPersons || '-',
        transfers: transfersCount,
        returns: returnsCount,
        totalStocks: product.stock
      };
    }).filter(item => {
      const matchesProduct = item.name.toLowerCase().includes(searchProduct.toLowerCase());
      const matchesSize = searchSize === 'All' || item.size === searchSize;
      const matchesMrp = String(item.mrp).includes(searchMrp);
      const matchesTp = String(item.tp).includes(searchTp);
      const matchesSalesPerson = item.salesPersons.toLowerCase().includes(searchSalesPerson.toLowerCase());
      
      return matchesProduct && matchesSize && matchesMrp && matchesTp && matchesSalesPerson;
    });
  }, [products, invoices, transactions, selectedMonth, searchProduct, searchSize, searchMrp, searchTp, searchSalesPerson]);

  const exportToPdf = async () => {
    setIsGeneratingPdf(true);
    const element = document.getElementById('sales-report-table');
    if (!element) return;
    try {
      const canvas = await html2canvas(element, { scale: 2 });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const imgWidth = canvas.width;
      const imgHeight = canvas.height;
      const ratio = pdfWidth / imgWidth;
      const canvasHeightInPdf = imgHeight * ratio;
      
      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, canvasHeightInPdf);
      pdf.save(`Sales_Stocks_Report_${selectedMonth}.pdf`);
    } catch (err) {
      console.error('PDF Error:', err);
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const exportToExcel = () => {
    const data = reportData.map(item => ({
      'PRODUCT': item.name,
      'SIZE': item.size,
      'MRP': item.mrp,
      'TP': item.tp,
      'SALES PERSON NAME': item.salesPersons,
      'SALES (UNIT)': item.sales,
      'TRANSFER (UNIT)': item.transfers,
      'TOTAL STOCKS (UNIT)': item.totalStocks,
      'RETURN (UNIT)': item.returns
    }));

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Sales & Stocks");
    XLSX.writeFile(workbook, `Sales_Stocks_Report_${selectedMonth}.xlsx`);
  };

  const monthName = new Date(selectedMonth + '-01').toLocaleDateString('en-US', { month: 'short', year: '2-digit' }).toUpperCase();

  return (
    <div className="space-y-6 animate-in fade-in duration-500 bg-black p-8 rounded-[3rem]">
      {/* Header Controls */}
      <div className="bg-gray-900 p-6 rounded-[2.5rem] border border-gray-800 shadow-2xl flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-4 w-full md:w-auto">
          <div className="p-3 bg-yellow-900/20 text-yellow-500 rounded-xl">
            <Calendar size={20} />
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Report Month</span>
            <input 
              type="month" 
              value={selectedMonth} 
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="font-black text-white border-none bg-transparent focus:ring-0 text-xl outline-none cursor-pointer"
            />
          </div>
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto">
          <button 
            onClick={() => window.print()}
            className="flex-1 md:flex-none flex items-center justify-center gap-2 px-6 py-3 bg-gray-800 border border-gray-700 rounded-xl font-black text-[10px] uppercase text-white hover:bg-gray-700 transition-all"
          >
            <Printer size={16} /> Print
          </button>
          <button 
            onClick={exportToExcel}
            className="flex-1 md:flex-none flex items-center justify-center gap-2 px-6 py-3 bg-emerald-600 text-white rounded-xl font-black text-[10px] uppercase hover:bg-emerald-700 shadow-lg transition-all"
          >
            <FileText size={16} /> Excel
          </button>
          <button 
            onClick={exportToPdf}
            disabled={isGeneratingPdf}
            className="flex-1 md:flex-none flex items-center justify-center gap-2 px-6 py-3 bg-yellow-600 text-black rounded-xl font-black text-[10px] uppercase hover:bg-yellow-500 shadow-lg transition-all disabled:opacity-50"
          >
            {isGeneratingPdf ? <RefreshCcw size={16} className="animate-spin" /> : <Download size={16} />} PDF
          </button>
        </div>
      </div>

      {/* Report Table */}
      <div className="bg-black rounded-[2.5rem] border border-gray-800 shadow-2xl overflow-hidden" id="sales-report-table">
        <div className="bg-black p-8 flex items-center justify-between border-b border-gray-800">
          <h2 className="text-3xl font-black text-white uppercase tracking-tighter">
            SALES & STOCKS {monthName}
          </h2>
          <div className="flex items-center gap-4">
            <img src={APP_LOGO_URL} alt="Logo" className="h-12 w-12 object-contain invert" />
            <div className="text-white text-right">
              <p className="text-xs font-black uppercase leading-none tracking-tighter">OVERPLAST</p>
              <p className="text-[10px] font-bold opacity-60 leading-none uppercase">Beauty Management</p>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-900 border-b border-gray-800">
                <th rowSpan={2} className="p-4 text-[10px] font-black text-yellow-500 uppercase tracking-widest border-r border-gray-800 min-w-[200px]">PRODUCT</th>
                <th rowSpan={2} className="p-4 text-[10px] font-black text-yellow-500 uppercase tracking-widest border-r border-gray-800 text-center">SIZE</th>
                <th rowSpan={2} className="p-4 text-[10px] font-black text-yellow-500 uppercase tracking-widest border-r border-gray-800 text-right">MRP</th>
                <th rowSpan={2} className="p-4 text-[10px] font-black text-yellow-500 uppercase tracking-widest border-r border-gray-800 text-right">TP</th>
                <th className="p-4 text-[10px] font-black text-yellow-500 uppercase tracking-widest border-r border-gray-800 text-center">SALES PERSON NAME</th>
                <th className="p-4 text-[10px] font-black text-yellow-500 uppercase tracking-widest border-r border-gray-800 text-center">TRANSFER</th>
                <th className="p-4 text-[10px] font-black text-yellow-500 uppercase tracking-widest border-r border-gray-800 text-center">TOTAL STOCKS</th>
                <th className="p-4 text-[10px] font-black text-yellow-500 uppercase tracking-widest text-center">RETURN</th>
              </tr>
              <tr className="bg-gray-900 border-b border-gray-800">
                <th className="p-2 text-[9px] font-black text-gray-500 uppercase tracking-widest border-r border-gray-800 text-center">1</th>
                <th className="p-2 text-[9px] font-black text-gray-500 uppercase tracking-widest border-r border-gray-800 text-center">UNIT</th>
                <th className="p-2 text-[9px] font-black text-gray-500 uppercase tracking-widest border-r border-gray-800 text-center">UNIT</th>
                <th className="p-2 text-[9px] font-black text-gray-500 uppercase tracking-widest text-center">UNIT</th>
              </tr>
              <tr className="bg-black border-b border-gray-800 print:hidden">
                <th className="p-2 border-r border-gray-800">
                  <input 
                    type="text" 
                    placeholder="Filter Product..."
                    value={searchProduct}
                    onChange={(e) => setSearchProduct(e.target.value)}
                    className="w-full px-2 py-1 text-[10px] font-bold bg-gray-900 text-white border-none rounded focus:ring-1 focus:ring-yellow-500"
                  />
                </th>
                <th className="p-2 border-r border-gray-800">
                  <select 
                    value={searchSize}
                    onChange={(e) => setSearchSize(e.target.value)}
                    className="w-full px-2 py-1 text-[10px] font-bold bg-gray-900 text-white border-none rounded focus:ring-1 focus:ring-yellow-500 appearance-none"
                  >
                    {sizes.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </th>
                <th className="p-2 border-r border-gray-800">
                  <input 
                    type="text" 
                    placeholder="Filter MRP..."
                    value={searchMrp}
                    onChange={(e) => setSearchMrp(e.target.value)}
                    className="w-full px-2 py-1 text-[10px] font-bold bg-gray-900 text-white border-none rounded focus:ring-1 focus:ring-yellow-500 text-right"
                  />
                </th>
                <th className="p-2 border-r border-gray-800">
                  <input 
                    type="text" 
                    placeholder="Filter TP..."
                    value={searchTp}
                    onChange={(e) => setSearchTp(e.target.value)}
                    className="w-full px-2 py-1 text-[10px] font-bold bg-gray-900 text-white border-none rounded focus:ring-1 focus:ring-yellow-500 text-right"
                  />
                </th>
                <th className="p-2 border-r border-gray-800">
                  <input 
                    type="text" 
                    placeholder="Filter Sales Person..."
                    value={searchSalesPerson}
                    onChange={(e) => setSearchSalesPerson(e.target.value)}
                    className="w-full px-2 py-1 text-[10px] font-bold bg-gray-900 text-white border-none rounded focus:ring-1 focus:ring-yellow-500 text-center"
                  />
                </th>
                <th className="p-2 border-r border-gray-800"></th>
                <th className="p-2 border-r border-gray-800"></th>
                <th className="p-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {reportData.map((item, idx) => (
                <tr key={item.id} className={`${idx % 2 === 0 ? 'bg-black' : 'bg-gray-900/30'} hover:bg-gray-900 transition-colors`}>
                  <td className="p-4 text-xs font-black text-white border-r border-gray-800">
                    {item.name}
                    <p className="text-[8px] text-gray-500 uppercase tracking-tighter mt-0.5">{item.category}</p>
                  </td>
                  <td className="p-4 text-xs font-bold text-gray-400 text-center border-r border-gray-800">
                    <span className="px-3 py-1 bg-gray-800 text-yellow-500 rounded-full text-[10px] font-black uppercase tracking-widest">
                      {item.size}
                    </span>
                  </td>
                  <td className="p-4 text-xs font-black text-white text-right border-r border-gray-800">{item.mrp.toLocaleString()}</td>
                  <td className="p-4 text-xs font-black text-yellow-500 text-right border-r border-gray-800">{item.tp.toLocaleString()}</td>
                  <td className="p-4 text-center border-r border-gray-800">
                    <div className="flex flex-col items-center">
                      <span className="text-[10px] font-black text-white uppercase tracking-tighter">{item.salesPersons}</span>
                      <span className="text-[9px] font-bold text-emerald-500">({item.sales} sold)</span>
                    </div>
                  </td>
                  <td className="p-4 text-xs font-black text-blue-400 text-center border-r border-gray-800">{item.transfers}</td>
                  <td className="p-4 text-xs font-black text-white text-center border-r border-gray-800">{item.totalStocks}</td>
                  <td className="p-4 text-xs font-black text-red-500 text-center">{item.returns}</td>
                </tr>
              ))}
              {reportData.length === 0 && (
                <tr>
                  <td colSpan={8} className="p-20 text-center text-xs font-black text-gray-600 uppercase tracking-widest">
                    No matching products found for this period
                  </td>
                </tr>
              )}
            </tbody>
            <tfoot className="bg-gray-900 text-white border-t-2 border-yellow-500">
              <tr>
                <td colSpan={4} className="p-6 text-[10px] font-black uppercase tracking-widest border-r border-gray-800">Monthly Aggregates</td>
                <td className="p-6 text-center border-r border-gray-800">
                  <div className="flex flex-col items-center">
                    <span className="text-xl font-black text-emerald-500">{reportData.reduce((sum, i) => sum + i.sales, 0)}</span>
                    <span className="text-[8px] font-bold text-gray-500 uppercase tracking-widest">Total Sales</span>
                  </div>
                </td>
                <td className="p-6 text-center border-r border-gray-800">
                  <div className="flex flex-col items-center">
                    <span className="text-xl font-black text-blue-400">{reportData.reduce((sum, i) => sum + i.transfers, 0)}</span>
                    <span className="text-[8px] font-bold text-gray-500 uppercase tracking-widest">Total Trans</span>
                  </div>
                </td>
                <td className="p-6 text-center border-r border-gray-800">
                  <div className="flex flex-col items-center">
                    <span className="text-xl font-black text-white">{reportData.reduce((sum, i) => sum + i.totalStocks, 0)}</span>
                    <span className="text-[8px] font-bold text-gray-500 uppercase tracking-widest">Total Stock</span>
                  </div>
                </td>
                <td className="p-6 text-center">
                  <div className="flex flex-col items-center">
                    <span className="text-xl font-black text-red-500">{reportData.reduce((sum, i) => sum + i.returns, 0)}</span>
                    <span className="text-[8px] font-bold text-gray-500 uppercase tracking-widest">Total Return</span>
                  </div>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
};

export default SalesReport;


import React, { useState, useMemo, useRef, useEffect } from 'react';
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
  const [searchCategory, setSearchCategory] = useState('All');
  const [searchSize, setSearchSize] = useState('All');
  const [searchMrp, setSearchMrp] = useState('');
  const [searchTp, setSearchTp] = useState('');
  const [searchOpeningStock, setSearchOpeningStock] = useState('');
  const [searchUnitSales, setSearchUnitSales] = useState('');
  const [searchValueWiseSales, setSearchValueWiseSales] = useState('');
  const [searchClosingStock, setSearchClosingStock] = useState('');
  const [searchRemainingStockUnit, setSearchRemainingStockUnit] = useState('');
  const [searchRemainingStockValue, setSearchRemainingStockValue] = useState('');
  const [searchCashSales, setSearchCashSales] = useState('');
  const [searchCreditSales, setSearchCreditSales] = useState('');
  const [searchSalesPerson, setSearchSalesPerson] = useState('');
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

  const topScrollRef = useRef<HTMLDivElement>(null);
  const tableScrollRef = useRef<HTMLDivElement>(null);

  const handleTopScroll = () => {
    if (topScrollRef.current && tableScrollRef.current) {
      tableScrollRef.current.scrollLeft = topScrollRef.current.scrollLeft;
    }
  };

  const handleTableScroll = () => {
    if (topScrollRef.current && tableScrollRef.current) {
      topScrollRef.current.scrollLeft = tableScrollRef.current.scrollLeft;
    }
  };

  const sizes = useMemo(() => ['All', ...new Set(products.map(p => p.size).filter(Boolean))], [products]);
  const categories = useMemo(() => ['All', ...new Set(products.map(p => p.category).filter(Boolean))], [products]);

  const reportData = useMemo(() => {
    const monthStr = selectedMonth;
    const startOfMonth = new Date(monthStr + '-01');
    
    const monthlyInvoices = invoices.filter(inv => inv.date.startsWith(monthStr) && inv.status !== 'Returned');
    const monthlyTransactions = transactions.filter(t => t.date.startsWith(monthStr));

    return products.map(product => {
      // Calculate Opening Stock
      // We work backwards from current stock
      const transactionsAfterStart = transactions.filter(t => t.productId === product.id && t.date >= monthStr + '-01');
      
      const inAfterStart = transactionsAfterStart.filter(t => t.type === 'IN').reduce((sum, t) => sum + t.quantity, 0);
      const outAfterStart = transactionsAfterStart.filter(t => t.type === 'OUT').reduce((sum, t) => sum + t.quantity, 0);
      const returnAfterStart = transactionsAfterStart.filter(t => t.type === 'RETURN').reduce((sum, t) => sum + t.quantity, 0);
      
      const openingStock = product.stock - inAfterStart + outAfterStart + returnAfterStart;

      // Monthly activity
      const inDuringMonth = monthlyTransactions.filter(t => t.productId === product.id && t.type === 'IN').reduce((sum, t) => sum + t.quantity, 0);
      const outDuringMonth = monthlyTransactions.filter(t => t.productId === product.id && t.type === 'OUT').reduce((sum, t) => sum + t.quantity, 0);
      const returnDuringMonth = monthlyTransactions.filter(t => t.productId === product.id && t.type === 'RETURN').reduce((sum, t) => sum + t.quantity, 0);

      const unitSales = outDuringMonth;
      const cashSales = monthlyInvoices
        .filter(inv => inv.paymentMethod === 'Cash')
        .reduce((sum, inv) => {
          const item = inv.items.find(i => i.productId === product.id);
          return sum + (item ? item.quantity : 0);
        }, 0);
      const creditSales = monthlyInvoices
        .filter(inv => inv.paymentMethod === 'Credit')
        .reduce((sum, inv) => {
          const item = inv.items.find(i => i.productId === product.id);
          return sum + (item ? item.quantity : 0);
        }, 0);
      const valueWiseSales = unitSales * product.tp;
      const closingStock = openingStock + inDuringMonth - outDuringMonth - returnDuringMonth;

      const productInvoices = monthlyInvoices.filter(inv => inv.items.some(i => i.productId === product.id));
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

      return {
        id: product.id,
        name: product.name,
        size: product.size || '-',
        category: product.category,
        mrp: product.mrp,
        tp: product.tp,
        openingStock,
        unitSales,
        cashSales,
        creditSales,
        valueWiseSales,
        closingStock,
        returns: returnDuringMonth,
        remainingStockUnit: product.stock,
        remainingStockValue: product.stock * product.tp,
        salesPersons: salesPersons || '-'
      };
    }).filter(item => {
      const matchesProduct = item.name.toLowerCase().includes(searchProduct.toLowerCase());
      const matchesCategory = searchCategory === 'All' || item.category === searchCategory;
      const matchesSize = searchSize === 'All' || item.size === searchSize;
      const matchesMrp = String(item.mrp).includes(searchMrp);
      const matchesTp = String(item.tp).includes(searchTp);
      const matchesOpeningStock = String(item.openingStock).includes(searchOpeningStock);
      const matchesUnitSales = String(item.unitSales).includes(searchUnitSales);
      const matchesValueWiseSales = String(item.valueWiseSales).includes(searchValueWiseSales);
      const matchesClosingStock = String(item.closingStock).includes(searchClosingStock);
      const matchesRemainingStockUnit = String(item.remainingStockUnit).includes(searchRemainingStockUnit);
      const matchesRemainingStockValue = String(item.remainingStockValue).includes(searchRemainingStockValue);
      const matchesCashSales = String(item.cashSales).includes(searchCashSales);
      const matchesCreditSales = String(item.creditSales).includes(searchCreditSales);
      const matchesSalesPerson = item.salesPersons.toLowerCase().includes(searchSalesPerson.toLowerCase());
      
      return matchesProduct && matchesCategory && matchesSize && matchesMrp && matchesTp && 
             matchesOpeningStock && matchesUnitSales && matchesValueWiseSales && 
             matchesClosingStock && matchesRemainingStockUnit && matchesRemainingStockValue && 
             matchesCashSales && matchesCreditSales &&
             matchesSalesPerson;
    });
  }, [products, invoices, transactions, selectedMonth, searchProduct, searchCategory, searchSize, searchMrp, searchTp, 
      searchOpeningStock, searchUnitSales, searchValueWiseSales, searchClosingStock, 
      searchRemainingStockUnit, searchRemainingStockValue, searchCashSales, searchCreditSales, searchSalesPerson]);

  const exportToPdf = async () => {
    setIsGeneratingPdf(true);
    const element = document.getElementById('sales-report-table');
    if (!element) return;
    try {
      const canvas = await html2canvas(element, { scale: 2 });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('l', 'mm', 'a4'); // Landscape for more columns
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
      'CATEGORY': item.category,
      'SIZE': item.size,
      'MRP': item.mrp,
      'TP': item.tp,
      'OPENING STOCK': item.openingStock,
      'UNIT SALES': item.unitSales,
      'CASH SALES': item.cashSales,
      'CREDIT SALES': item.creditSales,
      'VALUE WISE SALES': item.valueWiseSales,
      'CLOSING STOCK': item.closingStock,
      'REMAINING STOCK UNIT': item.remainingStockUnit,
      'REMAINING STOCK VALUE': item.remainingStockValue,
      'SALES PERSON NAME': item.salesPersons
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

        {/* Top Scrollbar */}
        <div 
          ref={topScrollRef}
          onScroll={handleTopScroll}
          className="overflow-x-auto scrollbar-thin scrollbar-thumb-yellow-600 scrollbar-track-gray-900 mx-4 mt-4 print:hidden"
        >
          <div style={{ width: '1600px', height: '1px' }}></div>
        </div>

        <div 
          ref={tableScrollRef}
          onScroll={handleTableScroll}
          className="overflow-x-auto scrollbar-thin scrollbar-thumb-yellow-600 scrollbar-track-gray-900"
        >
          <table className="w-full min-w-[1600px] text-left border-collapse">
            <thead>
              <tr className="bg-gray-900 border-b border-gray-800">
                <th rowSpan={2} className="p-4 text-[10px] font-black text-yellow-500 uppercase tracking-widest border-r border-gray-800 min-w-[200px]">PRODUCT</th>
                <th rowSpan={2} className="p-4 text-[10px] font-black text-yellow-500 uppercase tracking-widest border-r border-gray-800 text-center">CATEGORY</th>
                <th rowSpan={2} className="p-4 text-[10px] font-black text-yellow-500 uppercase tracking-widest border-r border-gray-800 text-center">SIZE</th>
                <th rowSpan={2} className="p-4 text-[10px] font-black text-yellow-500 uppercase tracking-widest border-r border-gray-800 text-right">MRP</th>
                <th rowSpan={2} className="p-4 text-[10px] font-black text-yellow-500 uppercase tracking-widest border-r border-gray-800 text-right">TP</th>
                <th rowSpan={2} className="p-4 text-[10px] font-black text-yellow-500 uppercase tracking-widest border-r border-gray-800 text-center">SALES PERSON</th>
                <th className="p-4 text-[10px] font-black text-yellow-500 uppercase tracking-widest border-r border-gray-800 text-center">OPENING STOCK</th>
                <th colSpan={4} className="p-4 text-[10px] font-black text-yellow-500 uppercase tracking-widest border-r border-gray-800 text-center">SALES</th>
                <th className="p-4 text-[10px] font-black text-yellow-500 uppercase tracking-widest border-r border-gray-800 text-center">CLOSING STOCK</th>
                <th colSpan={2} className="p-4 text-[10px] font-black text-yellow-500 uppercase tracking-widest text-center">REMAINING STOCK</th>
              </tr>
              <tr className="bg-gray-900 border-b border-gray-800">
                <th className="p-2 text-[9px] font-black text-gray-500 uppercase tracking-widest border-r border-gray-800 text-center">UNIT</th>
                <th className="p-2 text-[9px] font-black text-gray-500 uppercase tracking-widest border-r border-gray-800 text-center">TOTAL</th>
                <th className="p-2 text-[9px] font-black text-gray-500 uppercase tracking-widest border-r border-gray-800 text-center">CASH</th>
                <th className="p-2 text-[9px] font-black text-gray-500 uppercase tracking-widest border-r border-gray-800 text-center">CREDIT</th>
                <th className="p-2 text-[9px] font-black text-gray-500 uppercase tracking-widest border-r border-gray-800 text-center">VALUE</th>
                <th className="p-2 text-[9px] font-black text-gray-500 uppercase tracking-widest border-r border-gray-800 text-center">UNIT</th>
                <th className="p-2 text-[9px] font-black text-gray-500 uppercase tracking-widest border-r border-gray-800 text-center">UNIT</th>
                <th className="p-2 text-[9px] font-black text-gray-500 uppercase tracking-widest text-center">VALUE</th>
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
                    value={searchCategory}
                    onChange={(e) => setSearchCategory(e.target.value)}
                    className="w-full px-2 py-1 text-[10px] font-bold bg-gray-900 text-white border-none rounded focus:ring-1 focus:ring-yellow-500 appearance-none"
                  >
                    {categories.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
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
                <th className="p-2 border-r border-gray-800">
                  <input 
                    type="text" 
                    placeholder="Filter..."
                    value={searchOpeningStock}
                    onChange={(e) => setSearchOpeningStock(e.target.value)}
                    className="w-full px-2 py-1 text-[10px] font-bold bg-gray-900 text-white border-none rounded focus:ring-1 focus:ring-yellow-500 text-center"
                  />
                </th>
                <th className="p-2 border-r border-gray-800">
                  <input 
                    type="text" 
                    placeholder="Filter..."
                    value={searchUnitSales}
                    onChange={(e) => setSearchUnitSales(e.target.value)}
                    className="w-full px-2 py-1 text-[10px] font-bold bg-gray-900 text-white border-none rounded focus:ring-1 focus:ring-yellow-500 text-center"
                  />
                </th>
                <th className="p-2 border-r border-gray-800">
                  <input 
                    type="text" 
                    placeholder="Filter..."
                    value={searchCashSales}
                    onChange={(e) => setSearchCashSales(e.target.value)}
                    className="w-full px-2 py-1 text-[10px] font-bold bg-gray-900 text-white border-none rounded focus:ring-1 focus:ring-yellow-500 text-center"
                  />
                </th>
                <th className="p-2 border-r border-gray-800">
                  <input 
                    type="text" 
                    placeholder="Filter..."
                    value={searchCreditSales}
                    onChange={(e) => setSearchCreditSales(e.target.value)}
                    className="w-full px-2 py-1 text-[10px] font-bold bg-gray-900 text-white border-none rounded focus:ring-1 focus:ring-yellow-500 text-center"
                  />
                </th>
                <th className="p-2 border-r border-gray-800">
                  <input 
                    type="text" 
                    placeholder="Filter..."
                    value={searchValueWiseSales}
                    onChange={(e) => setSearchValueWiseSales(e.target.value)}
                    className="w-full px-2 py-1 text-[10px] font-bold bg-gray-900 text-white border-none rounded focus:ring-1 focus:ring-yellow-500 text-right"
                  />
                </th>
                <th className="p-2 border-r border-gray-800">
                  <input 
                    type="text" 
                    placeholder="Filter..."
                    value={searchClosingStock}
                    onChange={(e) => setSearchClosingStock(e.target.value)}
                    className="w-full px-2 py-1 text-[10px] font-bold bg-gray-900 text-white border-none rounded focus:ring-1 focus:ring-yellow-500 text-center"
                  />
                </th>
                <th className="p-2 border-r border-gray-800">
                  <input 
                    type="text" 
                    placeholder="Filter..."
                    value={searchRemainingStockUnit}
                    onChange={(e) => setSearchRemainingStockUnit(e.target.value)}
                    className="w-full px-2 py-1 text-[10px] font-bold bg-gray-900 text-white border-none rounded focus:ring-1 focus:ring-yellow-500 text-center"
                  />
                </th>
                <th className="p-2">
                  <input 
                    type="text" 
                    placeholder="Filter..."
                    value={searchRemainingStockValue}
                    onChange={(e) => setSearchRemainingStockValue(e.target.value)}
                    className="w-full px-2 py-1 text-[10px] font-bold bg-gray-900 text-white border-none rounded focus:ring-1 focus:ring-yellow-500 text-right"
                  />
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {reportData.map((item, idx) => (
                <tr key={item.id} className={`${idx % 2 === 0 ? 'bg-black' : 'bg-gray-900/30'} hover:bg-gray-900 transition-colors`}>
                  <td className="p-4 text-xs font-black text-white border-r border-gray-800">
                    {item.name}
                  </td>
                  <td className="p-4 text-[10px] font-bold text-gray-500 text-center border-r border-gray-800 uppercase tracking-tighter">
                    {item.category}
                  </td>
                  <td className="p-4 text-xs font-bold text-gray-400 text-center border-r border-gray-800">
                    <span className="px-3 py-1 bg-gray-800 text-yellow-500 rounded-full text-[10px] font-black uppercase tracking-widest">
                      {item.size}
                    </span>
                  </td>
                  <td className="p-4 text-xs font-black text-white text-right border-r border-gray-800">{item.mrp.toLocaleString()}</td>
                  <td className="p-4 text-xs font-black text-yellow-500 text-right border-r border-gray-800">{item.tp.toLocaleString()}</td>
                  <td className="p-4 text-center border-r border-gray-800">
                    <span className="text-[10px] font-black text-white uppercase tracking-tighter">{item.salesPersons}</span>
                  </td>
                  <td className="p-4 text-xs font-black text-blue-400 text-center border-r border-gray-800">{item.openingStock}</td>
                  <td className="p-4 text-center border-r border-gray-800">
                    <div className="flex flex-col items-center">
                      <span className="text-xs font-black text-emerald-500">{item.unitSales}</span>
                    </div>
                  </td>
                  <td className="p-4 text-center border-r border-gray-800">
                    <span className="text-xs font-black text-emerald-400">{item.cashSales}</span>
                  </td>
                  <td className="p-4 text-center border-r border-gray-800">
                    <span className="text-xs font-black text-orange-400">{item.creditSales}</span>
                  </td>
                  <td className="p-4 text-xs font-black text-emerald-600 text-right border-r border-gray-800">{item.valueWiseSales.toLocaleString()}</td>
                  <td className="p-4 text-xs font-black text-white text-center border-r border-gray-800">{item.closingStock}</td>
                  <td className="p-4 text-xs font-black text-white text-center border-r border-gray-800">{item.remainingStockUnit}</td>
                  <td className="p-4 text-xs font-black text-yellow-500 text-right">{item.remainingStockValue.toLocaleString()}</td>
                </tr>
              ))}
              {reportData.length === 0 && (
                <tr>
                  <td colSpan={14} className="p-20 text-center text-xs font-black text-gray-600 uppercase tracking-widest">
                    No matching products found for this period
                  </td>
                </tr>
              )}
            </tbody>
            <tfoot className="bg-gray-900 text-white border-t-2 border-yellow-500">
              <tr>
                <td colSpan={6} className="p-6 text-[10px] font-black uppercase tracking-widest border-r border-gray-800">Monthly Totals</td>
                <td className="p-6 text-center border-r border-gray-800 font-black text-blue-400">
                  {reportData.reduce((sum, i) => sum + i.openingStock, 0)}
                </td>
                <td className="p-6 text-center border-r border-gray-800 font-black text-emerald-500">
                  {reportData.reduce((sum, i) => sum + i.unitSales, 0)}
                </td>
                <td className="p-6 text-center border-r border-gray-800 font-black text-emerald-400">
                  {reportData.reduce((sum, i) => sum + i.cashSales, 0)}
                </td>
                <td className="p-6 text-center border-r border-gray-800 font-black text-orange-400">
                  {reportData.reduce((sum, i) => sum + i.creditSales, 0)}
                </td>
                <td className="p-6 text-right border-r border-gray-800 font-black text-emerald-600">
                  {reportData.reduce((sum, i) => sum + i.valueWiseSales, 0).toLocaleString()}
                </td>
                <td className="p-6 text-center border-r border-gray-800 font-black text-white">
                  {reportData.reduce((sum, i) => sum + i.closingStock, 0)}
                </td>
                <td className="p-6 text-center border-r border-gray-800 font-black text-white">
                  {reportData.reduce((sum, i) => sum + i.remainingStockUnit, 0)}
                </td>
                <td className="p-6 text-right font-black text-yellow-500">
                  {reportData.reduce((sum, i) => sum + i.remainingStockValue, 0).toLocaleString()}
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

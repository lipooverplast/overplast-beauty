
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { 
  FileText, Printer, Search, Calendar, 
  ArrowUpRight, ArrowDownRight, Package, User, 
  RefreshCcw, ChevronDown, ChevronUp, Filter, AlertCircle, Download, Loader2
} from 'lucide-react';
import { Product, Invoice, StockTransaction, UserRole } from '../types';
import { APP_LOGO_URL, APP_NAME } from '../constants';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';

interface SalesReportProps {
  products: Product[];
  invoices: Invoice[];
  transactions: StockTransaction[];
  role: UserRole;
  userId: string;
}

const SalesReport: React.FC<SalesReportProps> = ({ products, invoices, transactions, role, userId }) => {
  const [reportMode, setReportMode] = useState<'monthly' | 'cumulative'>('monthly');
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7)); // YYYY-MM
  const [startDate, setStartDate] = useState(new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState(new Date().toISOString().slice(0, 10));
  const [searchSrn, setSearchSrn] = useState('');
  const [searchBatchNo, setSearchBatchNo] = useState('');

  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];
  
  const years = Array.from({ length: 10 }, (_, i) => 2024 + i);

  const [currentYear, currentMonth] = selectedMonth.split('-').map(Number);

  const handleMonthChange = (m: number) => {
    const monthStr = m.toString().padStart(2, '0');
    setSelectedMonth(`${currentYear}-${monthStr}`);
  };

  const handleYearChange = (y: number) => {
    const monthStr = currentMonth.toString().padStart(2, '0');
    setSelectedMonth(`${y}-${monthStr}`);
  };

  const handlePrevMonth = () => {
    let m = currentMonth - 1;
    let y = currentYear;
    if (m < 1) {
      m = 12;
      y -= 1;
    }
    setSelectedMonth(`${y}-${m.toString().padStart(2, '0')}`);
  };

  const handleNextMonth = () => {
    let m = currentMonth + 1;
    let y = currentYear;
    if (m > 12) {
      m = 1;
      y += 1;
    }
    setSelectedMonth(`${y}-${m.toString().padStart(2, '0')}`);
  };
  const [searchProduct, setSearchProduct] = useState('');
  const [searchCategory, setSearchCategory] = useState('All');
  const [searchSize, setSearchSize] = useState('All');
  const [searchMrp, setSearchMrp] = useState('');
  const [searchTp, setSearchTp] = useState('');
  const [searchSalesPerson, setSearchSalesPerson] = useState('');
  const [searchOpeningStockUnit, setSearchOpeningStockUnit] = useState('');
  const [searchOpeningStockValue, setSearchOpeningStockValue] = useState('');
  const [searchReceivedUnit, setSearchReceivedUnit] = useState('');
  const [searchReceivedValue, setSearchReceivedValue] = useState('');
  const [searchTotalStockUnit, setSearchTotalStockUnit] = useState('');
  const [searchReturnUnit, setSearchReturnUnit] = useState('');
  const [searchReturnValue, setSearchReturnValue] = useState('');
  const [searchDiscount, setSearchDiscount] = useState('');
  const [searchCashSalesUnit, setSearchCashSalesUnit] = useState('');
  const [searchCashSalesValue, setSearchCashSalesValue] = useState('');
  const [searchCreditSalesUnit, setSearchCreditSalesUnit] = useState('');
  const [searchCreditSalesValue, setSearchCreditSalesValue] = useState('');
  const [searchTotalSalesUnit, setSearchTotalSalesUnit] = useState('');
  const [searchTotalSalesValue, setSearchTotalSalesValue] = useState('');
  const [searchClosingStockUnit, setSearchClosingStockUnit] = useState('');
  const [searchClosingStockValue, setSearchClosingStockValue] = useState('');
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);

  const sizes = useMemo(() => ['All', ...new Set(products.map(p => p.size).filter(Boolean))], [products]);
  const categories = useMemo(() => ['All', ...new Set(products.map(p => p.category).filter(Boolean))], [products]);

  const activeMonths = useMemo(() => {
    const monthsSet = new Set<string>();
    invoices.forEach(inv => monthsSet.add(inv.date.slice(0, 7)));
    transactions.forEach(tx => monthsSet.add(tx.date.slice(0, 7)));
    return Array.from(monthsSet).sort((a, b) => b.localeCompare(a));
  }, [invoices, transactions]);

  const reportData = useMemo(() => {
    const isStaff = role?.toLowerCase() === 'staff';
    
    const filteredInvoices = isStaff 
      ? invoices.filter(inv => inv.createdBy === userId)
      : invoices;
      
    const filteredTransactions = isStaff
      ? transactions.filter(t => t.createdBy === userId)
      : transactions;

    let monthlyInvoices: Invoice[] = [];
    let monthlyTransactions: StockTransaction[] = [];
    let rangeStart = '';
    let rangeEnd = '';

    if (reportMode === 'monthly') {
      const monthStr = selectedMonth;
      rangeStart = monthStr + '-01';
      rangeEnd = monthStr + '-31'; // Simplified for filtering
      monthlyInvoices = filteredInvoices.filter(inv => inv.date.startsWith(monthStr) && inv.status !== 'Returned');
      monthlyTransactions = filteredTransactions.filter(t => t.date.startsWith(monthStr));
    } else {
      rangeStart = startDate;
      rangeEnd = endDate;
      monthlyInvoices = filteredInvoices.filter(inv => inv.date >= startDate && inv.date <= endDate && inv.status !== 'Returned');
      monthlyTransactions = filteredTransactions.filter(t => t.date >= startDate && t.date <= endDate);
    }

    // Group products by name and size to avoid duplicates in the report
    const groupedProductsMap = new Map<string, { name: string, size: string, ids: string[], originalProducts: Product[] }>();
    
    products.forEach(p => {
      const key = `${p.name.trim().toLowerCase()}|${(p.size || '').trim().toLowerCase()}`;
      if (!groupedProductsMap.has(key)) {
        groupedProductsMap.set(key, { 
          name: p.name, 
          size: p.size || '-', 
          ids: [p.id],
          originalProducts: [p]
        });
      } else {
        const group = groupedProductsMap.get(key)!;
        group.ids.push(p.id);
        group.originalProducts.push(p);
      }
    });

    const uniqueGroups = Array.from(groupedProductsMap.values());

    return uniqueGroups.map((group, index) => {
      const productInvoices = monthlyInvoices.filter(inv => inv.items.some(i => group.ids.includes(i.productId)));
      
      // Use the first product in the group as the base for static details
      const baseProduct = group.originalProducts[0];
      
      // Get TP from invoice if available, else use base product default
      let displayTp = baseProduct.tp;
      if (productInvoices.length > 0) {
        const firstItem = productInvoices[0].items.find(i => group.ids.includes(i.productId));
        if (firstItem) displayTp = firstItem.tp;
      }

      // Calculate Opening Stock (Aggregated for all IDs in the group)
      let openingStockUnit = 0;
      
      if (isStaff) {
        // For staff, opening stock is the sum of THEIR transactions before the range start
        const transactionsBeforeRange = filteredTransactions.filter(t => 
          group.ids.includes(t.productId) && 
          t.date < rangeStart
        );
        
        const inBefore = transactionsBeforeRange.filter(t => t.type === 'IN').reduce((sum, t) => sum + t.quantity, 0);
        const outBefore = transactionsBeforeRange.filter(t => t.type === 'OUT').reduce((sum, t) => sum + t.quantity, 0);
        const returnBefore = transactionsBeforeRange.filter(t => t.type === 'RETURN').reduce((sum, t) => sum + t.quantity, 0);
        
        openingStockUnit = inBefore - outBefore - returnBefore;
      } else {
        // For admin, opening stock is global: sum of current stocks minus all transactions after range start
        const totalCurrentStock = group.originalProducts.reduce((sum, p) => sum + p.stock, 0);
        const transactionsAfterStart = transactions.filter(t => group.ids.includes(t.productId) && t.date >= rangeStart);
        const inAfterStart = transactionsAfterStart.filter(t => t.type === 'IN').reduce((sum, t) => sum + t.quantity, 0);
        const outAfterStart = transactionsAfterStart.filter(t => t.type === 'OUT').reduce((sum, t) => sum + t.quantity, 0);
        const returnAfterStart = transactionsAfterStart.filter(t => t.type === 'RETURN').reduce((sum, t) => sum + t.quantity, 0);
        
        openingStockUnit = totalCurrentStock - inAfterStart + outAfterStart + returnAfterStart;
      }

      const openingStockValue = openingStockUnit * displayTp;

      // Monthly activity (Aggregated)
      const receivedUnit = monthlyTransactions.filter(t => group.ids.includes(t.productId) && t.type === 'IN').reduce((sum, t) => sum + t.quantity, 0);
      const receivedValue = receivedUnit * displayTp;

      const totalStockUnit = openingStockUnit + receivedUnit;

      const returnUnit = monthlyTransactions.filter(t => group.ids.includes(t.productId) && t.type === 'RETURN').reduce((sum, t) => sum + t.quantity, 0);
      const returnValue = returnUnit * displayTp;

      let discount = 0;
      let cashSalesUnit = 0;
      let cashSalesValue = 0;
      let creditSalesUnit = 0;
      let creditSalesValue = 0;
      const salesMap = new Map<string, number>();

      productInvoices.forEach(inv => {
        const matchingItems = inv.items.filter(i => group.ids.includes(i.productId));
        
        matchingItems.forEach(item => {
          // Calculate item-level discount amount
          const itemGross = item.tp * item.quantity;
          const itemDiscountAmount = itemGross - item.total;
          discount += itemDiscountAmount;
          
          if (inv.paymentMethod === 'Cash') {
            cashSalesUnit += item.quantity;
            cashSalesValue += item.total;
          } else {
            creditSalesUnit += item.quantity;
            creditSalesValue += item.total;
          }

          const creator = inv.createdByName || 'Admin';
          const displayName = inv.salesPerson ? `${inv.salesPerson} (${creator})` : creator;
          salesMap.set(displayName, (salesMap.get(displayName) || 0) + item.quantity);
        });
      });

      const totalSalesUnit = cashSalesUnit + creditSalesUnit;
      const totalSalesValue = cashSalesValue + creditSalesValue;

      const closingStockUnit = totalStockUnit - totalSalesUnit - returnUnit;
      const closingStockValue = closingStockUnit * displayTp;

      const salesPersons = Array.from(salesMap.entries())
        .map(([name, qty]) => `${name} (${qty})`)
        .join(', ') || '-';

      // Join batch numbers if they are different
      const batchNos = Array.from(new Set(group.originalProducts.map(p => p.batchNo).filter(Boolean))).join(', ') || '-';

      return {
        srn: index + 1,
        id: baseProduct.id, // Use the first ID as a reference
        name: group.name,
        batchNo: batchNos,
        size: group.size,
        category: baseProduct.category,
        mrp: baseProduct.mrp,
        tp: displayTp,
        salesPersons,
        openingStockUnit,
        openingStockValue,
        receivedUnit,
        receivedValue,
        totalStockUnit,
        returnUnit,
        returnValue,
        discount,
        cashSalesUnit,
        cashSalesValue,
        creditSalesUnit,
        creditSalesValue,
        totalSalesUnit,
        totalSalesValue,
        closingStockUnit,
        closingStockValue,
        hasActivity: receivedUnit !== 0 || totalSalesUnit !== 0 || returnUnit !== 0
      };
    }).filter(item => {
      // Only show products with activity in the selected month
      if (!item.hasActivity) return false;

      const matchesSrn = String(item.srn).includes(searchSrn);
      const matchesProduct = item.name.toLowerCase().includes(searchProduct.toLowerCase());
      const matchesBatchNo = item.batchNo.toLowerCase().includes(searchBatchNo.toLowerCase());
      const matchesCategory = searchCategory === 'All' || item.category === searchCategory;
      const matchesSize = searchSize === 'All' || item.size === searchSize;
      const matchesMrp = String(item.mrp).includes(searchMrp);
      const matchesTp = String(item.tp).includes(searchTp);
      const matchesSalesPerson = item.salesPersons.toLowerCase().includes(searchSalesPerson.toLowerCase());
      const matchesOpeningStockUnit = String(item.openingStockUnit).includes(searchOpeningStockUnit);
      const matchesOpeningStockValue = String(item.openingStockValue).includes(searchOpeningStockValue);
      const matchesReceivedUnit = String(item.receivedUnit).includes(searchReceivedUnit);
      const matchesReceivedValue = String(item.receivedValue).includes(searchReceivedValue);
      const matchesTotalStockUnit = String(item.totalStockUnit).includes(searchTotalStockUnit);
      const matchesReturnUnit = String(item.returnUnit).includes(searchReturnUnit);
      const matchesReturnValue = String(item.returnValue).includes(searchReturnValue);
      const matchesDiscount = String(item.discount).includes(searchDiscount);
      const matchesCashSalesUnit = String(item.cashSalesUnit).includes(searchCashSalesUnit);
      const matchesCashSalesValue = String(item.cashSalesValue).includes(searchCashSalesValue);
      const matchesCreditSalesUnit = String(item.creditSalesUnit).includes(searchCreditSalesUnit);
      const matchesCreditSalesValue = String(item.creditSalesValue).includes(searchCreditSalesValue);
      const matchesTotalSalesUnit = String(item.totalSalesUnit).includes(searchTotalSalesUnit);
      const matchesTotalSalesValue = String(item.totalSalesValue).includes(searchTotalSalesValue);
      const matchesClosingStockUnit = String(item.closingStockUnit).includes(searchClosingStockUnit);
      const matchesClosingStockValue = String(item.closingStockValue).includes(searchClosingStockValue);
      
      return matchesSrn && matchesProduct && matchesBatchNo && matchesCategory && matchesSize && matchesMrp && matchesTp && 
             matchesSalesPerson && matchesOpeningStockUnit && matchesOpeningStockValue && 
             matchesReceivedUnit && matchesReceivedValue && matchesTotalStockUnit && 
             matchesReturnUnit && matchesReturnValue && matchesDiscount && 
             matchesCashSalesUnit && matchesCashSalesValue && 
             matchesCreditSalesUnit && matchesCreditSalesValue && 
             matchesTotalSalesUnit && matchesTotalSalesValue && 
             matchesClosingStockUnit && matchesClosingStockValue;
    });
  }, [products, invoices, transactions, selectedMonth, reportMode, startDate, endDate, searchSrn, searchProduct, searchBatchNo, searchCategory, searchSize, searchMrp, searchTp, 
      searchSalesPerson, searchOpeningStockUnit, searchOpeningStockValue, searchReceivedUnit, searchReceivedValue, 
      searchTotalStockUnit, searchReturnUnit, searchReturnValue, searchDiscount, 
      searchCashSalesUnit, searchCashSalesValue, searchCreditSalesUnit, searchCreditSalesValue, 
      searchTotalSalesUnit, searchTotalSalesValue, searchClosingStockUnit, searchClosingStockValue]);

  const topScrollRef = useRef<HTMLDivElement>(null);
  const tableScrollRef = useRef<HTMLDivElement>(null);
  const isSyncingTop = useRef(false);
  const isSyncingTable = useRef(false);

  const handleTopScroll = () => {
    if (topScrollRef.current && tableScrollRef.current && !isSyncingTable.current) {
      isSyncingTop.current = true;
      tableScrollRef.current.scrollLeft = topScrollRef.current.scrollLeft;
      // Reset after a short delay to allow the event to propagate
      requestAnimationFrame(() => {
        isSyncingTop.current = false;
      });
    }
  };

  const handleTableScroll = () => {
    if (topScrollRef.current && tableScrollRef.current && !isSyncingTop.current) {
      isSyncingTable.current = true;
      topScrollRef.current.scrollLeft = tableScrollRef.current.scrollLeft;
      requestAnimationFrame(() => {
        isSyncingTable.current = false;
      });
    }
  };

  useEffect(() => {
    const syncWidths = () => {
      if (tableScrollRef.current && topScrollRef.current) {
        const tableWidth = tableScrollRef.current.scrollWidth;
        const topInnerDiv = topScrollRef.current.firstChild as HTMLDivElement;
        if (topInnerDiv) {
          topInnerDiv.style.width = `${tableWidth}px`;
        }
      }
    };

    // Initial sync
    syncWidths();

    // Create a ResizeObserver to handle dynamic content changes
    const observer = new ResizeObserver(syncWidths);
    if (tableScrollRef.current) {
      observer.observe(tableScrollRef.current);
    }

    return () => observer.disconnect();
  }, [reportData]);

  const reportTitle = reportMode === 'monthly' 
    ? new Date(selectedMonth + '-01').toLocaleDateString('en-US', { month: 'short', year: '2-digit' }).toUpperCase()
    : `${new Date(startDate).toLocaleDateString('en-US', { day: '2-digit', month: 'short' })} - ${new Date(endDate).toLocaleDateString('en-US', { day: '2-digit', month: 'short' })}`.toUpperCase();

  const reportPeriodLabel = reportMode === 'monthly'
    ? new Date(selectedMonth + '-01').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : `${new Date(startDate).toLocaleDateString()} to ${new Date(endDate).toLocaleDateString()}`;

  const handlePrint = () => {
    const printArea = document.getElementById('sales-report-content');
    if (!printArea) {
      window.print();
      return;
    }

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert("Please allow popups to print.");
      return;
    }

    const content = printArea.innerHTML;
    const styles = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'))
      .map(style => style.outerHTML)
      .join('\n');

    printWindow.document.write(`
      <html>
        <head>
          <title>Sales Report - ${reportTitle}</title>
          ${styles}
          <style>
            body { 
              background: white !important; 
              padding: 20px !important; 
              margin: 0 !important;
              color: black !important;
            }
            .no-print { display: none !important; }
            /* Force black text for printing */
            * { 
              color: black !important; 
              border-color: #e5e7eb !important;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
            .bg-black, .bg-gray-900, .bg-gray-800 { 
              background: white !important; 
              border: 1px solid #e5e7eb !important; 
            }
            .text-white, .text-gray-400, .text-gray-500, .text-yellow-500 {
              color: black !important;
            }
            table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
            th, td { border: 1px solid #e5e7eb; padding: 8px; text-align: left; font-size: 9px; }
            .rounded-[3rem], .rounded-[2.5rem] { border-radius: 0 !important; }
            .shadow-2xl, .shadow-lg { box-shadow: none !important; }
          </style>
        </head>
        <body>
          <div class="print-container">
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


  const exportToExcel = () => {
    const data = reportData.map(item => ({
      'SRN': item.srn,
      'PRODUCT': item.name,
      'SIZE': item.size,
      'MRP': item.mrp,
      'TP': item.tp,
      'CATEGORY': item.category,
      'SALES PERSON NAME': item.salesPersons,
      'OPENING STOCK (UNIT)': item.openingStockUnit,
      'OPENING STOCK (VALUE)': item.openingStockValue,
      'RECEIVED (UNIT)': item.receivedUnit,
      'RECEIVED (VALUE)': item.receivedValue,
      'TOTAL STOCK (UNIT)': item.totalStockUnit,
      'RETURN (UNIT)': item.returnUnit,
      'RETURN (VALUE)': item.returnValue,
      'DISCOUNT': item.discount,
      'CASH SALES (UNIT)': item.cashSalesUnit,
      'CASH SALES (VALUE)': item.cashSalesValue,
      'CREDIT SALES (UNIT)': item.creditSalesUnit,
      'CREDIT SALES (VALUE)': item.creditSalesValue,
      'TOTAL SALES (UNIT)': item.totalSalesUnit,
      'TOTAL SALES (VALUE)': item.totalSalesValue,
      'CLOSING STOCK (UNIT)': item.closingStockUnit,
      'CLOSING STOCK (VALUE)': item.closingStockValue
    }));

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Sales & Stocks");
    const filename = reportMode === 'monthly' ? selectedMonth : `${startDate}_to_${endDate}`;
    XLSX.writeFile(workbook, `Sales_Stocks_Report_${filename}.xlsx`);
  };

  const downloadPDF = async () => {
    const element = document.getElementById('sales-report-content');
    if (!element) return;

    setIsGeneratingPDF(true);

    try {
      // Create a clone to manipulate for better PDF rendering
      const clone = element.cloneNode(true) as HTMLElement;
      
      // Force white background and black text for the PDF for maximum clarity
      clone.style.backgroundColor = 'white';
      clone.style.color = 'black';
      clone.style.position = 'absolute';
      clone.style.left = '-9999px';
      clone.style.top = '0';
      clone.style.display = 'block';
      
      // Remove no-print elements from clone
      const noPrintElements = clone.querySelectorAll('.no-print');
      noPrintElements.forEach(el => el.remove());

      // Show hidden print elements
      const printOnlyElements = clone.querySelectorAll('.hidden.print\\:block');
      printOnlyElements.forEach(el => {
        (el as HTMLElement).classList.remove('hidden');
        (el as HTMLElement).style.display = 'block';
      });

      // Fix all children colors and styles in the clone
      const allElements = clone.querySelectorAll('*');
      allElements.forEach((el) => {
        const htmlEl = el as HTMLElement;
        
        // Remove sticky positioning which breaks html2canvas
        const style = window.getComputedStyle(htmlEl);
        if (style.position === 'sticky') {
          htmlEl.style.position = 'static';
        }

        // Force black text and transparent/white backgrounds
        htmlEl.style.setProperty('color', 'black', 'important');
        htmlEl.style.setProperty('background-color', 'transparent', 'important');
        htmlEl.style.setProperty('border-color', '#333333', 'important');
        
        // Ensure fonts are visible
        htmlEl.style.opacity = '1';
        htmlEl.style.visibility = 'visible';
      });

      // Specific fix for table headers which were appearing blank
      const headers = clone.querySelectorAll('th');
      headers.forEach(th => {
        th.style.setProperty('color', 'black', 'important');
        th.style.setProperty('background-color', '#f3f4f6', 'important'); // Light gray for headers
        th.style.setProperty('font-weight', '900', 'important');
      });

      // Ensure table is fully expanded and headers are visible
      const table = clone.querySelector('table');
      if (table) {
        // Force a very wide width to ensure no cutting
        const tableWidth = 2800; 
        clone.style.width = `${tableWidth}px`;
        table.style.width = `${tableWidth}px`;
        table.style.minWidth = `${tableWidth}px`;
        table.style.tableLayout = 'fixed';
        
        // Remove filter row from PDF
        const filterRow = table.querySelector('tr.print\\:hidden');
        if (filterRow) filterRow.remove();
      }

      // Remove top scrollbar clone
      const topScroll = clone.querySelector('.sticky.top-0');
      if (topScroll) topScroll.remove();

      document.body.appendChild(clone);

      const canvas = await html2canvas(clone, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff',
        windowWidth: 3000,
        onclone: (clonedDoc) => {
          // Final check on the cloned document inside html2canvas
          const clonedElement = clonedDoc.getElementById('sales-report-content');
          if (clonedElement) {
            clonedElement.style.display = 'block';
          }
        }
      });

      document.body.removeChild(clone);

      const imgData = canvas.toDataURL('image/jpeg', 0.9);
      
      const pdf = new jsPDF({
        orientation: 'l',
        unit: 'mm',
        format: 'a3'
      });

      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      const imgHeight = (canvas.height * pdfWidth) / canvas.width;
      
      let heightLeft = imgHeight;
      let position = 0;

      // Add first page
      pdf.addImage(imgData, 'JPEG', 0, position, pdfWidth, imgHeight);
      heightLeft -= pdfHeight;

      // Add subsequent pages if content is longer than one page
      while (heightLeft > 0) {
        pdf.addPage();
        position -= pdfHeight;
        pdf.addImage(imgData, 'JPEG', 0, position, pdfWidth, imgHeight);
        heightLeft -= pdfHeight;
      }

      pdf.save(`Sales_Report_${reportTitle}.pdf`);
    } catch (err) {
      console.error("PDF Generation Error:", err);
      alert("Failed to generate PDF. Please try again.");
    } finally {
      setIsGeneratingPDF(false);
    }
  };

  return (
    <div id="sales-report-content" className="space-y-6 animate-in fade-in duration-500 bg-black p-8 rounded-[3rem] print:p-0 print:bg-white print:space-y-0">
      {/* Header Controls */}
      <div className="bg-gray-900 p-6 rounded-[2.5rem] border border-gray-800 shadow-2xl flex flex-col md:flex-row items-center justify-between gap-4 no-print">
        <div className="flex flex-col gap-4 w-full md:w-auto">
          <div className="flex flex-col md:flex-row items-start md:items-center gap-6">
            <div className="flex bg-gray-800 p-1 rounded-xl border border-gray-700">
              <button 
                onClick={() => setReportMode('monthly')}
                className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${reportMode === 'monthly' ? 'bg-yellow-500 text-black shadow-lg' : 'text-gray-400 hover:text-white'}`}
              >
                Monthly
              </button>
              <button 
                onClick={() => setReportMode('cumulative')}
                className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${reportMode === 'cumulative' ? 'bg-yellow-500 text-black shadow-lg' : 'text-gray-400 hover:text-white'}`}
              >
                Cumulative
              </button>
            </div>

            {reportMode === 'monthly' ? (
              <div className="flex items-center gap-4 p-2 rounded-2xl transition-all">
                <div className="p-3 bg-yellow-900/20 text-yellow-500 rounded-xl">
                  <Calendar size={20} />
                </div>
                <div className="flex flex-col">
                  <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1">Report Month</span>
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={handlePrevMonth}
                      className="p-1.5 bg-gray-800 text-gray-400 rounded-lg hover:text-white hover:bg-gray-700 transition-all"
                    >
                      <ChevronDown className="rotate-90" size={14} />
                    </button>
                    
                    <select 
                      value={currentMonth}
                      onChange={(e) => handleMonthChange(Number(e.target.value))}
                      className="bg-transparent text-white font-black text-sm border-none focus:ring-0 cursor-pointer appearance-none pr-2"
                    >
                      {months.map((m, i) => (
                        <option key={m} value={i + 1} className="bg-gray-900 text-white">{m}</option>
                      ))}
                    </select>

                    <select 
                      value={currentYear}
                      onChange={(e) => handleYearChange(Number(e.target.value))}
                      className="bg-transparent text-white font-black text-sm border-none focus:ring-0 cursor-pointer appearance-none"
                    >
                      {years.map(y => (
                        <option key={y} value={y} className="bg-gray-900 text-white">{y}</option>
                      ))}
                    </select>

                    <button 
                      onClick={handleNextMonth}
                      className="p-1.5 bg-gray-800 text-gray-400 rounded-lg hover:text-white hover:bg-gray-700 transition-all"
                    >
                      <ChevronDown className="-rotate-90" size={14} />
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-4 p-2 rounded-2xl transition-all">
                <div className="p-3 bg-yellow-900/20 text-yellow-500 rounded-xl">
                  <Filter size={20} />
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex flex-col">
                    <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1">From</span>
                    <input 
                      type="date" 
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="bg-gray-800 text-white font-black text-xs border border-gray-700 rounded-lg px-3 py-2 focus:ring-1 focus:ring-yellow-500 outline-none"
                    />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1">To</span>
                    <input 
                      type="date" 
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="bg-gray-800 text-white font-black text-xs border border-gray-700 rounded-lg px-3 py-2 focus:ring-1 focus:ring-yellow-500 outline-none"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
          
          {/* Active Months Quick Select */}
          {reportMode === 'monthly' && activeMonths.length > 0 && (
            <div className="flex flex-wrap gap-2 px-2">
              <span className="text-[8px] font-black text-gray-600 uppercase tracking-widest w-full mb-1">Active Months:</span>
              {activeMonths.slice(0, 6).map(m => (
                <button
                  key={m}
                  onClick={() => setSelectedMonth(m)}
                  className={`px-3 py-1 rounded-full text-[9px] font-black uppercase transition-all ${
                    selectedMonth === m 
                      ? 'bg-yellow-500 text-black shadow-lg shadow-yellow-500/20' 
                      : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white'
                  }`}
                >
                  {new Date(m + '-01').toLocaleDateString('en-US', { month: 'short', year: '2-digit' })}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto">
          <button 
            onClick={downloadPDF}
            disabled={isGeneratingPDF}
            className="flex-1 md:flex-none flex items-center justify-center gap-2 px-6 py-3 bg-red-600 text-white rounded-xl font-black text-[10px] uppercase hover:bg-red-700 shadow-lg transition-all disabled:opacity-50"
          >
            {isGeneratingPDF ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />} PDF
          </button>
          <button 
            onClick={handlePrint}
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
        </div>
      </div>

      {/* Report Content */}
      {reportData.length > 0 ? (
        <div className="space-y-6">
          {/* Report Table */}
          <div className="bg-black rounded-[2.5rem] border border-gray-800 shadow-2xl overflow-hidden print:border-none print:shadow-none print:bg-white print:rounded-none" id="sales-report-table">
        {/* Print Only Header */}
        <div className="hidden print:block p-8 border-b-2 border-black mb-8">
          <div className="flex justify-between items-end">
            <div>
              <h1 className="text-3xl font-black uppercase tracking-tighter text-black mb-2">Sales & Stock Report</h1>
              <p className="text-sm font-bold text-gray-500 uppercase tracking-widest">
                Reporting Period: {reportPeriodLabel}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xl font-black uppercase text-black">{APP_NAME}</p>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Generated on {new Date().toLocaleDateString()}</p>
            </div>
          </div>
        </div>
        <div className="bg-black p-8 flex items-center justify-between border-b border-gray-800 print:bg-white print:border-gray-200 print:p-4">
          <h2 className="text-3xl font-black text-white uppercase tracking-tighter print:text-black print:text-xl">
            SALES & STOCKS {reportTitle}
          </h2>
          <div className="flex items-center gap-4">
            <img src={APP_LOGO_URL} alt="Logo" className="h-12 w-12 object-contain invert print:invert-0" />
            <div className="text-white text-right print:text-black">
              <p className="text-xs font-black uppercase leading-none tracking-tighter">OVERPLAST</p>
              <p className="text-[10px] font-bold opacity-60 leading-none uppercase">Beauty Management</p>
            </div>
          </div>
        </div>

        {/* Top Scrollbar */}
        <div 
          ref={topScrollRef}
          onScroll={handleTopScroll}
          className="overflow-x-auto scrollbar-thin scrollbar-thumb-yellow-600 scrollbar-track-gray-900 mx-4 mt-4 print:hidden sticky top-0 z-50 bg-black/80 backdrop-blur-sm py-1 rounded-full border border-gray-800"
        >
          <div style={{ height: '1px' }}></div>
        </div>

        <div 
          ref={tableScrollRef}
          onScroll={handleTableScroll}
          className="overflow-x-auto scrollbar-thin scrollbar-thumb-yellow-600 scrollbar-track-gray-900 print:overflow-visible"
        >
          <table className="w-full min-w-[2400px] text-left border-collapse print:min-w-0 print:w-full print:text-[8px]">
            <thead>
              <tr className="bg-gray-900 border-b border-gray-800 print:bg-gray-100 print:border-gray-300">
                <th rowSpan={3} className="p-4 text-[10px] font-black text-yellow-500 uppercase tracking-widest border-r border-gray-800 text-center print:text-black print:p-1 print:border-gray-300">SRN</th>
                <th rowSpan={3} className="p-4 text-[10px] font-black text-yellow-500 uppercase tracking-widest border-r border-gray-800 min-w-[200px] print:text-black print:p-1 print:border-gray-300">PRODUCTS</th>
                <th rowSpan={3} className="p-4 text-[10px] font-black text-yellow-500 uppercase tracking-widest border-r border-gray-800 text-center print:text-black print:p-1 print:border-gray-300">BATCH NO</th>
                <th rowSpan={3} className="p-4 text-[10px] font-black text-yellow-500 uppercase tracking-widest border-r border-gray-800 text-center print:text-black print:p-1 print:border-gray-300">SIZE</th>
                <th rowSpan={3} className="p-4 text-[10px] font-black text-yellow-500 uppercase tracking-widest border-r border-gray-800 text-right print:text-black print:p-1 print:border-gray-300">MRP</th>
                <th rowSpan={3} className="p-4 text-[10px] font-black text-yellow-500 uppercase tracking-widest border-r border-gray-800 text-right print:text-black print:p-1 print:border-gray-300">TP</th>
                <th rowSpan={3} className="p-4 text-[10px] font-black text-yellow-500 uppercase tracking-widest border-r border-gray-800 text-center print:text-black print:p-1 print:border-gray-300">CATEGORY</th>
                <th rowSpan={3} className="p-4 text-[10px] font-black text-yellow-500 uppercase tracking-widest border-r border-gray-800 text-center print:text-black print:p-1 print:border-gray-300">SALES PERSON NAME</th>
                <th colSpan={2} className="p-4 text-[10px] font-black text-yellow-500 uppercase tracking-widest border-r border-gray-800 text-center print:text-black print:p-1 print:border-gray-300">OPENING STOCKS</th>
                <th colSpan={2} className="p-4 text-[10px] font-black text-yellow-500 uppercase tracking-widest border-r border-gray-800 text-center print:text-black print:p-1 print:border-gray-300">RECEIVED IN CURRENT MONTH</th>
                <th rowSpan={3} className="p-4 text-[10px] font-black text-yellow-500 uppercase tracking-widest border-r border-gray-800 text-center print:text-black print:p-1 print:border-gray-300">TOTAL STOCKS</th>
                <th colSpan={2} className="p-4 text-[10px] font-black text-yellow-500 uppercase tracking-widest border-r border-gray-800 text-center print:text-black print:p-1 print:border-gray-300">RETURN</th>
                <th rowSpan={3} className="p-4 text-[10px] font-black text-yellow-500 uppercase tracking-widest border-r border-gray-800 text-right print:text-black print:p-1 print:border-gray-300">DISCOUNT</th>
                <th colSpan={4} className="p-4 text-[10px] font-black text-yellow-500 uppercase tracking-widest border-r border-gray-800 text-center print:text-black print:p-1 print:border-gray-300">SALES</th>
                <th colSpan={2} className="p-4 text-[10px] font-black text-yellow-500 uppercase tracking-widest border-r border-gray-800 text-center print:text-black print:p-1 print:border-gray-300">TOTAL SALES</th>
                <th colSpan={2} className="p-4 text-[10px] font-black text-yellow-500 uppercase tracking-widest text-center print:text-black print:p-1">CLOSING STOCKS</th>
              </tr>
      <tr className="bg-gray-900 border-b border-gray-800 print:bg-gray-100 print:border-gray-300">
        <th rowSpan={2} className="p-2 text-[9px] font-black text-gray-500 uppercase tracking-widest border-r border-gray-800 text-center print:text-black print:p-1 print:border-gray-300">UNIT</th>
        <th rowSpan={2} className="p-2 text-[9px] font-black text-gray-500 uppercase tracking-widest border-r border-gray-800 text-center print:text-black print:p-1 print:border-gray-300">VALUE</th>
        <th rowSpan={2} className="p-2 text-[9px] font-black text-gray-500 uppercase tracking-widest border-r border-gray-800 text-center print:text-black print:p-1 print:border-gray-300">UNIT</th>
        <th rowSpan={2} className="p-2 text-[9px] font-black text-gray-500 uppercase tracking-widest border-r border-gray-800 text-center print:text-black print:p-1 print:border-gray-300">VALUE</th>
        <th rowSpan={2} className="p-2 text-[9px] font-black text-gray-500 uppercase tracking-widest border-r border-gray-800 text-center print:text-black print:p-1 print:border-gray-300">UNIT</th>
        <th rowSpan={2} className="p-2 text-[9px] font-black text-gray-500 uppercase tracking-widest border-r border-gray-800 text-center print:text-black print:p-1 print:border-gray-300">VALUE</th>
        <th colSpan={2} className="p-2 text-[9px] font-black text-gray-500 uppercase tracking-widest border-r border-gray-800 text-center print:text-black print:p-1 print:border-gray-300">CASH</th>
        <th colSpan={2} className="p-2 text-[9px] font-black text-gray-500 uppercase tracking-widest border-r border-gray-800 text-center print:text-black print:p-1 print:border-gray-300">CREDIT</th>
        <th rowSpan={2} className="p-2 text-[9px] font-black text-gray-500 uppercase tracking-widest border-r border-gray-800 text-center print:text-black print:p-1 print:border-gray-300">UNIT</th>
        <th rowSpan={2} className="p-2 text-[9px] font-black text-gray-500 uppercase tracking-widest border-r border-gray-800 text-center print:text-black print:p-1 print:border-gray-300">VALUE</th>
        <th rowSpan={2} className="p-2 text-[9px] font-black text-gray-500 uppercase tracking-widest border-r border-gray-800 text-center print:text-black print:p-1 print:border-gray-300">UNIT</th>
        <th rowSpan={2} className="p-2 text-[9px] font-black text-gray-500 uppercase tracking-widest text-center print:text-black print:p-1">VALUE</th>
      </tr>
      <tr className="bg-gray-900 border-b border-gray-800 print:bg-gray-100 print:border-gray-300">
        <th className="p-2 text-[8px] font-black text-gray-600 uppercase tracking-widest border-r border-gray-800 text-center print:text-black print:p-1 print:border-gray-300">UNIT</th>
        <th className="p-2 text-[8px] font-black text-gray-600 uppercase tracking-widest border-r border-gray-800 text-center print:text-black print:p-1 print:border-gray-300">VALUE</th>
        <th className="p-2 text-[8px] font-black text-gray-600 uppercase tracking-widest border-r border-gray-800 text-center print:text-black print:p-1 print:border-gray-300">UNIT</th>
        <th className="p-2 text-[8px] font-black text-gray-600 uppercase tracking-widest border-r border-gray-800 text-center print:text-black print:p-1 print:border-gray-300">VALUE</th>
      </tr>
              <tr className="bg-black border-b border-gray-800 print:hidden">
                <th className="p-2 border-r border-gray-800">
                  <input 
                    type="text" 
                    placeholder="Filter..."
                    value={searchSrn}
                    onChange={(e) => setSearchSrn(e.target.value)}
                    className="w-full px-2 py-1 text-[10px] font-bold bg-gray-900 text-white border-none rounded focus:ring-1 focus:ring-yellow-500 text-center"
                  />
                </th>
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
                  <input 
                    type="text" 
                    placeholder="Filter..."
                    value={searchBatchNo}
                    onChange={(e) => setSearchBatchNo(e.target.value)}
                    className="w-full px-2 py-1 text-[10px] font-bold bg-gray-900 text-white border-none rounded focus:ring-1 focus:ring-yellow-500 text-center"
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
                  <select 
                    value={searchCategory}
                    onChange={(e) => setSearchCategory(e.target.value)}
                    className="w-full px-2 py-1 text-[10px] font-bold bg-gray-900 text-white border-none rounded focus:ring-1 focus:ring-yellow-500 appearance-none"
                  >
                    {categories.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
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
                    value={searchOpeningStockUnit}
                    onChange={(e) => setSearchOpeningStockUnit(e.target.value)}
                    className="w-full px-2 py-1 text-[10px] font-bold bg-gray-900 text-white border-none rounded focus:ring-1 focus:ring-yellow-500 text-center"
                  />
                </th>
                <th className="p-2 border-r border-gray-800">
                  <input 
                    type="text" 
                    placeholder="Filter..."
                    value={searchOpeningStockValue}
                    onChange={(e) => setSearchOpeningStockValue(e.target.value)}
                    className="w-full px-2 py-1 text-[10px] font-bold bg-gray-900 text-white border-none rounded focus:ring-1 focus:ring-yellow-500 text-right"
                  />
                </th>
                <th className="p-2 border-r border-gray-800">
                  <input 
                    type="text" 
                    placeholder="Filter..."
                    value={searchReceivedUnit}
                    onChange={(e) => setSearchReceivedUnit(e.target.value)}
                    className="w-full px-2 py-1 text-[10px] font-bold bg-gray-900 text-white border-none rounded focus:ring-1 focus:ring-yellow-500 text-center"
                  />
                </th>
                <th className="p-2 border-r border-gray-800">
                  <input 
                    type="text" 
                    placeholder="Filter..."
                    value={searchReceivedValue}
                    onChange={(e) => setSearchReceivedValue(e.target.value)}
                    className="w-full px-2 py-1 text-[10px] font-bold bg-gray-900 text-white border-none rounded focus:ring-1 focus:ring-yellow-500 text-right"
                  />
                </th>
                <th className="p-2 border-r border-gray-800">
                  <input 
                    type="text" 
                    placeholder="Filter..."
                    value={searchTotalStockUnit}
                    onChange={(e) => setSearchTotalStockUnit(e.target.value)}
                    className="w-full px-2 py-1 text-[10px] font-bold bg-gray-900 text-white border-none rounded focus:ring-1 focus:ring-yellow-500 text-center"
                  />
                </th>
                <th className="p-2 border-r border-gray-800">
                  <input 
                    type="text" 
                    placeholder="Filter..."
                    value={searchReturnUnit}
                    onChange={(e) => setSearchReturnUnit(e.target.value)}
                    className="w-full px-2 py-1 text-[10px] font-bold bg-gray-900 text-white border-none rounded focus:ring-1 focus:ring-yellow-500 text-center"
                  />
                </th>
                <th className="p-2 border-r border-gray-800">
                  <input 
                    type="text" 
                    placeholder="Filter..."
                    value={searchReturnValue}
                    onChange={(e) => setSearchReturnValue(e.target.value)}
                    className="w-full px-2 py-1 text-[10px] font-bold bg-gray-900 text-white border-none rounded focus:ring-1 focus:ring-yellow-500 text-right"
                  />
                </th>
                <th className="p-2 border-r border-gray-800">
                  <input 
                    type="text" 
                    placeholder="Filter..."
                    value={searchDiscount}
                    onChange={(e) => setSearchDiscount(e.target.value)}
                    className="w-full px-2 py-1 text-[10px] font-bold bg-gray-900 text-white border-none rounded focus:ring-1 focus:ring-yellow-500 text-right"
                  />
                </th>
                <th className="p-2 border-r border-gray-800">
                  <input 
                    type="text" 
                    placeholder="Filter..."
                    value={searchCashSalesUnit}
                    onChange={(e) => setSearchCashSalesUnit(e.target.value)}
                    className="w-full px-2 py-1 text-[10px] font-bold bg-gray-900 text-white border-none rounded focus:ring-1 focus:ring-yellow-500 text-center"
                  />
                </th>
                <th className="p-2 border-r border-gray-800">
                  <input 
                    type="text" 
                    placeholder="Filter..."
                    value={searchCashSalesValue}
                    onChange={(e) => setSearchCashSalesValue(e.target.value)}
                    className="w-full px-2 py-1 text-[10px] font-bold bg-gray-900 text-white border-none rounded focus:ring-1 focus:ring-yellow-500 text-right"
                  />
                </th>
                <th className="p-2 border-r border-gray-800">
                  <input 
                    type="text" 
                    placeholder="Filter..."
                    value={searchCreditSalesUnit}
                    onChange={(e) => setSearchCreditSalesUnit(e.target.value)}
                    className="w-full px-2 py-1 text-[10px] font-bold bg-gray-900 text-white border-none rounded focus:ring-1 focus:ring-yellow-500 text-center"
                  />
                </th>
                <th className="p-2 border-r border-gray-800">
                  <input 
                    type="text" 
                    placeholder="Filter..."
                    value={searchCreditSalesValue}
                    onChange={(e) => setSearchCreditSalesValue(e.target.value)}
                    className="w-full px-2 py-1 text-[10px] font-bold bg-gray-900 text-white border-none rounded focus:ring-1 focus:ring-yellow-500 text-right"
                  />
                </th>
                <th className="p-2 border-r border-gray-800">
                  <input 
                    type="text" 
                    placeholder="Filter..."
                    value={searchTotalSalesUnit}
                    onChange={(e) => setSearchTotalSalesUnit(e.target.value)}
                    className="w-full px-2 py-1 text-[10px] font-bold bg-gray-900 text-white border-none rounded focus:ring-1 focus:ring-yellow-500 text-center"
                  />
                </th>
                <th className="p-2 border-r border-gray-800">
                  <input 
                    type="text" 
                    placeholder="Filter..."
                    value={searchTotalSalesValue}
                    onChange={(e) => setSearchTotalSalesValue(e.target.value)}
                    className="w-full px-2 py-1 text-[10px] font-bold bg-gray-900 text-white border-none rounded focus:ring-1 focus:ring-yellow-500 text-right"
                  />
                </th>
                <th className="p-2 border-r border-gray-800">
                  <input 
                    type="text" 
                    placeholder="Filter..."
                    value={searchClosingStockUnit}
                    onChange={(e) => setSearchClosingStockUnit(e.target.value)}
                    className="w-full px-2 py-1 text-[10px] font-bold bg-gray-900 text-white border-none rounded focus:ring-1 focus:ring-yellow-500 text-center"
                  />
                </th>
                <th className="p-2">
                  <input 
                    type="text" 
                    placeholder="Filter..."
                    value={searchClosingStockValue}
                    onChange={(e) => setSearchClosingStockValue(e.target.value)}
                    className="w-full px-2 py-1 text-[10px] font-bold bg-gray-900 text-white border-none rounded focus:ring-1 focus:ring-yellow-500 text-right"
                  />
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {reportData.map((item, idx) => (
                <tr key={item.id} className={`${idx % 2 === 0 ? 'bg-black' : 'bg-gray-900/30'} hover:bg-gray-900 transition-colors`}>
                  <td className="p-4 text-xs font-black text-gray-500 text-center border-r border-gray-800">{item.srn}</td>
                  <td className="p-4 text-xs font-black text-white border-r border-gray-800">
                    {item.name}
                  </td>
                  <td className="p-4 text-xs font-black text-gray-400 text-center border-r border-gray-800">
                    {item.batchNo}
                  </td>
                  <td className="p-4 text-xs font-bold text-gray-400 text-center border-r border-gray-800">
                    <span className="px-3 py-1 bg-gray-800 text-yellow-500 rounded-full text-[10px] font-black uppercase tracking-widest">
                      {item.size}
                    </span>
                  </td>
                  <td className="p-4 text-xs font-black text-white text-right border-r border-gray-800">{item.mrp.toLocaleString()}</td>
                  <td className="p-4 text-xs font-black text-yellow-500 text-right border-r border-gray-800">{item.tp.toLocaleString()}</td>
                  <td className="p-4 text-[10px] font-bold text-gray-500 text-center border-r border-gray-800 uppercase tracking-tighter">
                    {item.category}
                  </td>
                  <td className="p-4 text-center border-r border-gray-800">
                    <span className="text-[10px] font-black text-white uppercase tracking-tighter">{item.salesPersons}</span>
                  </td>
                  <td className="p-4 text-xs font-black text-blue-400 text-center border-r border-gray-800">{item.openingStockUnit}</td>
                  <td className="p-4 text-xs font-black text-blue-300 text-right border-r border-gray-800">{item.openingStockValue.toLocaleString()}</td>
                  <td className="p-4 text-xs font-black text-purple-400 text-center border-r border-gray-800">{item.receivedUnit}</td>
                  <td className="p-4 text-xs font-black text-purple-300 text-right border-r border-gray-800">{item.receivedValue.toLocaleString()}</td>
                  <td className="p-4 text-xs font-black text-white text-center border-r border-gray-800">{item.totalStockUnit}</td>
                  <td className="p-4 text-xs font-black text-red-400 text-center border-r border-gray-800">{item.returnUnit}</td>
                  <td className="p-4 text-xs font-black text-red-300 text-right border-r border-gray-800">{item.returnValue.toLocaleString()}</td>
                  <td className="p-4 text-xs font-black text-yellow-600 text-right border-r border-gray-800">{item.discount.toLocaleString()}</td>
                  <td className="p-4 text-xs font-black text-emerald-400 text-center border-r border-gray-800">{item.cashSalesUnit}</td>
                  <td className="p-4 text-xs font-black text-emerald-300 text-right border-r border-gray-800">{item.cashSalesValue.toLocaleString()}</td>
                  <td className="p-4 text-xs font-black text-orange-400 text-center border-r border-gray-800">{item.creditSalesUnit}</td>
                  <td className="p-4 text-xs font-black text-orange-300 text-right border-r border-gray-800">{item.creditSalesValue.toLocaleString()}</td>
                  <td className="p-4 text-xs font-black text-emerald-500 text-center border-r border-gray-800">{item.totalSalesUnit}</td>
                  <td className="p-4 text-xs font-black text-emerald-600 text-right border-r border-gray-800">{item.totalSalesValue.toLocaleString()}</td>
                  <td className="p-4 text-xs font-black text-white text-center border-r border-gray-800">{item.closingStockUnit}</td>
                  <td className="p-4 text-xs font-black text-yellow-500 text-right">{item.closingStockValue.toLocaleString()}</td>
                </tr>
              ))}
              {reportData.length === 0 && (
                <tr>
                  <td colSpan={23} className="p-24 text-center text-xs font-black text-gray-600 uppercase tracking-widest bg-gray-900/50">
                    <div className="flex flex-col items-center gap-6">
                      <div className="p-6 bg-gray-800 rounded-full text-gray-600">
                        <AlertCircle size={64} />
                      </div>
                      <div className="space-y-2">
                        <p className="text-xl text-white">No Activity Found</p>
                        <p className="text-gray-500">No sales or stock transactions recorded for {new Date(selectedMonth + '-01').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</p>
                      </div>
                      <p className="text-[10px] opacity-50 font-bold max-w-sm mx-auto">This report displays products that have opening stock, received units, or sales in the selected month. Try selecting a different month or check your filters.</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
            <tfoot className="bg-gray-900 text-white border-t-2 border-yellow-500">
              <tr>
                <td colSpan={7} className="p-6 text-[10px] font-black uppercase tracking-widest border-r border-gray-800">Monthly Totals</td>
                <td className="p-6 text-center border-r border-gray-800 font-black text-blue-400">
                  {reportData.reduce((sum, i) => sum + i.openingStockUnit, 0)}
                </td>
                <td className="p-6 text-right border-r border-gray-800 font-black text-blue-300">
                  {reportData.reduce((sum, i) => sum + i.openingStockValue, 0).toLocaleString()}
                </td>
                <td className="p-6 text-center border-r border-gray-800 font-black text-purple-400">
                  {reportData.reduce((sum, i) => sum + i.receivedUnit, 0)}
                </td>
                <td className="p-6 text-right border-r border-gray-800 font-black text-purple-300">
                  {reportData.reduce((sum, i) => sum + i.receivedValue, 0).toLocaleString()}
                </td>
                <td className="p-6 text-center border-r border-gray-800 font-black text-white">
                  {reportData.reduce((sum, i) => sum + i.totalStockUnit, 0)}
                </td>
                <td className="p-6 text-center border-r border-gray-800 font-black text-red-400">
                  {reportData.reduce((sum, i) => sum + i.returnUnit, 0)}
                </td>
                <td className="p-6 text-right border-r border-gray-800 font-black text-red-300">
                  {reportData.reduce((sum, i) => sum + i.returnValue, 0).toLocaleString()}
                </td>
                <td className="p-6 text-right border-r border-gray-800 font-black text-yellow-600">
                  {reportData.reduce((sum, i) => sum + i.discount, 0).toLocaleString()}
                </td>
                <td className="p-6 text-center border-r border-gray-800 font-black text-emerald-400">
                  {reportData.reduce((sum, i) => sum + i.cashSalesUnit, 0)}
                </td>
                <td className="p-6 text-right border-r border-gray-800 font-black text-emerald-300">
                  {reportData.reduce((sum, i) => sum + i.cashSalesValue, 0).toLocaleString()}
                </td>
                <td className="p-6 text-center border-r border-gray-800 font-black text-orange-400">
                  {reportData.reduce((sum, i) => sum + i.creditSalesUnit, 0)}
                </td>
                <td className="p-6 text-right border-r border-gray-800 font-black text-orange-300">
                  {reportData.reduce((sum, i) => sum + i.creditSalesValue, 0).toLocaleString()}
                </td>
                <td className="p-6 text-center border-r border-gray-800 font-black text-emerald-500">
                  {reportData.reduce((sum, i) => sum + i.totalSalesUnit, 0)}
                </td>
                <td className="p-6 text-right border-r border-gray-800 font-black text-emerald-600">
                  {reportData.reduce((sum, i) => sum + i.totalSalesValue, 0).toLocaleString()}
                </td>
                <td className="p-6 text-center border-r border-gray-800 font-black text-white">
                  {reportData.reduce((sum, i) => sum + i.closingStockUnit, 0)}
                </td>
                <td className="p-6 text-right font-black text-yellow-500">
                  {reportData.reduce((sum, i) => sum + i.closingStockValue, 0).toLocaleString()}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
        </div>
      ) : (
        <div className="bg-gray-900/50 p-24 rounded-[3rem] border border-gray-800 border-dashed text-center flex flex-col items-center gap-6">
          <div className="p-8 bg-gray-800 rounded-full text-gray-600">
            <AlertCircle size={80} />
          </div>
          <div className="space-y-2">
            <h3 className="text-3xl font-black text-white uppercase tracking-tighter">No Work Recorded</h3>
            <p className="text-gray-500 font-bold">
              No activity found for {new Date(selectedMonth + '-01').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
            </p>
          </div>
          <div className="max-w-md mx-auto p-6 bg-gray-900 rounded-2xl border border-gray-800">
            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest leading-relaxed">
              This report only displays months and products with active transactions (Sales, Received Stock, or Returns). 
              Please select an active month from the list above or check your filters.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default SalesReport;

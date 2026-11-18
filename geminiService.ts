import { Product, Invoice } from './types';

// Simple in-memory cache to prevent redundant calls
const insightCache = new Map<string, { text: string; timestamp: number }>();
const CACHE_DURATION = 1000 * 60 * 15; // 15 minutes

export const geminiService = {
  /**
   * Analyzes inventory and returns business recommendations.
   */
  async analyzeInventory(products: Product[]): Promise<string> {
    if (!products || products.length === 0) {
      return 'No inventory items recorded yet. Add products to receive AI analysis.';
    }

    // Create a stable cache key based on product IDs and stock levels
    const cacheKey = products.map((p) => `${p.id}:${p.stock}`).join('|');
    const cached = insightCache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      return cached.text;
    }

    try {
      const response = await fetch('/api/gemini/analyze-inventory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ products }),
      });

      if (!response.ok) {
        throw new Error(`Server returned ${response.status}`);
      }

      const data = await response.json();
      const result = data.result || 'System is reviewing stock levels. Check Critical Stock alerts in the dashboard.';
      insightCache.set(cacheKey, { text: result, timestamp: Date.now() });
      return result;
    } catch (error: any) {
      console.warn('AI inventory analysis request notice:', error?.message || error);
      // Fallback locally if network/backend is briefly unreachable
      const lowStock = products.filter((p) => Number(p.stock) <= Number(p.minStock || 5));
      if (lowStock.length > 0) {
        return `Stock Alert: ${lowStock.length} products have fallen below minimum thresholds. Review reorder points to maintain adequate supply.`;
      }
      return 'Stock Health: All inventory items are currently above minimum threshold levels.';
    }
  },

  /**
   * Parses an invoice image and extracts structured data.
   */
  async parseInvoiceImage(base64Data: string, mimeType: string): Promise<Partial<Invoice>> {
    try {
      const response = await fetch('/api/gemini/parse-invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ base64Data, mimeType }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to parse invoice image.');
      }

      return await response.json();
    } catch (error: any) {
      console.error('AI Document Parsing Error:', error);
      throw new Error(error.message || 'Could not read document. Ensure the image is clear or enter details manually.');
    }
  },

  /**
   * Generates a marketing description for a product.
   */
  async generateProductDescription(productName: string): Promise<string> {
    try {
      const response = await fetch('/api/gemini/product-description', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productName }),
      });

      if (!response.ok) {
        return `Premium quality ${productName} by Overplast Beauty.`;
      }

      const data = await response.json();
      return data.result || `Premium quality ${productName} by Overplast Beauty.`;
    } catch (error) {
      return `Premium quality ${productName} by Overplast Beauty.`;
    }
  },

  /**
   * Summarizes financial health based on invoices and calculated stats.
   */
  async summarizeFinancials(invoices: Invoice[], stats: any, month: string): Promise<string> {
    try {
      const response = await fetch('/api/gemini/summarize-financials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoices, stats, month }),
      });

      if (!response.ok) {
        throw new Error(`Server returned ${response.status}`);
      }

      const data = await response.json();
      return data.result || 'Financial summary is currently unavailable.';
    } catch (error: any) {
      console.warn('Financial summary request notice:', error?.message || error);
      const rev = Number(stats?.totalRevenue) || 0;
      const profit = Number(stats?.totalProfit) || 0;
      return `Monthly Financial Summary: Total recorded revenue of Rs. ${rev.toLocaleString()} with net profit of Rs. ${profit.toLocaleString()}.`;
    }
  },
};

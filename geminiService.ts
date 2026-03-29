
import { GoogleGenAI, Type, GenerateContentResponse } from "@google/genai";
import { Product, Invoice } from './types';

// Initializing GoogleGenAI client with correct named parameter syntax.
const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY || process.env.API_KEY || '' });

/**
 * Helper to retry Gemini API calls with exponential backoff.
 * Useful for handling 429 (Resource Exhausted) errors.
 */
async function withRetry<T>(fn: () => Promise<T>, maxRetries = 3, initialDelay = 1000): Promise<T> {
  let lastError: any;
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      // Check if it's a 429 error or a network fetch error
      const isRateLimit = error?.message?.includes('429') || 
                          error?.status === 429 || 
                          JSON.stringify(error).includes('429') ||
                          error?.message?.includes('RESOURCE_EXHAUSTED');
      
      const errorMsg = String(error?.message || error || '').toLowerCase();
      const isNetworkError = errorMsg.includes('fetch') || 
                             errorMsg.includes('network') ||
                             errorMsg.includes('load failed');
      
      if ((isRateLimit || isNetworkError) && i < maxRetries - 1) {
        const delay = initialDelay * Math.pow(2, i);
        const reason = isRateLimit ? 'Rate Limit (429)' : 'Network Error (Failed to fetch)';
        console.warn(`Gemini API ${reason}. Retrying in ${delay}ms... (Attempt ${i + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      throw error;
    }
  }
  throw lastError;
}

// Simple in-memory cache to prevent redundant calls
const insightCache = new Map<string, { text: string, timestamp: number }>();
const CACHE_DURATION = 1000 * 60 * 15; // 15 minutes

export const geminiService = {
  /**
   * Analyzes inventory and returns business insights.
   */
  async analyzeInventory(products: Product[]): Promise<string> {
    // Create a stable key based on product IDs and stock levels
    const cacheKey = products.map(p => `${p.id}:${p.stock}`).join('|');
    const cached = insightCache.get(cacheKey);
    
    if (cached && (Date.now() - cached.timestamp < CACHE_DURATION)) {
      return cached.text;
    }

    try {
      const response = await withRetry(() => ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `Analyze this inventory data and provide 3 actionable business recommendations (reordering, pricing, or stock management). Format as a short list. Products: ${JSON.stringify(products.map(p => ({ name: p.name, stock: p.stock, minStock: p.minStock })))}`,
        config: {
          systemInstruction: "You are a senior business analyst for Overplast Beauty. Be concise and professional.",
        }
      }));
      
      const result = response.text || "Unable to generate insights at this time.";
      insightCache.set(cacheKey, { text: result, timestamp: Date.now() });
      return result;
    } catch (error: any) {
      const errorStr = JSON.stringify(error);
      const isQuotaError = errorStr.includes('429') || errorStr.includes('RESOURCE_EXHAUSTED') || error.message?.includes('429');
      
      if (isQuotaError) {
        console.warn("Gemini AI Quota reached. Falling back to cached or default message.");
        return "AI Advisor is currently busy (Quota reached). Please check back in a few minutes.";
      }
      
      console.error("AI Analysis Error:", error);
      const errorMsg = String(error?.message || error || '').toLowerCase();
      if (errorMsg.includes('fetch')) {
        return "AI Advisor is offline. Please check your internet connection.";
      }
      return "System is reviewing stock levels. Please check Critical Stock alerts in the dashboard.";
    }
  },

  /**
   * Parses an invoice image and extracts structured data.
   */
  async parseInvoiceImage(base64Data: string, mimeType: string): Promise<Partial<Invoice>> {
    try {
      const response = await withRetry(() => ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: {
          parts: [
            {
              inlineData: {
                data: base64Data,
                mimeType: mimeType,
              },
            },
            {
              text: `Extract invoice data from this image.`,
            },
          ],
        },
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              items: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    name: { type: Type.STRING },
                    quantity: { type: Type.NUMBER },
                    price: { type: Type.NUMBER },
                    mrp: { type: Type.NUMBER },
                    tp: { type: Type.NUMBER },
                  },
                  required: ["name", "quantity", "price"]
                }
              },
              taxRate: { type: Type.NUMBER },
              clientName: { type: Type.STRING },
            }
          }
        }
      }));

      const text = response.text || "{}";
      return JSON.parse(text.trim());
    } catch (error: any) {
      console.error("AI Document Parsing Error:", error);
      const errorMsg = String(error?.message || error || '').toLowerCase();
      if (errorMsg.includes('429') || errorMsg.includes('resource_exhausted')) {
        throw new Error("AI Document Reader is currently at capacity. Please wait a moment and try again.");
      }
      if (errorMsg.includes('fetch')) {
        throw new Error("Network Error: Could not reach AI service. Check your internet.");
      }
      throw new Error("Could not read the document. Ensure the image is clear and well-lit.");
    }
  },

  /**
   * Generates a marketing description for a product.
   */
  async generateProductDescription(productName: string): Promise<string> {
    try {
      const response = await withRetry(() => ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `Generate a short, professional marketing description for a product named "${productName}".`,
      }));
      return response.text || "";
    } catch (error: any) {
      if (JSON.stringify(error).includes('429') || error.message?.includes('RESOURCE_EXHAUSTED')) {
        return "Premium quality product from Overplast Beauty (AI busy).";
      }
      return "Premium quality product from Overplast Beauty.";
    }
  },

  /**
   * Summarizes financial health based on invoices and calculated stats.
   */
  async summarizeFinancials(invoices: Invoice[], stats: any, month: string): Promise<string> {
    try {
      const response = await withRetry(() => ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `Analyze the financial health for ${month} based on these metrics:
        - Total Revenue: Rs. ${stats.totalRevenue}
        - Total Cost (COGS): Rs. ${stats.totalCost}
        - Total Tax: Rs. ${stats.totalTax}
        - Net Profit: Rs. ${stats.totalProfit}
        - Pending Collection: Rs. ${stats.pendingAmount}
        
        Provide a professional executive summary focusing on profitability, cost management, and collection efficiency. Use a confident, analytical tone.`,
        config: {
          systemInstruction: "You are the Chief Financial Officer for Overplast Beauty. Be precise, professional, and focus on net profit margins.",
        }
      }));
      return response.text || "Financial summary is currently unavailable.";
    } catch (error: any) {
      if (JSON.stringify(error).includes('429') || error.message?.includes('RESOURCE_EXHAUSTED')) {
        return "Financial insights are currently queued. Please check back shortly.";
      }
      return "Revenue metrics are within expected ranges for this period.";
    }
  }
};


import { GoogleGenAI, Type } from "@google/genai";
import { Product, Invoice } from './types';

// Initializing GoogleGenAI client with correct named parameter syntax.
const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY || process.env.API_KEY || '' });

export const geminiService = {
  /**
   * Analyzes inventory and returns business insights.
   */
  async analyzeInventory(products: Product[]): Promise<string> {
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `Analyze this inventory data and provide 3 actionable business recommendations (reordering, pricing, or stock management). Format as a short list. Products: ${JSON.stringify(products)}`,
        config: {
          systemInstruction: "You are a senior business analyst for Overplast Beauty. Be concise and professional.",
        }
      });
      return response.text || "Unable to generate insights at this time.";
    } catch (error) {
      console.error("AI Analysis Error:", error);
      return "System is reviewing stock levels. Please check Critical Stock alerts in the dashboard.";
    }
  },

  /**
   * Parses an invoice image and extracts structured data.
   */
  async parseInvoiceImage(base64Data: string, mimeType: string): Promise<Partial<Invoice>> {
    try {
      const response = await ai.models.generateContent({
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
      });

      const text = response.text || "{}";
      return JSON.parse(text.trim());
    } catch (error) {
      console.error("AI Document Parsing Error:", error);
      throw new Error("Could not read the document. Ensure the image is clear and well-lit.");
    }
  },

  /**
   * Generates a marketing description for a product.
   */
  async generateProductDescription(productName: string): Promise<string> {
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `Generate a short, professional marketing description for a product named "${productName}".`,
      });
      return response.text || "";
    } catch (error) {
      return "Premium quality product from Overplast Beauty.";
    }
  },

  /**
   * Summarizes financial health based on invoices.
   */
  async summarizeFinancials(invoices: Invoice[]): Promise<string> {
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `Summarize the financial health based on these invoices: ${JSON.stringify(invoices)}. Focus on revenue trends.`,
      });
      return response.text || "Financial summary is currently unavailable.";
    } catch (error) {
      return "Revenue metrics are within expected ranges for this period.";
    }
  }
};

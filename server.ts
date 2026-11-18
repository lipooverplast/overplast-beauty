import express, { Request, Response } from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { GoogleGenAI, Type } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

  app.use(express.json({ limit: '25mb' }));

  const apiKey = process.env.GEMINI_API_KEY;
  const ai = apiKey
    ? new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      })
    : null;

  // Health check endpoint
  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', hasGeminiKey: Boolean(apiKey) });
  });

  // 1. Analyze Inventory Endpoint
  app.post('/api/gemini/analyze-inventory', async (req: Request, res: Response) => {
    try {
      const { products = [] } = req.body;
      if (!Array.isArray(products) || products.length === 0) {
        return res.json({ result: 'No inventory products available to analyze.' });
      }

      if (ai) {
        try {
          const prompt = `Analyze this inventory data and provide 3 actionable business recommendations (reordering, pricing, or stock management). Format as a short numbered list. Products: ${JSON.stringify(
            products.map((p: any) => ({
              name: p.name,
              stock: p.stock,
              minStock: p.minStock,
              price: p.tradePrice || p.price,
            }))
          )}`;

          const response = await ai.models.generateContent({
            model: 'gemini-3.8-flash',
            contents: prompt,
            config: {
              systemInstruction: 'You are a senior business analyst for Overplast Beauty. Be concise, strategic, and professional.',
            },
          });

          if (response.text) {
            return res.json({ result: response.text });
          }
        } catch (apiErr: any) {
          console.warn('Gemini API call failed, falling back to rule-based analysis:', apiErr?.message || apiErr);
        }
      }

      // Intelligent rule-based fallback when Gemini API key is not configured or rate-limited
      const lowStock = products.filter((p: any) => Number(p.stock) <= Number(p.minStock || 5));
      const outOfStock = products.filter((p: any) => Number(p.stock) <= 0);
      const topStock = [...products].sort((a: any, b: any) => (Number(b.stock) || 0) - (Number(a.stock) || 0)).slice(0, 3);

      const recommendations: string[] = [];
      if (outOfStock.length > 0) {
        recommendations.push(`1. Urgent Restock: ${outOfStock.length} items are completely out of stock (${outOfStock.map((p: any) => p.name).slice(0, 3).join(', ')}). Prioritize immediate procurement.`);
      } else if (lowStock.length > 0) {
        recommendations.push(`1. Low Stock Alert: ${lowStock.length} items have fallen below minimum thresholds. Review reorder points to prevent stockouts.`);
      } else {
        recommendations.push(`1. Stock Health: Inventory buffer is healthy across all product categories with zero stockouts.`);
      }

      if (topStock.length > 0) {
        recommendations.push(`2. Volume Optimization: High-volume stock in (${topStock.map((p: any) => p.name).slice(0, 2).join(', ')}). Consider seasonal bundle promotions to accelerate turnover.`);
      }

      recommendations.push(`3. Capital Allocation: Maintain safety stock on high-margin beauty lines and audit fast-moving SKUs weekly.`);

      return res.json({ result: recommendations.join('\n\n') });
    } catch (err: any) {
      console.error('Error analyzing inventory:', err);
      res.status(500).json({ error: 'Failed to analyze inventory.' });
    }
  });

  // 2. Parse Invoice Image Endpoint
  app.post('/api/gemini/parse-invoice', async (req: Request, res: Response) => {
    try {
      const { base64Data, mimeType } = req.body;
      if (!base64Data) {
        return res.status(400).json({ error: 'Missing image data.' });
      }

      if (!ai) {
        return res.status(503).json({
          error: 'AI Document Reader is currently unavailable. Please verify API configuration or enter invoice items manually.',
        });
      }

      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: {
          parts: [
            {
              inlineData: {
                data: base64Data,
                mimeType: mimeType || 'image/jpeg',
              },
            },
            {
              text: 'Extract invoice data from this image.',
            },
          ],
        },
        config: {
          responseMimeType: 'application/json',
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
                  required: ['name', 'quantity', 'price'],
                },
              },
              taxRate: { type: Type.NUMBER },
              clientName: { type: Type.STRING },
            },
          },
        },
      });

      const text = response.text || '{}';
      return res.json(JSON.parse(text.trim()));
    } catch (err: any) {
      console.error('Error parsing invoice image:', err);
      res.status(500).json({
        error: 'Could not read document. Ensure the image is clear and well-lit, or input items manually.',
      });
    }
  });

  // 3. Summarize Financials Endpoint
  app.post('/api/gemini/summarize-financials', async (req: Request, res: Response) => {
    try {
      const { invoices = [], stats = {}, month = '' } = req.body;

      if (ai) {
        try {
          const response = await ai.models.generateContent({
            model: 'gemini-3.8-flash',
            contents: `Analyze the financial health for ${month} based on these metrics:
            - Total Revenue: Rs. ${stats.totalRevenue || 0}
            - Total Cost (COGS): Rs. ${stats.totalCost || 0}
            - Total Tax: Rs. ${stats.totalTax || 0}
            - Net Profit: Rs. ${stats.totalProfit || 0}
            - Pending Collection: Rs. ${stats.pendingAmount || 0}
            - Total Invoices: ${invoices.length}
            
            Provide a professional executive summary focusing on profitability, cost management, and collection efficiency. Use a confident, analytical tone.`,
            config: {
              systemInstruction: 'You are the Chief Financial Officer for Overplast Beauty. Be precise, professional, and focus on net profit margins.',
            },
          });

          if (response.text) {
            return res.json({ result: response.text });
          }
        } catch (apiErr: any) {
          console.warn('Gemini financial summary failed, falling back:', apiErr?.message || apiErr);
        }
      }

      // Rule-based financial summary fallback
      const rev = Number(stats.totalRevenue) || 0;
      const profit = Number(stats.totalProfit) || 0;
      const pending = Number(stats.pendingAmount) || 0;
      const margin = rev > 0 ? ((profit / rev) * 100).toFixed(1) : '0';

      const summary = `Financial Performance Summary (${month || 'Current Period'}):
Total revenue reached Rs. ${rev.toLocaleString()} with a net profit of Rs. ${profit.toLocaleString()} (Estimated margin: ${margin}%). 
Outstanding collections currently total Rs. ${pending.toLocaleString()}. Priority should be placed on timely recovery of credit receivables while sustaining healthy stock turnover across top-performing beauty categories.`;

      return res.json({ result: summary });
    } catch (err: any) {
      console.error('Error summarizing financials:', err);
      res.status(500).json({ error: 'Failed to summarize financials.' });
    }
  });

  // 4. Product Description Endpoint
  app.post('/api/gemini/product-description', async (req: Request, res: Response) => {
    try {
      const { productName } = req.body;
      if (!productName) {
        return res.json({ result: 'Premium beauty product by Overplast.' });
      }

      if (ai) {
        try {
          const response = await ai.models.generateContent({
            model: 'gemini-3.8-flash',
            contents: `Generate a short, professional marketing description for a beauty product named "${productName}".`,
          });
          if (response.text) {
            return res.json({ result: response.text.trim() });
          }
        } catch (apiErr) {
          // fallback below
        }
      }

      return res.json({
        result: `Premium quality ${productName} specially formulated by Overplast Beauty for outstanding performance and customer satisfaction.`,
      });
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to generate product description.' });
    }
  });

  // Mount Vite in development, or serve static build in production
  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server is running at http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
});

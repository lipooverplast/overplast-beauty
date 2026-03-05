# Overplast Beauty Deployment Guide

Is project ko live karne ke liye niche diye gaye steps follow karein:

## 1. Local Setup (Apne Computer Par)
1. **Node.js Install Karein:** Agar aapke computer par Node.js nahi hai, to [nodejs.org](https://nodejs.org/) se download karke install karein.
2. **Project Extract Karein:** Download ki hui `.zip` file ko unzip karein.
3. **VS Code mein Open Karein:** Folder ko Visual Studio Code mein open karein.
4. **Dependencies Install Karein:** Terminal (Ctrl+`) mein ye command chalayein:
   ```bash
   npm install
   ```

## 2. Environment Variables (.env File)
Project ke root folder mein ek nayi file banayein jiska naam ho `.env`. Isme niche di gayi details dalein:

```env
VITE_SUPABASE_URL=aapki_supabase_url
VITE_SUPABASE_ANON_KEY=aapki_supabase_anon_key
GEMINI_API_KEY=aapki_gemini_api_key
```

### Ye Keys Kahan Se Milengi?
*   **Supabase URL & Key:** [supabase.com](https://supabase.com/) par naya project banayein. Settings > API mein aapko URL aur Anon Key mil jayegi.
*   **Gemini API Key:** [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey) se apni free API key generate karein.

## 3. Database Setup (Supabase)
Supabase ke SQL Editor mein ja kar ye tables banani hongi (Aap mujhse SQL code maang sakte hain agar zaroorat ho):
*   `profiles` (Users ke liye)
*   `products` (Inventory ke liye)
*   `clients` (Clients ke liye)
*   `invoices` (Billing ke liye)
*   `stock_transactions` (Stock history ke liye)

## 4. Live (Deploy) Kaise Karein?

### Option A: Vercel (Sabse Aasaan)
1. [vercel.com](https://vercel.com/) par account banayein.
2. "Add New" > "Project" par click karein.
3. Apna folder upload karein ya GitHub se connect karein.
4. **Environment Variables:** Vercel ki settings mein wahi keys dalein jo aapne `.env` mein dali thin.
5. "Deploy" par click karein. Aapki site live ho jayegi!

### Option B: Netlify
1. [netlify.com](https://netlify.com/) par jayein.
2. Apna `dist` folder (jo `npm run build` karne se banta hai) drag and drop karein.

## 5. Project Ko Run Karna
*   **Development Mode:** `npm run dev` (Check karne ke liye)
*   **Production Build:** `npm run build` (Live karne ke liye)

---
**Note:** Agar aapko SQL code ya kisi step mein mushkil ho, to mujhse pooch sakte hain!

import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());

// Supabase Admin Client (using Service Role Key)
const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const supabaseAdmin = (supabaseUrl && supabaseServiceKey) 
  ? createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })
  : null;

// API Routes
app.get('/api/admin/health', (req, res) => {
  res.json({
    status: 'ok',
    config: {
      supabaseUrlSet: !!supabaseUrl,
      serviceKeySet: !!supabaseServiceKey,
    }
  });
});

app.post('/api/admin/update-password', async (req, res) => {
  const { userId, newPassword } = req.body;

  if (!supabaseAdmin) {
    return res.status(500).json({ 
      error: 'Supabase Admin client not initialized', 
      details: 'SUPABASE_SERVICE_ROLE_KEY is missing in environment variables.' 
    });
  }

  try {
    const { data, error } = await supabaseAdmin.auth.admin.updateUserById(
      userId,
      { password: newPassword }
    );

    if (error) throw error;

    res.json({ success: true, user: data.user });
  } catch (error: any) {
    console.error('Admin Password Update Error:', error);
    res.status(500).json({ 
      error: error.message || 'Failed to update password',
      details: error.details || 'Check Supabase logs for more info.'
    });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();

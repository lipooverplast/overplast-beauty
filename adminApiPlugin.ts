
import { createClient } from "@supabase/supabase-js";

export default function adminApiPlugin(env: Record<string, string>) {
  return {
    name: 'admin-api-plugin',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        let pathname = '';
        try {
          // Use a dummy base for relative URLs, or parse absolute URLs directly
          const url = new URL(req.url || '', 'http://localhost');
          pathname = url.pathname;
        } catch (e) {
          console.error("Admin API: Failed to parse URL", req.url);
          return next();
        }
        
        if (pathname === '/api/admin/health') {
          const supabaseUrl = env.VITE_SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
          const supabaseServiceKey = env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
          
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ 
            status: "ok", 
            config: {
              urlSet: !!supabaseUrl,
              serviceKeySet: !!supabaseServiceKey,
              serviceKeyLength: supabaseServiceKey.length
            }
          }));
          return;
        }

        if (pathname === '/api/admin/update-password' && req.method === 'POST') {
          console.log("Admin API: Received password update request");
          let body = '';
          req.on('data', chunk => {
            body += chunk.toString();
          });
          req.on('end', async () => {
            try {
              const { userId, newPassword, supabaseUrl: clientSupabaseUrl } = JSON.parse(body);
              const trimmedUserId = userId?.trim();
              const trimmedPassword = newPassword?.trim();

              console.log(`Admin API: Attempting to update password for user UID: [${trimmedUserId}]`);
              
              const supabaseUrl = env.VITE_SUPABASE_URL || process.env.VITE_SUPABASE_URL || clientSupabaseUrl || "";
              const supabaseServiceKey = env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
              
              if (!supabaseUrl || !supabaseServiceKey) {
                const missing = [];
                if (!supabaseUrl) missing.push("VITE_SUPABASE_URL");
                if (!supabaseServiceKey) missing.push("SUPABASE_SERVICE_ROLE_KEY");
                
                console.error("Admin API Error: Missing configuration", { missing });
                res.statusCode = 500;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ 
                  error: `Configuration Missing: ${missing.join(', ')}`,
                  details: "Please add 'SUPABASE_SERVICE_ROLE_KEY' to your project Secrets in the Settings menu. This is required for Admin operations."
                }));
                return;
              }

              const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
                auth: {
                  autoRefreshToken: false,
                  persistSession: false
                }
              });

              console.log(`Admin API: Calling auth.admin.updateUserById for [${trimmedUserId}]...`);
              const { data, error } = await supabaseAdmin.auth.admin.updateUserById(
                trimmedUserId,
                { password: trimmedPassword }
              );

              if (error) {
                console.error("Admin API: Supabase Auth Admin Error:", error);
                res.statusCode = 400;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ 
                  error: error.message || "Supabase Auth update failed.",
                  details: error
                }));
                return;
              }

              console.log("Admin API: Auth password updated successfully for UID:", trimmedUserId);
              res.statusCode = 200;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ 
                success: true, 
                message: "Password updated in Auth system.",
                user: data.user?.id
              }));
            } catch (error: any) {
              console.error("Admin Password Update Error:", error);
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: error.message || "Failed to update password." }));
            }
          });
        } else {
          next();
        }
      });
    }
  };
}

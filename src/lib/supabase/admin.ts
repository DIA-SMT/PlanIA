import { createClient } from "@supabase/supabase-js";

/**
 * Cliente Supabase con service_role.
 * BYPASSEA RLS. Usar SOLO en Server Components / Server Actions protegidos
 * por rol admin. NUNCA exponerlo al cliente.
 *
 * Casos de uso típicos:
 *   - Listar auth.users (admin API)
 *   - Crear/borrar usuarios desde el panel de admin
 *   - Operaciones masivas (scripts de seed)
 */
export function getSupabaseAdmin() {
  // 27.11: con Supabase en la misma VPS, el sitio público de la API bloquea
  // /auth/v1/admin. El servidor entra por la dirección interna, que además se
  // ahorra nginx y TLS. Sin la variable, sigue usando la pública.
  const url = process.env.SUPABASE_URL_INTERNA || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Falta configuración: NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY"
    );
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

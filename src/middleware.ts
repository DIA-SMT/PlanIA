import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

/**
 * Middleware: refresca la sesión de Supabase en cada request,
 * y redirige a /login si el usuario intenta acceder a rutas protegidas sin sesión.
 *
 * Rutas públicas: /login y /tv (visualización pública en pantalla de sala).
 *
 * El tótem de la agenda estaba acá —las pantallas de tótem van en computadoras
 * compartidas sin login— y se fue el 30.09 junto con la agenda de PlanIA.
 */
const RUTAS_PUBLICAS = ["/login", "/tv", "/auth"];

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    }
  );

  const { data } = await supabase.auth.getUser();
  const path = request.nextUrl.pathname;

  const esPublica =
    RUTAS_PUBLICAS.some((p) => path === p || path.startsWith(p + "/")) ||
    path.startsWith("/_next") ||
    path.startsWith("/api") ||
    path.startsWith("/logos") ||
    path.startsWith("/favicon");

  if (!data.user && !esPublica) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("from", path);
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all paths except static files and public assets.
     */
    "/((?!_next/static|_next/image|favicon.ico|logos|.*\\..*).*)",
  ],
};

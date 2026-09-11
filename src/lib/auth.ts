import { cache } from "react";
import { getSupabaseServer } from "./supabase/server";
import type { PerfilUsuario, RolUsuario } from "@/types/database";

/**
 * Devuelve el perfil del usuario autenticado actual (o null si no hay sesión).
 * Usar en Server Components y Server Actions.
 *
 * Va con cache() de React (15.08): el layout y la página lo pedían por separado
 * y cada llamada eran DOS viajes a Supabase (auth.getUser + select del perfil).
 * El dedupe es por request, así que no se comparte entre usuarios.
 */
export const getPerfilActual = cache(async function getPerfilActual(): Promise<PerfilUsuario | null> {
  const supabase = await getSupabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return null;

  const { data, error } = await supabase
    .from("perfil_usuario")
    .select("*, unidad:unidad_organizacional(*)")
    .eq("user_id", userData.user.id)
    .eq("activo", true)
    .maybeSingle();

  if (error || !data) return null;
  return data as PerfilUsuario;
});

/**
 * Devuelve los ids de unidades sobre las que el perfil opera: es el espejo en
 * la app de `usuario_puede_cargar_unidad` (SQL), y se usa para decidir qué
 * mostrar como editable. La RLS sigue siendo la que manda.
 * - intendenta / admins → todas las unidades activas
 * - director → su unidad + descendientes + ANCESTROS (26.08: carga también en
 *   su subsecretaría y su secretaría)
 * - resto → su unidad + descendientes
 */
export async function getScopeUnidades(perfil: PerfilUsuario): Promise<string[]> {
  const supabase = await getSupabaseServer();

  const accesoGlobal: RolUsuario[] = ["intendenta", "admin_funcional", "admin_tecnico"];
  if (accesoGlobal.includes(perfil.rol)) {
    const { data } = await supabase
      .from("unidad_organizacional")
      .select("id")
      .eq("activa", true);
    return (data ?? []).map((u) => (u as { id: string }).id);
  }

  if (!perfil.unidad_id) return [];

  const idsDe = (data: unknown) =>
    ((data ?? []) as { id: string }[]).map((row) => row.id);

  if (perfil.rol === "director") {
    const [descendientes, ancestros] = await Promise.all([
      supabase.rpc("unidades_descendientes", { p_unidad_id: perfil.unidad_id }),
      supabase.rpc("unidades_ancestras", { p_unidad_id: perfil.unidad_id }),
    ]);
    // `unidades_descendientes` incluye la propia; `unidades_ancestras` no la
    // repite, pero el Set deja el resultado a prueba de eso igual.
    return [...new Set([...idsDe(descendientes.data), ...idsDe(ancestros.data)])];
  }

  const { data } = await supabase.rpc("unidades_descendientes", {
    p_unidad_id: perfil.unidad_id,
  });
  return idsDe(data);
}

/**
 * Alcance de LECTURA de reportes: qué áreas puede ver un perfil en el reporte
 * trimestral. Solo hacia abajo — su unidad y las que dependen de ella.
 *
 * Va aparte de `getScopeUnidades` a propósito (09.09, pedido del párrafo 732:
 * "desde este perfil de director se puede ver este cuadro de desempeño que
 * contiene la información de todas las subsecretarías de la Sec. Gral. Esto no
 * puede ser así").
 *
 * `getScopeUnidades` es el alcance de CARGA, y desde el 26.08 al director le da
 * también sus ancestros, porque se pidió que pudiera cargar proyectos en su
 * secretaría (página 38). Eso está bien para escribir y está mal para leer: el
 * reporte lo usaba como puerta y por eso un director veía el cuadro de toda la
 * secretaría. Las dos reglas son distintas y ahora son dos funciones distintas;
 * unificarlas volvería a romper una de las dos.
 *
 *   Director      → su dirección y sus departamentos
 *   Subsecretario → su subsecretaría y las direcciones a su cargo
 *   Secretario    → toda su secretaría
 *   Intendenta / admins / `acceso_global` → todas
 *
 * Un rol desconocido o un perfil sin unidad se quedan SIN alcance. Es a
 * propósito: acá el que falla, falla cerrado.
 */
export async function getScopeReporte(perfil: PerfilUsuario): Promise<string[]> {
  const supabase = await getSupabaseServer();

  const veTodo: RolUsuario[] = ["intendenta", "admin_funcional", "admin_tecnico"];
  if (veTodo.includes(perfil.rol) || perfil.acceso_global === true) {
    const { data } = await supabase
      .from("unidad_organizacional")
      .select("id")
      .eq("activa", true);
    return (data ?? []).map((u) => (u as { id: string }).id);
  }

  const porUnidad: RolUsuario[] = ["secretario", "subsecretario", "director", "coordinador"];
  if (!porUnidad.includes(perfil.rol) || !perfil.unidad_id) return [];

  // `unidades_descendientes` ya incluye la propia unidad y es recursiva
  // (010_rbac.sql:60), así que un secretario recibe su secretaría completa.
  const { data } = await supabase.rpc("unidades_descendientes", {
    p_unidad_id: perfil.unidad_id,
  });
  return ((data ?? []) as { id: string }[]).map((row) => row.id);
}

/**
 * Lanza error si el perfil actual no tiene uno de los roles permitidos.
 * Para usar al inicio de Server Actions.
 */
export async function requireRol(...roles: RolUsuario[]): Promise<PerfilUsuario> {
  const perfil = await getPerfilActual();
  if (!perfil) throw new Error("No autenticado");
  if (!roles.includes(perfil.rol)) {
    throw new Error(`Permisos insuficientes (requiere: ${roles.join(", ")})`);
  }
  return perfil;
}

/**
 * Verifica que el perfil pueda cargar datos sobre una unidad específica.
 * Director solo carga sobre su propia unidad; admin_funcional sobre cualquiera.
 */
export async function requireCargaSobreUnidad(unidadId: string): Promise<PerfilUsuario> {
  const perfil = await getPerfilActual();
  if (!perfil) throw new Error("No autenticado");
  if (perfil.rol === "admin_funcional") return perfil;
  if (perfil.rol === "director" && perfil.unidad_id === unidadId) return perfil;
  throw new Error("Permisos insuficientes para cargar sobre esta unidad");
}

/**
 * Verifica que el perfil pueda validar avances sobre una unidad.
 * Subsecretario para sus direcciones hijas; admin_funcional siempre.
 */
export async function requireValidacionSobreUnidad(unidadId: string): Promise<PerfilUsuario> {
  const perfil = await getPerfilActual();
  if (!perfil) throw new Error("No autenticado");
  if (perfil.rol === "admin_funcional") return perfil;
  if (perfil.rol === "subsecretario" && perfil.unidad_id) {
    const supabase = await getSupabaseServer();
    const { data } = await supabase.rpc("unidades_descendientes", {
      p_unidad_id: perfil.unidad_id,
    });
    const ids = (data ?? []).map((r: { id: string }) => r.id);
    if (ids.includes(unidadId)) return perfil;
  }
  throw new Error("Permisos insuficientes para validar avances de esta unidad");
}

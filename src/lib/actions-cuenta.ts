"use server";

import { requireRol, getPerfilActual } from "./auth";
import { getSupabaseAdmin } from "./supabase/admin";

/**
 * Genera un enlace de un solo uso para que una persona ponga su contraseña.
 *
 * 09.09, párrafo 737: "también una herramienta para que nosotros podamos
 * ayudarlos en caso de que no sepan como hacerlo".
 *
 * POR QUÉ UN ENLACE Y NO UNA CONTRASEÑA PROVISORIA. Lo obvio sería que
 * Planificación le ponga una clave temporal y se la pase. Eso obliga a que una
 * persona conozca la contraseña de otra, y esa clave termina viajando por
 * WhatsApp y quedando en el historial de los dos teléfonos. Con el enlace nadie
 * —ni Planificación, ni nosotros, ni el servidor— ve nunca la contraseña: el
 * enlace deja la sesión abierta y la persona la escribe ella misma en Mi perfil.
 *
 * POR QUÉ NO SE MANDA POR CORREO. `generateLink` devuelve el enlace sin
 * enviarlo. El proyecto no tiene servidor de correo propio, y el de prueba de
 * Supabase permite unos pocos mensajes por hora: con 73 usuarios, un flujo que
 * dependa de ese correo falla justo cuando se lo necesita. Así Planificación
 * copia el enlace y lo manda por donde ya se están hablando.
 *
 * El enlace es de un solo uso y caduca. Si alguien lo pide y no lo usa, se
 * genera otro.
 */
export async function generarEnlaceRecuperacion(input: { user_id: string }) {
  try {
    await requireRol("admin_funcional", "admin_tecnico");
  } catch (e) {
    return { success: false as const, error: (e as Error).message };
  }

  const sb = getSupabaseAdmin();

  // El correo sale del perfil y no de lo que manda el cliente: así un id
  // cualquiera no puede usarse para fabricar un enlace hacia otra dirección.
  const { data: perfil, error: ePerfil } = await sb
    .from("perfil_usuario")
    .select("email, nombre, activo")
    .eq("user_id", input.user_id)
    .maybeSingle();

  if (ePerfil) return { success: false as const, error: ePerfil.message };
  if (!perfil?.email) {
    return { success: false as const, error: "Ese usuario no tiene un correo cargado." };
  }
  if (perfil.activo === false) {
    return {
      success: false as const,
      error: "Ese usuario está desactivado. Activalo antes de darle acceso.",
    };
  }

  const { data, error } = await sb.auth.admin.generateLink({
    type: "recovery",
    email: perfil.email as string,
  });
  if (error) return { success: false as const, error: error.message };

  const enlace = data?.properties?.action_link;
  if (!enlace) {
    return { success: false as const, error: "Supabase no devolvió el enlace." };
  }

  return {
    success: true as const,
    enlace,
    email: perfil.email as string,
    nombre: (perfil.nombre as string | null) ?? null,
  };
}

/**
 * El mismo enlace, pero para uno mismo. Sirve para probar el flujo sin tocarle
 * la cuenta a nadie.
 */
export async function generarEnlaceParaMi() {
  const perfil = await getPerfilActual();
  if (!perfil) return { success: false as const, error: "No autenticado" };
  return generarEnlaceRecuperacion({ user_id: perfil.user_id });
}

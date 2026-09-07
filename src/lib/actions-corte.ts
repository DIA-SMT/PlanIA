"use server";

/**
 * Acción manual para tomar la foto del corte trimestral.
 *
 * El camino normal es el proceso programado
 * (.github/workflows/corte-trimestral.yml), que la toma el último día de cada
 * trimestre. Esto es la red: sirve para tomarla antes del cierre, para
 * retomarla si alguien cargó datos tarde el mismo día, y para no quedar
 * colgados de que el cron haya andado.
 */
import { revalidatePath } from "next/cache";
import { getPerfilActual } from "./auth";
import { tomarCorteTrimestral, type ResultadoCorte } from "./corte-trimestral";

export async function tomarCorteAhora(input?: { fecha_corte?: string }): Promise<
  { success: true; resultado: ResultadoCorte } | { success: false; error: string }
> {
  const perfil = await getPerfilActual();
  if (!perfil) return { success: false, error: "No autenticado" };
  if (perfil.rol !== "admin_funcional") {
    return { success: false, error: "Solo Planificación Estratégica puede tomar el corte" };
  }

  const hoy = new Date().toISOString().slice(0, 10);
  const fechaCorte = input?.fecha_corte?.trim() || hoy;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaCorte)) {
    return { success: false, error: "La fecha tiene que ser YYYY-MM-DD" };
  }
  // Hacia adelante no tiene sentido: la foto es de lo que ya pasó.
  if (fechaCorte > hoy) {
    return { success: false, error: "No se puede tomar una foto con fecha futura" };
  }

  // Hacia atrás se permite una ventana corta, no cualquier fecha. El motivo:
  // la foto se arma con los datos de HOY, así que fecharla en el pasado afirma
  // que el municipio estaba así ese día. A pocos días de distancia es una
  // aproximación razonable —y es el caso real de "el cierre fue el 30 y lo
  // cerramos el 2"—; a meses de distancia sería inventar historia.
  //
  // El desfasaje queda auditable sin esfuerzo: `fecha_corte` es la fecha
  // nominal y `tomado_at` la real, así que la diferencia se ve en la tabla.
  const DIAS_ATRAS = 10;
  const limite = new Date(hoy + "T00:00:00Z");
  limite.setUTCDate(limite.getUTCDate() - DIAS_ATRAS);
  const limiteIso = limite.toISOString().slice(0, 10);
  if (fechaCorte < limiteIso) {
    return {
      success: false,
      error:
        `La foto se arma con los datos de hoy, así que no se puede fechar antes del ${limiteIso}. ` +
        "Para un trimestre ya cerrado hace tiempo no hay forma de reconstruir el dato.",
    };
  }

  try {
    const resultado = await tomarCorteTrimestral({
      fechaCorte,
      origen: "manual",
      quien: { user_id: perfil.user_id, email: perfil.email ?? null },
    });
    revalidatePath("/admin/cortes");
    return { success: true, resultado };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { success: false, error: msg };
  }
}

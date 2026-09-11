"use server";

import { supabase } from "./supabase";
import { revalidatePath } from "next/cache";
import { getSupabaseServer } from "./supabase/server";
import { requireValidacionSobreUnidad, requireRol, getPerfilActual, getScopeUnidades } from "./auth";
import { lunesIso } from "./queries";
import { esColorAgenda } from "./colores-agenda";
import {
  textoEsVacio,
  textoEsCero,
  avanceIndicador,
  avanceAgregado,
  calcularPorcentajeMeta,
  estadoDeAvance,
  normalizarTelefono,
} from "./utils";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AccionHistorial, RolUsuario } from "@/types/database";

// -------------------------------------------------------
// Server Actions: Agenda Semanal
// -------------------------------------------------------

interface ActividadInput {
  dia_semana: number;
  orden: number;
  es_feriado: boolean;
  actividad: string;
  lugar?: string | null;
  horario?: string | null;
  observacion?: string | null;
  color?: string | null;
}

export async function guardarAgendaSemana(input: {
  unidad_id: string;
  fecha_lunes: string;
  formato_libre?: string | null;
  actividades: ActividadInput[];
}) {
  const { unidad_id, fecha_lunes, formato_libre, actividades } = input;

  const sb = await getSupabaseServer();

  // Upsert de la semana
  const { data: semana, error: semanaError } = await sb
    .from("agenda_semana")
    .upsert({ unidad_id, fecha_lunes, formato_libre: formato_libre ?? null }, { onConflict: "unidad_id,fecha_lunes" })
    .select()
    .single();

  if (semanaError || !semana) return { success: false, error: semanaError?.message ?? "Error al guardar semana" };

  const semanaId = (semana as { id: string }).id;

  // Borrar actividades anteriores (reemplazo completo)
  const { error: delError } = await sb
    .from("agenda_actividad")
    .delete()
    .eq("agenda_semana_id", semanaId);
  if (delError) return { success: false, error: delError.message };

  // Insertar nuevas
  if (actividades.length > 0) {
    const rows = actividades.map((a) => ({
      agenda_semana_id: semanaId,
      dia_semana: a.dia_semana,
      orden: a.orden,
      es_feriado: a.es_feriado,
      actividad: a.actividad,
      lugar: a.lugar ?? null,
      horario: a.horario ?? null,
      observacion: a.observacion ?? null,
      color: esColorAgenda(a.color) ? a.color : null,
    }));
    const { error: actError } = await sb.from("agenda_actividad").insert(rows);
    if (actError) return { success: false, error: actError.message };
  }

  revalidatePath("/agenda");
  revalidatePath(`/agenda/${unidad_id}/${fecha_lunes}`);
  revalidatePath("/agenda/totem");

  return { success: true };
}

/**
 * Alta de UNA actividad puntual en un día concreto (correcciones 06.08).
 *
 * A diferencia de `guardarAgendaSemana` —que reemplaza la semana entera— esto
 * agrega una sola fila y no toca nada de lo ya cargado: es lo que necesita el
 * calendario para "al seleccionar un día, cargar ahí una actividad".
 *
 * La agenda se sigue guardando por semana, así que la fecha se traduce a
 * (fecha_lunes, dia_semana). Si la semana todavía no existe se crea, pero NUNCA
 * con upsert: eso pisaría el `formato_libre` de una semana ya cargada.
 *
 * Quién puede cargar sobre qué unidad lo decide la RLS
 * (`usuario_puede_cargar_unidad`): director sobre su unidad, secretario /
 * subsecretario / coordinador sobre su unidad y sus descendientes.
 */
export async function crearActividadPuntual(input: {
  unidad_id: string;
  fecha: string; // YYYY-MM-DD
  actividad: string;
  horario?: string | null;
  lugar?: string | null;
  observacion?: string | null;
  color?: string | null;
}) {
  const { unidad_id, fecha } = input;
  const actividad = input.actividad.trim();

  if (!unidad_id) return { success: false, error: "Falta la unidad" };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return { success: false, error: "Fecha inválida" };
  if (!actividad) return { success: false, error: "Escribí la actividad" };

  const fechaLunes = lunesIso(fecha);
  const dow = new Date(`${fecha}T00:00:00Z`).getUTCDay(); // 0 = domingo
  const diaSemana = dow === 0 ? 7 : dow;

  const sb = await getSupabaseServer();

  // Semana existente o nueva (sin upsert, para no pisar formato_libre)
  const { data: existente, error: buscarError } = await sb
    .from("agenda_semana")
    .select("id")
    .eq("unidad_id", unidad_id)
    .eq("fecha_lunes", fechaLunes)
    .maybeSingle();
  if (buscarError) return { success: false, error: buscarError.message };

  // La RLS devuelve "violates row-level security policy" cuando el usuario no
  // puede cargar sobre esa unidad; se traduce para que se entienda en pantalla.
  const traducir = (msg: string | undefined) =>
    msg && /row-level security/i.test(msg)
      ? "No tenés permiso para cargar en la agenda de esa unidad"
      : msg ?? "No se pudo guardar la actividad";

  let semanaId = (existente as { id: string } | null)?.id;
  if (!semanaId) {
    const { data: creada, error: crearError } = await sb
      .from("agenda_semana")
      .insert({ unidad_id, fecha_lunes: fechaLunes })
      .select("id")
      .single();
    if (crearError || !creada) {
      return { success: false, error: traducir(crearError?.message) };
    }
    semanaId = (creada as { id: string }).id;
  }

  // Va al final del día
  const { count } = await sb
    .from("agenda_actividad")
    .select("id", { count: "exact", head: true })
    .eq("agenda_semana_id", semanaId)
    .eq("dia_semana", diaSemana);

  const { error: insertError } = await sb.from("agenda_actividad").insert({
    agenda_semana_id: semanaId,
    dia_semana: diaSemana,
    orden: count ?? 0,
    es_feriado: false,
    actividad,
    horario: input.horario?.trim() || null,
    lugar: input.lugar?.trim() || null,
    observacion: input.observacion?.trim() || null,
    color: esColorAgenda(input.color) ? input.color : null,
  });
  if (insertError) return { success: false, error: traducir(insertError.message) };

  revalidatePath("/agenda");
  revalidatePath(`/agenda/${unidad_id}/${fechaLunes}`);
  revalidatePath("/agenda/totem");

  return { success: true };
}

/** Borra una actividad de la agenda. El permiso lo resuelve la RLS. */
export async function borrarActividadAgenda(actividadId: string) {
  const sb = await getSupabaseServer();

  // Se lee antes para saber qué rutas revalidar (y para distinguir "no existe"
  // de "no tenés permiso": el delete bajo RLS no distingue, borra 0 filas).
  const { data: previa } = await sb
    .from("agenda_actividad")
    .select("id, semana:agenda_semana(unidad_id, fecha_lunes)")
    .eq("id", actividadId)
    .maybeSingle();

  const { error, count } = await sb
    .from("agenda_actividad")
    .delete({ count: "exact" })
    .eq("id", actividadId);
  if (error) return { success: false, error: error.message };
  if (!count) return { success: false, error: "No se pudo borrar (sin permiso sobre esa agenda)" };

  const semana = (previa as { semana?: { unidad_id: string; fecha_lunes: string } } | null)?.semana;
  revalidatePath("/agenda");
  if (semana) revalidatePath(`/agenda/${semana.unidad_id}/${semana.fecha_lunes}`);
  revalidatePath("/agenda/totem");

  return { success: true };
}

// -------------------------------------------------------
// Helper: recalcula estado_semaforo a partir del valor y objetivo
// -------------------------------------------------------
function calcularSemaforo(valor: number | null, objetivo: number | null, base: number = 0, invertida = false): string {
  if (valor == null || objetivo == null) return "sin_datos";
  const rango = objetivo - base;
  if (rango === 0) return valor >= objetivo ? "verde" : "rojo";
  const pctRaw = invertida
    ? ((base - valor) / (base - objetivo)) * 100
    : ((valor - base) / rango) * 100;
  const pct = Math.max(0, Math.min(100, pctRaw));
  return pct >= 80 ? "verde" : pct >= 50 ? "amarillo" : "rojo";
}

// Materializa el estado_semaforo de una meta a partir de sus indicadores
// (cascada 16.07). Sólo actúa cuando la meta tiene indicadores; si no, conserva
// su propio estado (cargado con el avance de la meta). Se llama tras cualquier
// cambio en un indicador para que los conteos de metas (KPI, TV, estructura,
// chat) queden consistentes con la cascada.
// -------------------------------------------------------
// ÚNICO lugar que decide el estado (color) de una meta — 03.08
// -------------------------------------------------------
// Antes había dos escrituras con reglas distintas: la carga por indicador
// recalculaba por cascada, y la carga por meta escribía con umbrales propios
// (>=80 verde, >=50 amarillo) y forzaba amarillo si la meta no tenía objetivo.
// Resultado: cargabas en el proyecto y cambiaba el COLOR pero no el PORCENTAJE,
// porque el porcentaje que se muestra sale de los indicadores.
//
// Ahora las dos cargas terminan acá, y esta función aplica exactamente la misma
// regla que usa la pantalla (`avanceMeta` + `estadoDeAvance`):
//   * meta CON indicadores → promedio de sus indicadores
//   * meta SIN indicadores → su propio valor contra su objetivo
//
// Nota: el plazo no entra en la cuenta a propósito. El estado por vencimiento
// cambia día a día y no se puede materializar; se calcula al mostrar.
async function recomputarEstadoMeta(sb: SupabaseClient, metaId: string): Promise<void> {
  const { data: inds } = await sb
    .from("indicador")
    .select("valor_actual, valor_objetivo, valor_actual_texto, estado_semaforo, metadata")
    .eq("meta_id", metaId)
    .is("deleted_at", null);

  if (inds && inds.length > 0) {
    const av = avanceAgregado(
      inds.map((i) => avanceIndicador(i as Parameters<typeof avanceIndicador>[0]))
    );
    await sb.from("meta").update({ estado_semaforo: av.estado }).eq("id", metaId);
    return;
  }

  // Sin indicadores: el estado sale del avance propio de la meta.
  const { data: meta } = await sb
    .from("meta")
    .select(
      "tipo_medicion, valor_actual, valor_meta, valor_linea_base, nivel_actual, escala_cualitativa, metadata"
    )
    .eq("id", metaId)
    .single();
  if (!meta) return;

  const pct = calcularPorcentajeMeta(meta as Parameters<typeof calcularPorcentajeMeta>[0]);
  await sb.from("meta").update({ estado_semaforo: estadoDeAvance(pct) }).eq("id", metaId);
}

// Devuelve el meta_id de un indicador (para recomputar la meta tras un cambio).
async function metaIdDeIndicador(sb: SupabaseClient, indicadorId: string): Promise<string | null> {
  const { data } = await sb.from("indicador").select("meta_id").eq("id", indicadorId).single();
  return (data?.meta_id as string | undefined) ?? null;
}

// -------------------------------------------------------
// Historial de Carga (30.07): trazabilidad de los indicadores
// -------------------------------------------------------
// Guarda una FOTO del indicador después de la operación. Se llama SIEMPRE
// después del update (así refleja lo que quedó guardado) y nunca hace fallar
// la carga: si el historial no se puede escribir, el avance igual se guardó.
async function registrarHistorialIndicador(
  sb: SupabaseClient,
  indicadorId: string,
  accion: AccionHistorial
): Promise<void> {
  try {
    const { data: ind } = await sb
      .from("indicador")
      .select(
        "valor_actual, valor_actual_texto, valor_objetivo, valor_objetivo_texto, unidad_medida, estado_semaforo, observacion"
      )
      .eq("id", indicadorId)
      .single();
    if (!ind) return;

    const perfil = await getPerfilActual();
    await sb.from("indicador_historial").insert({
      indicador_id: indicadorId,
      accion,
      valor_actual: ind.valor_actual,
      valor_actual_texto: ind.valor_actual_texto,
      valor_objetivo: ind.valor_objetivo,
      valor_objetivo_texto: ind.valor_objetivo_texto,
      unidad_medida: ind.unidad_medida,
      estado_semaforo: ind.estado_semaforo,
      observacion: ind.observacion,
      registrado_por: perfil?.user_id ?? null,
      registrado_por_email: perfil?.email ?? null,
      registrado_por_nombre: perfil?.nombre ?? null,
    });
  } catch {
    // El historial es accesorio: nunca debe romper la carga del avance.
  }
}

// -------------------------------------------------------
// Server Action: Cargar avance sobre una meta
// -------------------------------------------------------
// Inserta un registro en la tabla avance (append-only)
// y actualiza los campos materializados en meta.
//
// Esta es la unica forma controlada de actualizar
// meta.valor_actual, meta.nivel_actual, meta.estado_semaforo
// y meta.ultima_actualizacion.
// -------------------------------------------------------

interface CargarAvanceInput {
  proyecto_id: string;
  meta_id: string;
  tipo_medicion: "cuantitativo" | "cualitativo" | "hito_unico";
  valor_numerico?: number | null;
  valor_cualitativo?: string | null;
  observacion?: string | null;
}

export async function cargarAvance(input: CargarAvanceInput) {
  const { proyecto_id, meta_id, tipo_medicion, valor_numerico, valor_cualitativo, observacion } = input;

  // Cliente con sesión del usuario → RLS valida que sea Director del área o admin
  const sb = await getSupabaseServer();

  // 1. Insertar avance (append-only)
  const { error: avanceError } = await sb.from("avance").insert({
    proyecto_id,
    meta_id,
    fuente: "manual",
    valor_numerico: valor_numerico ?? null,
    valor_cualitativo: valor_cualitativo ?? null,
    observacion: observacion || null,
  });

  if (avanceError) {
    return { success: false, error: avanceError.message };
  }

  // 2. Actualizar los campos materializados de la meta.
  // Acá solo se guarda EL VALOR. El estado (color) lo decide después
  // `recomputarEstadoMeta`, que es el único lugar que lo define y aplica la
  // misma regla que usa la pantalla (03.08). Antes cada carga escribía el
  // estado con su propio criterio y por eso el color y el porcentaje se
  // contradecían.
  const ahora = new Date().toISOString();

  type ValoresMeta = {
    valor_actual?: number;
    nivel_actual?: string;
    ultima_actualizacion: string;
  };
  let valores: ValoresMeta | null = null;

  if (tipo_medicion === "cuantitativo" && valor_numerico != null) {
    valores = { valor_actual: valor_numerico, ultima_actualizacion: ahora };
  } else if (tipo_medicion === "cualitativo" && valor_cualitativo) {
    valores = { nivel_actual: valor_cualitativo, ultima_actualizacion: ahora };
  } else if (tipo_medicion === "hito_unico") {
    valores = { valor_actual: 1, ultima_actualizacion: ahora };
  }

  if (valores) {
    await sb.from("meta").update(valores).eq("id", meta_id);
    await recomputarEstadoMeta(sb, meta_id);
  }

  // 3. Revalidar las paginas que muestran estos datos
  revalidatePath(`/proyectos/${proyecto_id}`);
  revalidatePath("/proyectos");
  revalidatePath("/metas");
  revalidatePath("/avance-direcciones");
  revalidatePath("/dashboard");
  revalidatePath("/tv");

  return { success: true };
}

// -------------------------------------------------------
// Server Action: Validar un avance (Subsec → 'validado')
// -------------------------------------------------------
export async function validarAvance(avance_id: string) {
  const sb = await getSupabaseServer();
  const { data: av } = await sb
    .from("avance")
    .select("id, proyecto_id, proyecto:proyecto(unidad_id)")
    .eq("id", avance_id)
    .single();
  if (!av) return { success: false, error: "Avance no encontrado" };
  const proyecto = (av as { proyecto?: { unidad_id: string } | { unidad_id: string }[] }).proyecto;
  const unidadId = Array.isArray(proyecto) ? proyecto[0]?.unidad_id : proyecto?.unidad_id;
  if (!unidadId) return { success: false, error: "Proyecto sin unidad" };

  try {
    await requireValidacionSobreUnidad(unidadId);
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }

  const { data: userData } = await sb.auth.getUser();
  const { error } = await sb
    .from("avance")
    .update({
      estado_validacion: "validado",
      validado_por: userData.user?.id ?? null,
      validado_at: new Date().toISOString(),
      observacion_validacion: null,
    })
    .eq("id", avance_id);

  if (error) return { success: false, error: error.message };

  revalidatePath(`/proyectos/${(av as { proyecto_id: string }).proyecto_id}`);
  revalidatePath("/validaciones");
  revalidatePath("/dashboard");
  return { success: true };
}

// -------------------------------------------------------
// Server Action: Observar un avance (Subsec → 'observado' + motivo)
// -------------------------------------------------------
export async function observarAvance(avance_id: string, observacion: string) {
  if (!observacion || !observacion.trim()) {
    return { success: false, error: "La observación es obligatoria" };
  }
  const sb = await getSupabaseServer();
  const { data: av } = await sb
    .from("avance")
    .select("id, proyecto_id, proyecto:proyecto(unidad_id)")
    .eq("id", avance_id)
    .single();
  if (!av) return { success: false, error: "Avance no encontrado" };
  const proyecto = (av as { proyecto?: { unidad_id: string } | { unidad_id: string }[] }).proyecto;
  const unidadId = Array.isArray(proyecto) ? proyecto[0]?.unidad_id : proyecto?.unidad_id;
  if (!unidadId) return { success: false, error: "Proyecto sin unidad" };

  try {
    await requireValidacionSobreUnidad(unidadId);
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }

  const { data: userData } = await sb.auth.getUser();
  const { error } = await sb
    .from("avance")
    .update({
      estado_validacion: "observado",
      validado_por: userData.user?.id ?? null,
      validado_at: new Date().toISOString(),
      observacion_validacion: observacion.trim(),
    })
    .eq("id", avance_id);

  if (error) return { success: false, error: error.message };

  revalidatePath(`/proyectos/${(av as { proyecto_id: string }).proyecto_id}`);
  revalidatePath("/validaciones");
  revalidatePath("/dashboard");
  return { success: true };
}

// -------------------------------------------------------
// Server Action: Completar un hito
// -------------------------------------------------------
export async function completarHito(input: {
  proyecto_id: string;
  hito_id: string;
  observacion?: string | null;
}) {
  const { proyecto_id, hito_id, observacion } = input;

  // Insertar avance referenciando el hito
  const { error: avanceError } = await supabase.from("avance").insert({
    proyecto_id,
    hito_id,
    fuente: "manual",
    observacion: observacion || null,
  });

  if (avanceError) {
    return { success: false, error: avanceError.message };
  }

  // Actualizar hito materializado
  const hoy = new Date().toISOString().slice(0, 10);
  await supabase
    .from("hito")
    .update({
      completado: true,
      fecha_completado: hoy,
    })
    .eq("id", hito_id);

  revalidatePath(`/proyectos/${proyecto_id}`);
  revalidatePath("/dashboard");
  revalidatePath("/tv");

  return { success: true };
}

// -------------------------------------------------------
// Server Actions: Administración de perfiles de usuario
// -------------------------------------------------------
export async function actualizarPerfil(input: {
  user_id: string;
  rol: RolUsuario;
  unidad_id: string | null;
  /** Ve todas las unidades (solo lectura). No amplía permisos de carga. */
  acceso_global?: boolean;
  /**
   * Teléfono tal como lo escribió el admin. Se normaliza acá a E.164 antes de
   * escribir; el cliente ya lo previsualiza pero no se confía en eso. Cadena
   * vacía borra el teléfono. (24.08)
   */
  telefono?: string | null;
}) {
  try {
    await requireRol("admin_funcional", "admin_tecnico");
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
  const sb = await getSupabaseServer();
  const update: {
    rol: RolUsuario;
    unidad_id: string | null;
    acceso_global?: boolean;
    telefono?: string | null;
  } = {
    rol: input.rol,
    unidad_id: input.unidad_id,
  };
  if (input.acceso_global !== undefined) update.acceso_global = input.acceso_global;
  if (input.telefono !== undefined) {
    const tel = normalizarTelefono(input.telefono);
    if (!tel.ok) return { success: false, error: tel.error };
    update.telefono = tel.valor;
  }
  const { error } = await sb
    .from("perfil_usuario")
    .update(update)
    .eq("user_id", input.user_id);
  if (error) return { success: false, error: error.message };
  revalidatePath("/admin/usuarios");
  return { success: true };
}

// -------------------------------------------------------
// Server Action: Eliminar un usuario (31.07)
// -------------------------------------------------------
// Borra la cuenta de Auth; el perfil se va solo por el ON DELETE CASCADE de
// perfil_usuario. Lo que el usuario haya cargado (avances, agendas, fichas)
// NO se borra: queda sin autor gracias a la migración 030.
//
// Es irreversible. Dos resguardos: no podés borrarte a vos mismo, y no se
// puede dejar al sistema sin ningún administrador activo.
export async function eliminarUsuario(input: { user_id: string }) {
  let actual;
  try {
    actual = await requireRol("admin_funcional", "admin_tecnico");
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }

  if (actual.user_id === input.user_id) {
    return { success: false, error: "No podés eliminar tu propio usuario." };
  }

  const sb = await getSupabaseServer();
  const { data: objetivo } = await sb
    .from("perfil_usuario")
    .select("rol, email, activo")
    .eq("user_id", input.user_id)
    .maybeSingle();

  // Si el que se va es admin, que no sea el último que queda en pie.
  const ROLES_ADMIN = ["admin_funcional", "admin_tecnico"];
  if (objetivo && objetivo.activo && ROLES_ADMIN.includes(objetivo.rol as string)) {
    const { count } = await sb
      .from("perfil_usuario")
      .select("user_id", { count: "exact", head: true })
      .in("rol", ROLES_ADMIN)
      .eq("activo", true);
    if ((count ?? 0) <= 1) {
      return {
        success: false,
        error: "Es el único administrador activo. Asigná otro antes de eliminarlo.",
      };
    }
  }

  const { getSupabaseAdmin } = await import("./supabase/admin");
  const { error } = await getSupabaseAdmin().auth.admin.deleteUser(input.user_id);
  if (error) {
    // El caso típico es la migración 030 sin aplicar: alguna FK a auth.users
    // sigue en NO ACTION y el borrado rebota contra la carga histórica.
    return {
      success: false,
      error: `${error.message}. Si menciona una clave foránea, falta aplicar la migración 030.`,
    };
  }

  revalidatePath("/admin/usuarios");
  return { success: true };
}

export async function desactivarPerfil(user_id: string) {
  try {
    // 31.07: antes solo admin_tecnico. Si admin_funcional ya puede eliminar,
    // no tiene sentido negarle la acción más suave.
    await requireRol("admin_funcional", "admin_tecnico");
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
  const sb = await getSupabaseServer();
  const { error } = await sb
    .from("perfil_usuario")
    .update({ activo: false })
    .eq("user_id", user_id);
  if (error) return { success: false, error: error.message };
  revalidatePath("/admin/usuarios");
  return { success: true };
}

// -------------------------------------------------------
// Server Action: Crear perfil para un usuario de auth.users existente
// (cuando un admin creó el usuario en Supabase Dashboard y necesita
// asignarle rol + unidad)
// -------------------------------------------------------
// -------------------------------------------------------
// Server Action: Crear un usuario en Supabase Auth (email + password)
// Solo admin_funcional / admin_tecnico. El usuario queda SIN perfil
// (rol/unidad) — se asigna después desde "Usuarios sin asignar".
// -------------------------------------------------------
export async function crearUsuarioAuth(input: { email: string; password: string }) {
  try {
    await requireRol("admin_funcional", "admin_tecnico");
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }

  const email = input.email.trim().toLowerCase();
  const password = input.password;

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { success: false, error: "Email inválido." };
  }
  if (!password || password.length < 6) {
    return { success: false, error: "La contraseña debe tener al menos 6 caracteres." };
  }

  const { getSupabaseAdmin } = await import("./supabase/admin");
  const sb = getSupabaseAdmin();
  const { error } = await sb.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) {
    // Mensaje más claro para el caso típico de duplicado
    const msg = /already.*registered|exists/i.test(error.message)
      ? "Ya existe un usuario con ese email."
      : error.message;
    return { success: false, error: msg };
  }

  revalidatePath("/admin/usuarios");
  return { success: true };
}

export async function crearPerfilParaUsuario(input: {
  user_id: string;
  email: string;
  nombre: string;
  rol: RolUsuario;
  unidad_id: string | null;
}) {
  try {
    await requireRol("admin_funcional", "admin_tecnico");
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
  // Usar admin client para saltarse RLS (la tabla perfil_usuario tiene policies estrictas)
  const { getSupabaseAdmin } = await import("./supabase/admin");
  const sb = getSupabaseAdmin();
  const { error } = await sb.from("perfil_usuario").insert({
    user_id: input.user_id,
    email: input.email,
    nombre: input.nombre || null,
    rol: input.rol,
    unidad_id: input.unidad_id,
    activo: true,
  });
  if (error) return { success: false, error: error.message };
  revalidatePath("/admin/usuarios");
  return { success: true };
}

// -------------------------------------------------------
// Server Action: Cargar/actualizar valor de un indicador
// -------------------------------------------------------
export async function actualizarIndicador(input: {
  indicador_id: string;
  valor_actual?: number | null;
  valor_actual_texto?: string | null;
  valor_objetivo?: number | null;
  valor_objetivo_texto?: string | null;
  unidad_medida?: string | null;
  observacion?: string | null;
  estado_semaforo_override?: "verde" | "amarillo" | "rojo" | "sin_datos" | null;
  proyecto_id?: string;
}) {
  const {
    indicador_id,
    valor_actual: valorActualInput,
    valor_actual_texto: valorActualTextoInput,
    valor_objetivo: valorObjetivoInput,
    valor_objetivo_texto: valorObjetivoTextoInput,
    unidad_medida,
    observacion,
    estado_semaforo_override,
    proyecto_id,
  } = input;

  // -----------------------------------------------------------------
  // Normalización texto → número (03.08)
  // -----------------------------------------------------------------
  // El modo "texto" existe para valores tipo "Sí/No/Realizado", pero se venía
  // usando también para cargar CANTIDADES ("783"). Guardadas como texto, el
  // avance del indicador no se puede calcular contra el objetivo: queda fijo en
  // el 50 % del semáforo y el porcentaje del proyecto no se mueve por más que
  // se recargue. Ese era el "cargo el avance y no se proyecta en proyectos".
  //
  // Si lo que escribieron es un número liso, se guarda como número. Se dejan
  // afuera los ambiguos ("1.234" puede ser mil doscientos treinta y cuatro o
  // uno coma dos): esos siguen como texto.
  const aNumero = (t: string | null | undefined): number | null => {
    const s = (t ?? "").trim().replace(/\s/g, "");
    if (!/^-?\d+([.,]\d{1,2})?$/.test(s)) return null;
    const n = Number(s.replace(",", "."));
    return isFinite(n) ? n : null;
  };

  let valor_actual = valorActualInput;
  let valor_actual_texto = valorActualTextoInput;
  if (valor_actual == null && valor_actual_texto != null) {
    const n = aNumero(valor_actual_texto);
    if (n != null) {
      valor_actual = n;
      valor_actual_texto = null;
    }
  }

  let valor_objetivo = valorObjetivoInput;
  let valor_objetivo_texto = valorObjetivoTextoInput;
  if (valor_objetivo == null && valor_objetivo_texto != null) {
    const n = aNumero(valor_objetivo_texto);
    if (n != null) {
      valor_objetivo = n;
      valor_objetivo_texto = null;
    }
  }

  const sb = await getSupabaseServer();
  const { data: ind } = await sb
    .from("indicador")
    .select("meta_id, valor_objetivo, metadata")
    .eq("id", indicador_id)
    .single();

  const invertida = (ind?.metadata as Record<string, unknown> | undefined)?.invertida === true;
  // Objetivo efectivo: el nuevo si vino en este submit, sino el ya guardado.
  const objetivoEfectivo =
    valor_objetivo !== undefined && valor_objetivo !== null
      ? valor_objetivo
      : (ind?.valor_objetivo as number | null) ?? null;

  // Si el usuario eligió un estado manualmente (caso texto), respetarlo.
  // Sino, calcular del valor numérico contra el objetivo efectivo.
  let estado: string;
  if (estado_semaforo_override) {
    estado = estado_semaforo_override;
  } else if (valor_actual != null && objetivoEfectivo != null) {
    estado = calcularSemaforo(valor_actual, objetivoEfectivo, 0, invertida);
  } else if (valor_actual != null) {
    // Valor numérico sin objetivo: 0 = No iniciado, > 0 = en ejecución.
    estado = valor_actual === 0 && !invertida ? "rojo" : "amarillo";
  } else if (valor_actual_texto != null && !textoEsVacio(valor_actual_texto)) {
    // Texto "No" o "0" = No iniciado; el resto queda en ejecución.
    const t = valor_actual_texto.trim();
    estado = /^no$/i.test(t) || textoEsCero(t) ? "rojo" : "amarillo";
  } else {
    estado = "sin_datos";
  }

  type UpdatePayload = {
    valor_actual?: number | null;
    valor_actual_texto?: string | null;
    valor_objetivo?: number | null;
    valor_objetivo_texto?: string | null;
    unidad_medida?: string | null;
    observacion?: string | null;
    estado_semaforo: string;
    ultima_actualizacion: string;
  };
  const update: UpdatePayload = {
    estado_semaforo: estado,
    ultima_actualizacion: new Date().toISOString(),
  };
  if (valor_actual !== undefined) update.valor_actual = valor_actual;
  if (valor_actual_texto !== undefined) update.valor_actual_texto = valor_actual_texto;
  if (valor_objetivo !== undefined) update.valor_objetivo = valor_objetivo;
  if (valor_objetivo_texto !== undefined) update.valor_objetivo_texto = valor_objetivo_texto;
  if (unidad_medida !== undefined) update.unidad_medida = unidad_medida;
  if (observacion !== undefined) update.observacion = observacion;

  // El `.select()` es para saber si la fila se escribió de verdad. Cuando RLS
  // bloquea un UPDATE, Postgres no encuentra filas que actualizar y Supabase
  // NO devuelve error: sin esto la carga fallaba en silencio y la función
  // informaba éxito igual. Desde las pantallas casi no se notaba (el usuario
  // solo ve indicadores de su ámbito), pero el chatbot puede pedir cualquier
  // indicador por id, así que ahí sí aparece. (24.08)
  const { data: filasEscritas, error } = await sb
    .from("indicador")
    .update(update)
    .eq("id", indicador_id)
    .select("id");

  if (error) return { success: false, error: error.message };
  if (!filasEscritas || filasEscritas.length === 0) {
    return {
      success: false,
      error:
        "No se pudo guardar: el indicador no existe o no tenés permisos de carga sobre esa área.",
    };
  }

  // Trazabilidad: queda registrada la carga con su valor y su fecha (30.07).
  await registrarHistorialIndicador(sb, indicador_id, "carga");

  // Propagar el cambio a la meta (estado por cascada).
  if (ind?.meta_id) await recomputarEstadoMeta(sb, ind.meta_id as string);

  if (proyecto_id) revalidatePath(`/proyectos/${proyecto_id}`);
  revalidatePath("/proyectos");
  revalidatePath("/indicadores");
  revalidatePath(`/indicadores/${indicador_id}`);
  revalidatePath("/avance-direcciones");
  revalidatePath("/dashboard");
  revalidatePath("/tv");

  return { success: true };
}

// -------------------------------------------------------
// Server Action: Borrar el valor cargado en un indicador
// (vuelve a estado inicial sin avance)
// -------------------------------------------------------
export async function borrarValorIndicador(input: {
  indicador_id: string;
  proyecto_id?: string;
}) {
  try {
    await requireRol("director", "subsecretario", "secretario", "coordinador", "admin_funcional");
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
  const sb = await getSupabaseServer();
  const metaId = await metaIdDeIndicador(sb, input.indicador_id);
  const { error } = await sb
    .from("indicador")
    .update({
      valor_actual: null,
      valor_actual_texto: null,
      observacion: null,
      estado_semaforo: "sin_datos",
      ultima_actualizacion: null,
    })
    .eq("id", input.indicador_id);
  if (error) return { success: false, error: error.message };
  await registrarHistorialIndicador(sb, input.indicador_id, "borrado");
  if (metaId) await recomputarEstadoMeta(sb, metaId);
  if (input.proyecto_id) revalidatePath(`/proyectos/${input.proyecto_id}`);
  revalidatePath("/proyectos");
  revalidatePath("/indicadores");
  revalidatePath(`/indicadores/${input.indicador_id}`);
  revalidatePath("/avance-direcciones");
  revalidatePath("/dashboard");
  return { success: true };
}

// -------------------------------------------------------
// Server Action: Editar metadata de un indicador (nombre, unidad, objetivo)
// -------------------------------------------------------
export async function editarIndicador(input: {
  indicador_id: string;
  nombre?: string;
  unidad_medida?: string | null;
  valor_objetivo?: number | null;
  valor_objetivo_texto?: string | null;
  fecha_inicio?: string | null;
  fecha_fin?: string | null;
  proyecto_id?: string;
}) {
  try {
    await requireRol("director", "subsecretario", "secretario", "coordinador", "admin_funcional");
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
  type UpdatePayload = {
    nombre?: string;
    unidad_medida?: string | null;
    valor_objetivo?: number | null;
    valor_objetivo_texto?: string | null;
    fecha_inicio?: string | null;
    fecha_fin?: string | null;
  };
  const update: UpdatePayload = {};
  if (input.nombre !== undefined) update.nombre = input.nombre;
  if (input.unidad_medida !== undefined) update.unidad_medida = input.unidad_medida;
  if (input.valor_objetivo !== undefined) update.valor_objetivo = input.valor_objetivo;
  if (input.valor_objetivo_texto !== undefined) update.valor_objetivo_texto = input.valor_objetivo_texto;
  if (input.fecha_inicio !== undefined) update.fecha_inicio = input.fecha_inicio || null;
  if (input.fecha_fin !== undefined) update.fecha_fin = input.fecha_fin || null;

  const sb = await getSupabaseServer();
  const { error } = await sb
    .from("indicador")
    .update(update)
    .eq("id", input.indicador_id);
  if (error) return { success: false, error: error.message };
  await registrarHistorialIndicador(sb, input.indicador_id, "edicion");
  // Cambiar el objetivo puede cambiar el % (y por ende el estado) de la meta.
  const metaId = await metaIdDeIndicador(sb, input.indicador_id);
  if (metaId) await recomputarEstadoMeta(sb, metaId);
  if (input.proyecto_id) revalidatePath(`/proyectos/${input.proyecto_id}`);
  revalidatePath("/proyectos");
  revalidatePath("/indicadores");
  revalidatePath(`/indicadores/${input.indicador_id}`);
  revalidatePath("/avance-direcciones");
  return { success: true };
}

// -------------------------------------------------------
// Server Action: Borrar (soft-delete) un indicador completo
// -------------------------------------------------------
export async function eliminarIndicador(input: {
  indicador_id: string;
  proyecto_id?: string;
}) {
  try {
    await requireRol("director", "subsecretario", "secretario", "coordinador", "admin_funcional");
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
  const sb = await getSupabaseServer();
  const metaId = await metaIdDeIndicador(sb, input.indicador_id);
  const { error } = await sb
    .from("indicador")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", input.indicador_id);
  if (error) return { success: false, error: error.message };
  if (metaId) await recomputarEstadoMeta(sb, metaId);
  if (input.proyecto_id) revalidatePath(`/proyectos/${input.proyecto_id}`);
  revalidatePath("/proyectos");
  revalidatePath("/indicadores");
  revalidatePath("/avance-direcciones");
  revalidatePath("/dashboard");
  return { success: true };
}

// -------------------------------------------------------
// Server Action: Crear un nuevo indicador para una meta
// -------------------------------------------------------
export async function crearIndicador(input: {
  meta_id: string;
  nombre: string;
  unidad_medida?: string | null;
  valor_objetivo?: number | null;
  fecha_inicio?: string | null;
  fecha_fin?: string | null;
  proyecto_id?: string;
}) {
  try {
    await requireRol("director", "subsecretario", "secretario", "coordinador", "admin_funcional");
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
  const sb = await getSupabaseServer();
  const { error } = await sb.from("indicador").insert({
    meta_id: input.meta_id,
    nombre: input.nombre,
    unidad_medida: input.unidad_medida ?? null,
    valor_objetivo: input.valor_objetivo ?? null,
    fecha_inicio: input.fecha_inicio || null,
    fecha_fin: input.fecha_fin || null,
    estado_semaforo: "sin_datos",
  });

  if (error) return { success: false, error: error.message };

  await recomputarEstadoMeta(sb, input.meta_id);
  if (input.proyecto_id) revalidatePath(`/proyectos/${input.proyecto_id}`);
  revalidatePath("/avance-direcciones");
  revalidatePath("/indicadores");
  revalidatePath("/dashboard");

  return { success: true };
}

// -------------------------------------------------------
// Server Action: Corregir un avance previo
// -------------------------------------------------------
export async function corregirAvance(input: {
  avance_id: string;
  proyecto_id: string;
  meta_id: string;
  tipo_medicion: "cuantitativo" | "cualitativo" | "hito_unico";
  valor_numerico?: number | null;
  valor_cualitativo?: string | null;
  motivo: string;
}) {
  const { avance_id, proyecto_id, meta_id, tipo_medicion, valor_numerico, valor_cualitativo, motivo } = input;

  if (!motivo || motivo.trim().length === 0) {
    return { success: false, error: "El motivo de la corrección es obligatorio." };
  }

  const sb = await getSupabaseServer();

  // 1. Insertar avance correctivo (append-only)
  const { error: avanceError } = await sb.from("avance").insert({
    proyecto_id,
    meta_id,
    fuente: "correccion",
    valor_numerico: valor_numerico ?? null,
    valor_cualitativo: valor_cualitativo ?? null,
    observacion: motivo,
    reemplaza_avance_id: avance_id,
  });

  if (avanceError) return { success: false, error: avanceError.message };

  // 2. Recalcular materializados. Igual que en `cargarAvance` (03.08): acá solo
  // se guarda el VALOR; el estado lo decide `recomputarEstadoMeta`, que es el
  // único lugar donde vive esa regla.
  const ahora = new Date().toISOString();

  type ValoresMeta = {
    valor_actual?: number;
    nivel_actual?: string;
    ultima_actualizacion: string;
  };
  let valores: ValoresMeta | null = null;

  if (tipo_medicion === "cuantitativo" && valor_numerico != null) {
    valores = { valor_actual: valor_numerico, ultima_actualizacion: ahora };
  } else if (tipo_medicion === "cualitativo" && valor_cualitativo) {
    valores = { nivel_actual: valor_cualitativo, ultima_actualizacion: ahora };
  } else if (tipo_medicion === "hito_unico") {
    valores = { valor_actual: 1, ultima_actualizacion: ahora };
  }

  if (valores) {
    await sb.from("meta").update(valores).eq("id", meta_id);
    await recomputarEstadoMeta(sb, meta_id);
  }

  revalidatePath(`/proyectos/${proyecto_id}`);
  revalidatePath("/proyectos");
  revalidatePath("/metas");
  revalidatePath("/avance-direcciones");
  revalidatePath("/dashboard");
  revalidatePath("/tv");

  return { success: true };
}

// -------------------------------------------------------
// Server Actions: Fichas PRISMA (POA 2027)
// -------------------------------------------------------

interface FichaPrismaInput {
  codigo?: string | null;
  programa: string;
  relevancia?: string | null;
  indicador?: string | null;
  secretaria?: string | null;
  meta_anual?: string | null;
  ancla?: string | null;
}

export async function crearFichaPrisma(input: FichaPrismaInput) {
  const perfil = await getPerfilActual();
  if (!perfil) return { success: false, error: "No autenticado" };
  if (!["director", "subsecretario", "secretario", "coordinador", "admin_funcional"].includes(perfil.rol)) {
    return { success: false, error: "Solo los Directores pueden cargar fichas PRISMA" };
  }
  if (!perfil.unidad_id && perfil.rol === "director") {
    return { success: false, error: "Tu perfil no tiene una dirección asignada" };
  }
  if (!input.programa?.trim()) {
    return { success: false, error: "El campo Programa/Proyecto es obligatorio" };
  }

  const { error } = await supabase.from("ficha_prisma").insert({
    unidad_id: perfil.unidad_id,
    anio: 2027,
    codigo: input.codigo ?? null,
    programa: input.programa.trim(),
    relevancia: input.relevancia ?? null,
    indicador: input.indicador ?? null,
    secretaria: input.secretaria ?? null,
    meta_anual: input.meta_anual ?? null,
    ancla: input.ancla ?? null,
    created_by: perfil.user_id,
  });
  if (error) return { success: false, error: error.message };
  revalidatePath("/poa-2027/mis-fichas");
  revalidatePath("/poa-2027");
  return { success: true };
}

export async function editarFichaPrisma(id: string, input: FichaPrismaInput) {
  const perfil = await getPerfilActual();
  if (!perfil) return { success: false, error: "No autenticado" };
  if (!input.programa?.trim()) {
    return { success: false, error: "El campo Programa/Proyecto es obligatorio" };
  }

  // Verificar pertenencia: el director solo edita fichas de su unidad
  const { data: ficha } = await supabase
    .from("ficha_prisma")
    .select("unidad_id")
    .eq("id", id)
    .single();
  if (!ficha) return { success: false, error: "Ficha no encontrada" };
  if (
    perfil.rol === "director" &&
    (ficha as { unidad_id: string }).unidad_id !== perfil.unidad_id
  ) {
    return { success: false, error: "No podés editar fichas de otra dirección" };
  }

  const { error } = await supabase
    .from("ficha_prisma")
    .update({
      codigo: input.codigo ?? null,
      programa: input.programa.trim(),
      relevancia: input.relevancia ?? null,
      indicador: input.indicador ?? null,
      secretaria: input.secretaria ?? null,
      meta_anual: input.meta_anual ?? null,
      ancla: input.ancla ?? null,
    })
    .eq("id", id);
  if (error) return { success: false, error: error.message };
  revalidatePath("/poa-2027/mis-fichas");
  return { success: true };
}

export async function eliminarFichaPrisma(id: string) {
  const perfil = await getPerfilActual();
  if (!perfil) return { success: false, error: "No autenticado" };
  const { error } = await supabase
    .from("ficha_prisma")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { success: false, error: error.message };
  revalidatePath("/poa-2027/mis-fichas");
  return { success: true };
}

// -------------------------------------------------------
// Server Actions: Proyectos y Metas (Director / admin_funcional)
// -------------------------------------------------------
export async function crearProyecto(input: {
  nombre: string;
  objetivo?: string | null;
  unidad_id: string;
  codigo?: string | null;
}) {
  const perfil = await getPerfilActual();
  if (!perfil) return { success: false, error: "No autenticado" };
  if (!["director", "subsecretario", "secretario", "coordinador", "admin_funcional"].includes(perfil.rol)) {
    return { success: false, error: "Solo Directores o Admin Funcional pueden crear proyectos" };
  }
  if (!input.nombre?.trim()) return { success: false, error: "El nombre del proyecto es obligatorio" };

  // El área elegida vale para cualquier rol. Antes el director la tenía forzada
  // a su propia dirección; desde el 26.08 también puede crear en las unidades
  // por encima suyo (migración 042), así que el formulario le ofrece la lista y
  // acá se respeta lo que eligió. Si se manda algo fuera de su ámbito, la RLS
  // rechaza el INSERT: `proyecto_insert_carga` es la autoridad, no este archivo.
  const unidadId = input.unidad_id || perfil.unidad_id;
  if (!unidadId) return { success: false, error: "Falta el área del proyecto" };

  const sb = await getSupabaseServer();
  const { data: periodo } = await sb.from("periodo").select("id").eq("activo", true).single();
  if (!periodo) return { success: false, error: "No hay período activo" };

  const { data, error } = await sb
    .from("proyecto")
    .insert({
      nombre: input.nombre.trim(),
      objetivo: input.objetivo?.trim() || null,
      codigo: input.codigo?.trim() || null,
      unidad_id: unidadId,
      periodo_id: (periodo as { id: string }).id,
      estado: "activo",
    })
    .select("id")
    .single();
  if (error) return { success: false, error: error.message };

  revalidatePath("/proyectos");
  revalidatePath("/dashboard");
  return { success: true, id: (data as { id: string }).id };
}

const ROLES_EDICION_PROYECTO = ["director", "subsecretario", "secretario", "coordinador", "admin_funcional"];

// Verifica que el usuario tenga permiso sobre el proyecto (rol + ámbito).
// admin_funcional/admin_tecnico tienen alcance global; el resto queda acotado
// a las unidades de su ámbito.
async function autorizarSobreProyecto(
  proyectoId: string
): Promise<
  | { ok: true; sb: SupabaseClient; unidadId: string }
  | { ok: false; error: string }
> {
  const perfil = await getPerfilActual();
  if (!perfil) return { ok: false, error: "No autenticado" };
  if (!ROLES_EDICION_PROYECTO.includes(perfil.rol)) {
    return { ok: false, error: "Sin permisos sobre proyectos" };
  }
  const sb = await getSupabaseServer();
  const { data: py, error } = await sb
    .from("proyecto")
    .select("id, unidad_id")
    .eq("id", proyectoId)
    .is("deleted_at", null)
    .single();
  if (error || !py) return { ok: false, error: "Proyecto no encontrado" };
  const unidadId = (py as { unidad_id: string }).unidad_id;

  const alcanceGlobal = perfil.rol === "admin_funcional" || perfil.rol === "admin_tecnico";
  if (!alcanceGlobal) {
    const scope = new Set(await getScopeUnidades(perfil));
    if (!scope.has(unidadId)) {
      return { ok: false, error: "El proyecto no pertenece a tu ámbito" };
    }
  }
  return { ok: true, sb, unidadId };
}

export async function editarProyecto(input: { proyecto_id: string; nombre: string }) {
  if (!input.nombre?.trim()) {
    return { success: false, error: "El nombre del proyecto no puede quedar vacío" };
  }
  const auth = await autorizarSobreProyecto(input.proyecto_id);
  if (!auth.ok) return { success: false, error: auth.error };

  const { error } = await auth.sb
    .from("proyecto")
    .update({ nombre: input.nombre.trim() })
    .eq("id", input.proyecto_id);
  if (error) return { success: false, error: error.message };

  revalidatePath(`/proyectos/${input.proyecto_id}`);
  revalidatePath("/proyectos");
  revalidatePath("/dashboard");
  return { success: true };
}

// Borrado lógico del proyecto. Cascada a metas e indicadores para que no queden
// contando en los KPI globales del panel.
export async function eliminarProyecto(input: { proyecto_id: string }) {
  const auth = await autorizarSobreProyecto(input.proyecto_id);
  if (!auth.ok) return { success: false, error: auth.error };
  const sb = auth.sb;
  const ahora = new Date().toISOString();

  // Indicadores de las metas del proyecto
  const { data: metas } = await sb
    .from("meta")
    .select("id")
    .eq("proyecto_id", input.proyecto_id)
    .is("deleted_at", null);
  const metaIds = (metas ?? []).map((m) => (m as { id: string }).id);
  if (metaIds.length > 0) {
    const { error: errInd } = await sb
      .from("indicador")
      .update({ deleted_at: ahora })
      .in("meta_id", metaIds)
      .is("deleted_at", null);
    if (errInd) return { success: false, error: errInd.message };
  }

  const { error: errMeta } = await sb
    .from("meta")
    .update({ deleted_at: ahora })
    .eq("proyecto_id", input.proyecto_id)
    .is("deleted_at", null);
  if (errMeta) return { success: false, error: errMeta.message };

  const { error: errPy } = await sb
    .from("proyecto")
    .update({ deleted_at: ahora })
    .eq("id", input.proyecto_id);
  if (errPy) return { success: false, error: errPy.message };

  revalidatePath("/proyectos");
  revalidatePath("/dashboard");
  return { success: true };
}

export async function crearMeta(input: {
  proyecto_id: string;
  nombre: string;
  tipo_medicion?: "cuantitativo" | "cualitativo" | "hito_unico";
  unidad_medida?: string | null;
  valor_meta?: number | null;
  fecha_inicio?: string | null;
  fecha_limite?: string | null;
  peso?: number | null;
}) {
  const perfil = await getPerfilActual();
  if (!perfil) return { success: false, error: "No autenticado" };
  if (!["director", "subsecretario", "secretario", "coordinador", "admin_funcional"].includes(perfil.rol)) {
    return { success: false, error: "Sin permisos para crear metas" };
  }
  if (!input.nombre?.trim()) return { success: false, error: "El enunciado de la meta es obligatorio" };

  const sb = await getSupabaseServer();
  const { error } = await sb.from("meta").insert({
    proyecto_id: input.proyecto_id,
    nombre: input.nombre.trim(),
    tipo_medicion: input.tipo_medicion ?? "cuantitativo",
    unidad_medida: input.unidad_medida?.trim() || null,
    valor_meta: input.valor_meta ?? null,
    fecha_inicio: input.fecha_inicio || null,
    fecha_limite: input.fecha_limite || null,
    peso: input.peso ?? null,
    estado_semaforo: "sin_datos",
  });
  if (error) return { success: false, error: error.message };

  revalidatePath(`/proyectos/${input.proyecto_id}`);
  revalidatePath("/proyectos");
  return { success: true };
}

export async function editarMeta(input: {
  meta_id: string;
  proyecto_id: string;
  nombre?: string;
  unidad_medida?: string | null;
  valor_meta?: number | null;
  fecha_inicio?: string | null;
  fecha_limite?: string | null;
  peso?: number | null;
}) {
  const perfil = await getPerfilActual();
  if (!perfil) return { success: false, error: "No autenticado" };
  if (!["director", "subsecretario", "secretario", "coordinador", "admin_funcional"].includes(perfil.rol)) {
    return { success: false, error: "Sin permisos para editar metas" };
  }
  if (input.nombre !== undefined && !input.nombre.trim()) {
    return { success: false, error: "El enunciado no puede quedar vacío" };
  }

  const update: Record<string, unknown> = {};
  if (input.nombre !== undefined) update.nombre = input.nombre.trim();
  if (input.unidad_medida !== undefined) update.unidad_medida = input.unidad_medida?.trim() || null;
  if (input.valor_meta !== undefined) update.valor_meta = input.valor_meta;
  if (input.fecha_inicio !== undefined) update.fecha_inicio = input.fecha_inicio || null;
  if (input.fecha_limite !== undefined) update.fecha_limite = input.fecha_limite || null;
  if (input.peso !== undefined) update.peso = input.peso;

  const sb = await getSupabaseServer();
  const { error } = await sb.from("meta").update(update).eq("id", input.meta_id);
  if (error) return { success: false, error: error.message };

  revalidatePath(`/proyectos/${input.proyecto_id}`);
  revalidatePath("/proyectos");
  return { success: true };
}

export async function eliminarMeta(input: { meta_id: string; proyecto_id: string }) {
  const perfil = await getPerfilActual();
  if (!perfil) return { success: false, error: "No autenticado" };
  if (!["director", "subsecretario", "secretario", "coordinador", "admin_funcional"].includes(perfil.rol)) {
    return { success: false, error: "Sin permisos para eliminar metas" };
  }
  const sb = await getSupabaseServer();
  const { error } = await sb
    .from("meta")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", input.meta_id);
  if (error) return { success: false, error: error.message };
  revalidatePath(`/proyectos/${input.proyecto_id}`);
  revalidatePath("/proyectos");
  return { success: true };
}

// -------------------------------------------------------
// Server Actions: Alertas dentro del sistema (26.08)
// -------------------------------------------------------

/**
 * Manda un mensaje de alerta. El fan-out es explícito: se escribe una fila por
 * destinatario, también cuando va a todos. Devuelve a cuántos les llegó.
 *
 * `destinatarios: "todos"` = todos los perfiles ACTIVOS. Los inactivos quedan
 * afuera: no entran al sistema, así que una fila para ellos solo ensucia el
 * "a quién le llegó".
 */
export async function crearAlerta(input: {
  titulo: string;
  cuerpo: string;
  importante?: boolean;
  vigente_hasta?: string | null;
  destinatarios: "todos" | string[];
}) {
  let perfil;
  try {
    perfil = await requireRol("admin_funcional", "admin_tecnico");
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }

  const titulo = input.titulo.trim();
  const cuerpo = input.cuerpo.trim();
  if (!titulo) return { success: false, error: "El título es obligatorio." };
  if (titulo.length > 160) return { success: false, error: "El título no puede pasar de 160 caracteres." };
  if (!cuerpo) return { success: false, error: "El mensaje es obligatorio." };
  if (cuerpo.length > 2000) return { success: false, error: "El mensaje no puede pasar de 2000 caracteres." };
  if (input.vigente_hasta && !/^\d{4}-\d{2}-\d{2}$/.test(input.vigente_hasta)) {
    return { success: false, error: "La fecha de vigencia no es válida." };
  }

  const sb = await getSupabaseServer();

  // Los destinatarios se resuelven acá, contra la base, y no se toma la lista
  // que venga del cliente como verdad: si mandaron ids, se intersecan con los
  // perfiles activos que existen de verdad.
  let destinatarios: { user_id: string; email: string | null }[];
  if (input.destinatarios === "todos") {
    const { data, error } = await sb
      .from("perfil_usuario")
      .select("user_id, email")
      .eq("activo", true);
    if (error) return { success: false, error: error.message };
    destinatarios = (data ?? []) as { user_id: string; email: string | null }[];
  } else {
    const pedidos = [...new Set(input.destinatarios)].filter(Boolean);
    if (pedidos.length === 0) {
      return { success: false, error: "Elegí al menos un destinatario." };
    }
    const { data, error } = await sb
      .from("perfil_usuario")
      .select("user_id, email")
      .eq("activo", true)
      .in("user_id", pedidos);
    if (error) return { success: false, error: error.message };
    destinatarios = (data ?? []) as { user_id: string; email: string | null }[];
  }

  if (destinatarios.length === 0) {
    return { success: false, error: "No quedó ningún destinatario activo." };
  }
  const userIds = destinatarios.map((d) => d.user_id);

  const { data: alerta, error: errAlerta } = await sb
    .from("alerta")
    .insert({
      titulo,
      cuerpo,
      importante: input.importante ?? false,
      vigente_hasta: input.vigente_hasta || null,
      creado_por: perfil.user_id,
      creado_por_email: perfil.email,
      creado_por_nombre: perfil.nombre,
    })
    .select("id")
    .single();
  if (errAlerta || !alerta) {
    return { success: false, error: errAlerta?.message ?? "No se pudo crear la alerta." };
  }

  const alertaId = (alerta as { id: string }).id;
  const { error: errDest } = await sb
    .from("alerta_destinatario")
    .insert(userIds.map((user_id) => ({ alerta_id: alertaId, user_id })));

  if (errDest) {
    // Sin destinatarios la alerta no existe para nadie y además nadie la
    // podría ver para borrarla, así que se limpia antes de devolver el error.
    await sb.from("alerta").delete().eq("id", alertaId);
    return { success: false, error: `No se pudo repartir la alerta: ${errDest.message}` };
  }

  // ---- Correo (09.09, párrafo 735) ----
  // Va DESPUÉS de guardar y no puede tumbar nada: el aviso ya existe y se ve en
  // la campanita, que es como funcionaba hasta ahora. Si el correo no está
  // configurado o alguno rebota, se informa y listo — el aviso no se pierde.
  const { enviarCorreoAVarios, correoDeAviso } = await import("./correo");
  const correos = destinatarios
    .map((d) => d.email)
    .filter((e): e is string => !!e && e.includes("@"));

  const urlApp = process.env.PLANIA_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? null;
  const { asunto, texto, html } = correoDeAviso({
    titulo,
    cuerpo,
    importante: input.importante ?? false,
    deQuien: perfil.nombre ?? null,
    urlApp: urlApp ? `${urlApp.replace(/\/$/, "")}/dashboard` : null,
  });
  const correo = await enviarCorreoAVarios({ para: correos, asunto, texto, html });

  revalidatePath("/admin/alertas");
  revalidatePath("/dashboard");
  return {
    success: true,
    enviadas: userIds.length,
    correo: {
      configurado: correo.configurado,
      enviados: correo.enviados,
      sinCorreo: destinatarios.length - correos.length,
      error: correo.errores[0] ?? null,
    },
  };
}

/** Marca como leída una alerta propia. La RLS acota a las del usuario. */
export async function marcarAlertaLeida(alertaId: string) {
  const perfil = await getPerfilActual();
  if (!perfil) return { success: false, error: "No autenticado" };

  const sb = await getSupabaseServer();
  const { error } = await sb
    .from("alerta_destinatario")
    .update({ leida_at: new Date().toISOString() })
    .eq("alerta_id", alertaId)
    .eq("user_id", perfil.user_id)
    .is("leida_at", null);
  if (error) return { success: false, error: error.message };

  revalidatePath("/dashboard");
  return { success: true };
}

/** Marca como leídas todas las alertas propias sin leer. */
export async function marcarTodasLasAlertasLeidas() {
  const perfil = await getPerfilActual();
  if (!perfil) return { success: false, error: "No autenticado" };

  const sb = await getSupabaseServer();
  const { error } = await sb
    .from("alerta_destinatario")
    .update({ leida_at: new Date().toISOString() })
    .eq("user_id", perfil.user_id)
    .is("leida_at", null);
  if (error) return { success: false, error: error.message };

  revalidatePath("/dashboard");
  return { success: true };
}

/** Borra una alerta y, por cascada, sus destinatarios. Solo admins. */
export async function borrarAlerta(alertaId: string) {
  try {
    await requireRol("admin_funcional", "admin_tecnico");
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
  const sb = await getSupabaseServer();
  const { error } = await sb.from("alerta").delete().eq("id", alertaId);
  if (error) return { success: false, error: error.message };
  revalidatePath("/admin/alertas");
  revalidatePath("/dashboard");
  return { success: true };
}

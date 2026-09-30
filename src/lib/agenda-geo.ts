import { getSupabaseServer } from "@/lib/supabase/server";
import type { Actividad } from "@/lib/agenda-geo-comun";
import { faltantesDe, BUCKET_DOCUMENTOS } from "@/lib/agenda-geo-comun";

/**
 * Las consultas de la Agenda Georreferenciada.
 *
 * Los tipos, los estados y los colores estan en `agenda-geo-comun.ts`, que no
 * importa nada del server y por eso lo pueden usar los componentes de cliente.
 * Se reexportan desde aca para que las pantallas de servidor traigan todo de un
 * solo lugar.
 */
export * from "@/lib/agenda-geo-comun";

const COLUMNAS =
  "id, fecha, hora_desde, hora_hasta, titulo, descripcion, unidad_id, tipo, estado, " +
  "lugar_texto, lat, lng, requiere_confirmacion, proyecto_id, briefing, created_at, updated_at, " +
  "unidad:unidad_organizacional(nombre, nombre_corto)";

/* eslint-disable @typescript-eslint/no-explicit-any */
const aActividad = (f: any): Actividad => ({
  ...f,
  unidad_nombre: f.unidad?.nombre_corto ?? f.unidad?.nombre ?? null,
});

/** Las actividades de un rango de fechas, ordenadas como se leen: por día y hora. */
export async function getActividades(opciones: {
  desde: string;
  hasta: string;
  unidadId?: string;
  tipo?: string;
  estado?: string;
}): Promise<Actividad[]> {
  const sb = await getSupabaseServer();
  let q = sb
    .from("actividad")
    .select(COLUMNAS)
    .is("deleted_at", null)
    .gte("fecha", opciones.desde)
    .lte("fecha", opciones.hasta);

  if (opciones.unidadId) q = q.eq("unidad_id", opciones.unidadId);
  if (opciones.tipo) q = q.eq("tipo", opciones.tipo);
  if (opciones.estado) q = q.eq("estado", opciones.estado);

  const { data, error } = await q.order("fecha").order("hora_desde", { nullsFirst: true });
  if (error) throw error;
  return (data ?? []).map(aActividad);
}

/**
 * Una actividad con todo lo que necesita su ficha.
 *
 * Suma el nombre del proyecto del POA al que esta vinculada -la ficha lo
 * muestra, no un uuid- y descarta las dadas de baja: una actividad borrada no
 * tiene ficha, y devolverla haria que la pantalla la dejara editar.
 */
export async function getActividad(id: string): Promise<Actividad | null> {
  const sb = await getSupabaseServer();
  const { data, error } = await sb
    .from("actividad")
    .select(COLUMNAS + ", proyecto:proyecto(id, nombre, codigo)")
    .eq("id", id)
    .is("deleted_at", null)
    .single();
  if (error) return null;
  const a = aActividad(data);
  const p = (data as any).proyecto;
  return { ...a, proyecto_nombre: p ? [p.codigo, p.nombre].filter(Boolean).join(" · ") : null };
}

export interface CambioActividad {
  id: string;
  campo: string;
  valor_anterior: string | null;
  valor_nuevo: string | null;
  cambiado_por_email: string | null;
  created_at: string;
}

export async function getHistorial(actividadId: string): Promise<CambioActividad[]> {
  const sb = await getSupabaseServer();
  const { data, error } = await sb
    .from("actividad_historial")
    .select("id, campo, valor_anterior, valor_nuevo, cambiado_por_email, created_at")
    .eq("actividad_id", actividadId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) return [];
  return (data ?? []) as CambioActividad[];
}

/**
 * Los cuatro contadores de la cabecera.
 *
 * Una sola consulta y no cuatro: son cuatro recortes del mismo conjunto —lo que
 * pasa entre hoy y pasado mañana— y pedirlo cuatro veces es cuatro viajes para
 * contar lo mismo.
 */
export async function getResumen(hoy: string): Promise<{
  hoy: number;
  proximas48: number;
  porConfirmar: number;
  modificadas: number;
}> {
  const sb = await getSupabaseServer();
  const enDias = (n: number) => {
    const d = new Date(hoy + "T00:00:00");
    d.setDate(d.getDate() + n);
    return d.toISOString().slice(0, 10);
  };

  // Dos consultas: los tres contadores de la izquierda salen de lo que viene,
  // pero "modificadas hoy" no puede salir de ahi. Una actividad de marzo que
  // alguien toco recien tambien se modifico hoy, y con la ventana de tres dias
  // el numero no coincidia con la lista de "requiere atencion", que mira todo.
  // Dos carteles con el mismo rotulo y distinto numero se reportan como bug.
  const [propias, tocadas] = await Promise.all([
    sb
      .from("actividad")
      .select("fecha, estado, requiere_confirmacion")
      .is("deleted_at", null)
      .gte("fecha", hoy)
      .lte("fecha", enDias(2)),
    sb
      .from("actividad")
      .select("created_at, updated_at, estado")
      .is("deleted_at", null)
      .gte("updated_at", hoy)
      .limit(200),
  ]);
  const { data, error } = propias;
  if (error) return { hoy: 0, proximas48: 0, porConfirmar: 0, modificadas: 0 };

  const filas = (data ?? []) as any[];
  const vivas = filas.filter((f) => f.estado !== "suspendida");
  const modificadas = tocadas.error
    ? 0
    : ((tocadas.data ?? []) as any[]).filter(
        (f) => f.estado !== "suspendida" && f.updated_at > f.created_at
      ).length;
  return {
    hoy: vivas.filter((f) => f.fecha === hoy).length,
    proximas48: vivas.filter((f) => f.fecha > hoy).length,
    // "Pendientes de confirmación": las que lo piden y todavía no se confirmaron.
    porConfirmar: vivas.filter((f) => f.requiere_confirmacion && f.estado === "programada").length,
    modificadas,
  };
}

/**
 * Cuántas actividades hay cargadas, sin traerlas.
 *
 * Sirve para distinguir "todavía no cargó nadie nada" de "hoy no hay nada",
 * que en la pantalla de inicio son dos carteles distintos: el primero manda a
 * cargar la primera actividad y el segundo sería un error.
 */
export async function contarActividades(): Promise<number> {
  const sb = await getSupabaseServer();
  const { count, error } = await sb
    .from("actividad")
    .select("id", { count: "exact", head: true })
    .is("deleted_at", null);
  if (error) return 0;
  return count ?? 0;
}

/**
 * Lo que requiere atencion — etapa 5 del plan del 22.09.
 *
 * No se guarda en ninguna tabla: se calcula cada vez. Es el mismo criterio que
 * la alerta de indicadores por vencer, y por la misma razon —una actividad deja
 * de estar pendiente en el momento en que alguien la confirma, y una fila
 * guardada seguiria diciendo que si—.
 *
 * Dos consultas y no tres: "pendientes" e "incompletas" son dos recortes del
 * mismo conjunto, lo que viene de hoy en adelante. "Modificadas hoy" es otro
 * conjunto, porque una actividad de marzo que alguien toco recien tambien
 * cuenta.
 *
 * Lo pendiente y lo incompleto se miran de hoy en adelante a proposito: que a
 * una actividad de hace tres meses le falte el horario ya no lo arregla nadie, y
 * ponerla en una lista de tareas solo hace que la lista se ignore.
 */
export async function getRequierenAtencion(hoy: string): Promise<{
  pendientes: Actividad[];
  modificadas: Actividad[];
  incompletas: Actividad[];
}> {
  const sb = await getSupabaseServer();

  const [proximas, tocadas] = await Promise.all([
    sb
      .from("actividad")
      .select(COLUMNAS)
      .is("deleted_at", null)
      .gte("fecha", hoy)
      .neq("estado", "suspendida")
      .order("fecha")
      .order("hora_desde", { nullsFirst: true })
      .limit(500),
    sb
      .from("actividad")
      .select(COLUMNAS)
      .is("deleted_at", null)
      .gte("updated_at", hoy)
      .order("updated_at", { ascending: false })
      .limit(100),
  ]);

  if (proximas.error) throw proximas.error;

  const futuras = (proximas.data ?? []).map(aActividad);
  // `updated_at > created_at` separa lo modificado de lo recien creado. En un
  // alta las dos columnas quedan con el mismo now(), y solo el trigger
  // BEFORE UPDATE mueve la segunda. Sin esta linea una actividad cargada hoy
  // aparecia como "modificada hoy" y abajo decia "sin cambios registrados",
  // que es la propia pantalla desmintiendose.
  const modificadas = tocadas.error
    ? []
    : (tocadas.data ?? []).map(aActividad).filter((a) => a.updated_at > a.created_at);

  return {
    pendientes: futuras.filter((a) => a.requiere_confirmacion && a.estado === "programada"),
    modificadas,
    incompletas: futuras.filter((a) => faltantesDe(a).length > 0),
  };
}

/**
 * El historial de varias actividades de una sola vez.
 *
 * Una consulta con `in` en vez de una por actividad: la lista de modificadas
 * puede traer veinte y serian veinte viajes para mostrar una columna.
 */
export async function getHistorialDeVarias(
  ids: string[]
): Promise<Map<string, CambioActividad[]>> {
  const salida = new Map<string, CambioActividad[]>();
  if (ids.length === 0) return salida;

  const sb = await getSupabaseServer();
  const { data, error } = await sb
    .from("actividad_historial")
    .select("id, actividad_id, campo, valor_anterior, valor_nuevo, cambiado_por_email, created_at")
    .in("actividad_id", ids)
    .order("created_at", { ascending: false })
    .limit(300);
  if (error) return salida;

  for (const fila of (data ?? []) as (CambioActividad & { actividad_id: string })[]) {
    const lista = salida.get(fila.actividad_id) ?? [];
    lista.push(fila);
    salida.set(fila.actividad_id, lista);
  }
  return salida;
}

export interface DocumentoActividad {
  id: string;
  nombre: string;
  ruta: string;
  tipo_mime: string | null;
  tamano_bytes: number | null;
  subido_por_email: string | null;
  created_at: string;
  /** Enlace firmado que vence. Null si no se pudo generar. */
  url: string | null;
}

/**
 * Los documentos de una actividad, con su enlace para bajarlos.
 *
 * El bucket es privado, asi que no hay URL publica: cada archivo se sirve con
 * un enlace firmado que vence en una hora. Un briefing de una actividad de la
 * Intendenta no puede quedar accesible para cualquiera que adivine la
 * direccion.
 *
 * Los enlaces se piden todos juntos con `createSignedUrls`, que acepta una
 * lista: uno por archivo serian ocho viajes para mostrar ocho renglones.
 *
 * Devuelve lista vacia ante cualquier error en vez de tirar: la migracion 055
 * puede no estar aplicada todavia, y que falte el adjunto no tiene que voltear
 * la ficha entera.
 */
export async function getDocumentos(actividadId: string): Promise<DocumentoActividad[]> {
  const sb = await getSupabaseServer();
  const { data, error } = await sb
    .from("actividad_documento")
    .select("id, nombre, ruta, tipo_mime, tamano_bytes, subido_por_email, created_at")
    .eq("actividad_id", actividadId)
    .order("created_at", { ascending: false });
  if (error || !data || data.length === 0) return [];

  const filas = data as Omit<DocumentoActividad, "url">[];
  const firmados = await sb.storage
    .from(BUCKET_DOCUMENTOS)
    .createSignedUrls(filas.map((f) => f.ruta), 3600);

  const porRuta = new Map<string, string>();
  for (const f of firmados.data ?? []) {
    if (f.path && f.signedUrl) porRuta.set(f.path, f.signedUrl);
  }
  return filas.map((f) => ({ ...f, url: porRuta.get(f.ruta) ?? null }));
}

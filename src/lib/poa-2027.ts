import { getSupabaseServer } from "@/lib/supabase/server";

/**
 * El circuito del POA 2027 — 25.09.
 *
 * "Las POA se arman por secretarías: cada secretaría toma los proyectos suyos y
 * de cada dirección que depende de ella". Y el camino es escalonado: "las
 * direcciones que dependan de una subsecretaría mandan sus POAs a las
 * subsecretarías; después las subsecretarías mandan su POA a la secretaría. Si
 * no existe ese peldaño medio, las direcciones mandan directo a la secretaría."
 *
 * A quién se le manda no está guardado en ningún lado: es el padre en el
 * organigrama. Por eso todo acá se resuelve caminando el árbol.
 */

export const ANIO_POA = 2027;

/**
 * Los párrafos de cada proyecto, con los nombres del POA real.
 *
 * 28.09: "fijate que el formato en el que aparecen los proyectos no son fichas,
 * están como redactados". Medido sobre los 366 proyectos de los ocho libros de
 * 2026, cada uno se lee así: título, descripción y objetivo, período de trabajo,
 * línea de base y meta. Las letras de PRISMA quedaron atrás — son la misma
 * información con otro nombre.
 *
 * Lo usan la pantalla y el Word (08.10): los dos tienen que decir lo mismo.
 */
export const PARRAFOS_POA = [
  { rotulo: "Descripción y objetivo", campo: "relevancia" as const },
  { rotulo: "Período de trabajo", campo: "periodo" as const },
  { rotulo: "Hito", campo: "hito" as const },
  { rotulo: "Línea de base", campo: "ancla" as const },
  { rotulo: "Meta", campo: "meta_anual" as const },
  { rotulo: "Indicador", campo: "indicador" as const },
];

/**
 * Lo que el POA de un área lleva además de los proyectos — 08.10, migración 057.
 *
 * "Algunas POAs tienen introducciones porque son necesarias antes de los
 * proyectos [...] Lo mismo pregunto sobre los bancos de ideas que van al final
 * de cada dirección." Una introducción va antes de los proyectos del área y una
 * idea va después, en el banco de ideas. Las dos son un título y un texto.
 */
export type TipoTextoPoa = "introduccion" | "idea";

export interface TextoPoa {
  id: string;
  unidad_id: string;
  tipo: TipoTextoPoa;
  titulo: string | null;
  texto: string | null;
  orden: number;
  updated_at: string;
}

export interface FichaConArea {
  id: string;
  codigo: string | null;
  programa: string;
  relevancia: string | null;
  indicador: string | null;
  meta_anual: string | null;
  ancla: string | null;
  /** Periodo de trabajo y hito: el POA real los usa y PRISMA no los tenia (28.09). */
  periodo: string | null;
  hito: string | null;
  /** propuesta = la trajo el sistema del 2026 y espera que el area la acepte. */
  estado: string;
  proyecto_origen_id: string | null;
  unidad_id: string;
  unidad_nombre: string;
  updated_at: string;
  observaciones: number;
}

export interface AreaDelPoa {
  id: string;
  nombre: string;
  nivel: number;
  parent_id: string | null;
  /** Si ya mandó su POA hacia arriba. */
  enviado: boolean;
  enviado_at: string | null;
  fichas: FichaConArea[];
  /** Lo que va antes de los proyectos y lo que va en el banco de ideas (08.10). */
  introducciones: TextoPoa[];
  ideas: TextoPoa[];
  /** true si tocó alguna ficha —o un texto— después de haber enviado. */
  tocadoDespues: boolean;
}

/**
 * Los textos de unas áreas, ordenados.
 *
 * Si la tabla todavía no existe —el código se despliega solo y la migración
 * 057 se aplica a mano— devuelve vacío en vez de romper el POA entero: sin
 * textos el documento sigue siendo el de antes.
 */
export async function getTextosPoa(unidadIds: string[]): Promise<TextoPoa[]> {
  if (unidadIds.length === 0) return [];
  const sb = await getSupabaseServer();
  const { data, error } = await sb
    .from("poa_texto")
    .select("id, unidad_id, tipo, titulo, texto, orden, updated_at")
    .in("unidad_id", unidadIds)
    .eq("anio", ANIO_POA)
    .is("deleted_at", null)
    .order("orden")
    .order("created_at");
  if (error) return [];
  return (data ?? []) as TextoPoa[];
}

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Todas las unidades de las que cuelga —directa o indirectamente— la de arriba. */
function descendientes(unidades: any[], raizId: string): any[] {
  const salida: any[] = [];
  const bajar = (id: string) => {
    for (const u of unidades.filter((x) => x.parent_id === id)) {
      salida.push(u);
      bajar(u.id);
    }
  };
  bajar(raizId);
  return salida;
}

/**
 * El POA de un área: lo suyo y lo que le mandaron desde abajo.
 *
 * Trae TODO el subárbol y no solo los hijos directos. Una secretaría con
 * subsecretarías ve las direcciones también: el escalón es para el circuito de
 * envío, no para esconder el contenido — al final el documento de la secretaría
 * los lleva a todos adentro.
 */
export async function getPoaDelArea(unidadId: string): Promise<{
  propia: AreaDelPoa | null;
  recibidas: AreaDelPoa[];
  /** A quién le manda esta área su POA. null si es una secretaría. */
  destino: { id: string; nombre: string } | null;
}> {
  const sb = await getSupabaseServer();

  const { data: unidadesData } = await sb
    .from("unidad_organizacional")
    .select("id, nombre, nombre_corto, nivel, parent_id")
    .eq("activa", true);
  const unidades = (unidadesData ?? []) as any[];
  const porId = new Map(unidades.map((u) => [u.id, u]));
  const propia = porId.get(unidadId);
  if (!propia) return { propia: null, recibidas: [], destino: null };

  const abajo = descendientes(unidades, unidadId);
  const ids = [unidadId, ...abajo.map((u) => u.id)];

  const [fichasRes, estadosRes, obsRes, textos] = await Promise.all([
    sb
      .from("ficha_prisma")
      .select(
        "id, codigo, programa, relevancia, indicador, meta_anual, ancla, periodo, hito, " +
          "estado, proyecto_origen_id, unidad_id, updated_at"
      )
      .in("unidad_id", ids)
      .is("deleted_at", null)
      .order("created_at"),
    sb.from("poa_area").select("unidad_id, estado, enviado_at").eq("anio", ANIO_POA).in("unidad_id", ids),
    sb.from("ficha_observacion").select("ficha_id").is("resuelta_at", null),
    getTextosPoa(ids),
  ]);

  const fichas = (fichasRes.data ?? []) as any[];
  const estados = new Map(
    ((estadosRes.data ?? []) as any[]).map((e) => [e.unidad_id, e])
  );
  const obsPorFicha = new Map<string, number>();
  for (const o of (obsRes.data ?? []) as any[]) {
    obsPorFicha.set(o.ficha_id, (obsPorFicha.get(o.ficha_id) ?? 0) + 1);
  }

  const nombreDe = (u: any) => u.nombre_corto ?? u.nombre;

  const armar = (u: any): AreaDelPoa => {
    const estado = estados.get(u.id);
    const suyas = fichas
      // El documento lleva solo lo ACEPTADO: una propuesta que el area todavia
      // no miro no es parte de su POA (28.09).
      .filter((f) => f.unidad_id === u.id && f.estado === "aceptada")
      .map((f) => ({
        ...f,
        unidad_nombre: nombreDe(u),
        observaciones: obsPorFicha.get(f.id) ?? 0,
      })) as FichaConArea[];
    const enviadoAt = estado?.enviado_at ?? null;
    const susTextos = textos.filter((t) => t.unidad_id === u.id);
    return {
      id: u.id,
      nombre: nombreDe(u),
      nivel: u.nivel,
      parent_id: u.parent_id,
      enviado: estado?.estado === "enviado",
      enviado_at: enviadoAt,
      fichas: suyas,
      introducciones: susTextos.filter((t) => t.tipo === "introduccion"),
      ideas: susTextos.filter((t) => t.tipo === "idea"),
      // La ficha sigue editable después de enviada, así que esto es lo único
      // que le avisa a quien recibe que algo cambió abajo de sus pies.
      tocadoDespues:
        !!enviadoAt &&
        [...suyas, ...susTextos].some((f) => f.updated_at > enviadoAt),
    };
  };

  const padre = propia.parent_id ? porId.get(propia.parent_id) : null;

  return {
    propia: armar(propia),
    // Solo las que tienen algo que mostrar: un área sin fichas ni envío no le
    // dice nada a nadie y llenaría la pantalla de filas vacías.
    recibidas: abajo
      .map(armar)
      .filter((a) => a.fichas.length > 0 || a.introducciones.length > 0 || a.ideas.length > 0 || a.enviado)
      .sort((a, b) => a.nivel - b.nivel || a.nombre.localeCompare(b.nombre, "es")),
    destino: padre ? { id: padre.id, nombre: nombreDe(padre) } : null,
  };
}

export interface Observacion {
  id: string;
  ficha_id: string;
  texto: string;
  autor_email: string | null;
  created_at: string;
  resuelta_at: string | null;
}

export async function getObservaciones(fichaIds: string[]): Promise<Observacion[]> {
  if (fichaIds.length === 0) return [];
  const sb = await getSupabaseServer();
  const { data } = await sb
    .from("ficha_observacion")
    .select("id, ficha_id, texto, autor_email, created_at, resuelta_at")
    .in("ficha_id", fichaIds)
    .order("created_at", { ascending: false });
  return (data ?? []) as Observacion[];
}

/**
 * Las fichas del area propia, aceptadas y propuestas — 28.09.
 *
 * Es lo que necesita la pantalla de "Editar mi POA": el documento muestra solo
 * lo aceptado, pero para editar hace falta ver tambien lo que el sistema trajo
 * del 2026 y todavia nadie miro.
 */
export async function getMisFichas(unidadId: string): Promise<FichaConArea[]> {
  const sb = await getSupabaseServer();
  const [fichasRes, obsRes, unidadRes] = await Promise.all([
    sb
      .from("ficha_prisma")
      .select(
        "id, codigo, programa, relevancia, indicador, meta_anual, ancla, periodo, hito, " +
          "estado, proyecto_origen_id, unidad_id, updated_at"
      )
      .eq("unidad_id", unidadId)
      .eq("anio", ANIO_POA)
      .is("deleted_at", null)
      .order("estado")
      .order("programa"),
    sb.from("ficha_observacion").select("ficha_id").is("resuelta_at", null),
    sb.from("unidad_organizacional").select("nombre, nombre_corto").eq("id", unidadId).single(),
  ]);

  const obs = new Map<string, number>();
  for (const o of (obsRes.data ?? []) as any[]) obs.set(o.ficha_id, (obs.get(o.ficha_id) ?? 0) + 1);
  const u = unidadRes.data as any;
  const nombre = u?.nombre_corto ?? u?.nombre ?? "";

  return ((fichasRes.data ?? []) as any[]).map((f) => ({
    ...f,
    unidad_nombre: nombre,
    observaciones: obs.get(f.id) ?? 0,
  }));
}

export interface ResumenAreaPoa {
  unidad_id: string;
  nombre: string;
  /** La secretaría de la que cuelga, para agruparlas como en Proyectos (06.10). */
  secretaria: string | null;
  /** Proyectos activos del 2026 que tiene el área. */
  proyectos2026: number;
  aceptadas: number;
  propuestas: number;
  /** Proyectos del 2026 que todavía no se trajeron como propuesta. */
  sinTraer: number;
}

/**
 * Cómo está el POA 2027 de cada área, para Planificación Estratégica — 05.10.
 *
 * "Desde allí deberíamos poder ver todas las áreas." Es lo que ve Planificación
 * al entrar al POA 2027, que hasta hoy le mostraba "tu perfil no tiene un área
 * asignada" y le pedía que le escribiera a Planificación Estratégica.
 *
 * Solo cuenta; no trae el texto de las fichas. Las áreas sin un solo proyecto
 * del 2026 y sin fichas no aparecen: no tienen nada que mostrar.
 */
export async function getResumenPoaParaPlanificacion(): Promise<{
  areas: ResumenAreaPoa[];
  sinTraer: number;
  areasSinTraer: number;
}> {
  const sb = await getSupabaseServer();

  // Paginado: PostgREST corta en 1000 filas.
  const proyectos: { id: string; unidad_id: string | null }[] = [];
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await sb
      .from("proyecto")
      .select("id, unidad_id")
      .eq("estado", "activo")
      .is("deleted_at", null)
      .range(desde, desde + 999);
    if (error) throw error;
    proyectos.push(...((data ?? []) as typeof proyectos));
    if (!data || data.length < 1000) break;
  }

  const [{ data: fichas, error: eF }, { data: unidades, error: eU }] = await Promise.all([
    sb
      .from("ficha_prisma")
      .select("unidad_id, estado, proyecto_origen_id")
      .eq("anio", ANIO_POA)
      .is("deleted_at", null),
    sb.from("unidad_organizacional").select("id, nombre, nombre_corto, nivel, parent_id"),
  ]);
  if (eF) throw eF;
  if (eU) throw eU;

  type U = { id: string; nombre: string; nombre_corto: string | null; nivel: number; parent_id: string | null };
  const lasUnidades = (unidades ?? []) as U[];
  const nombre = new Map(lasUnidades.map((u) => [u.id, u.nombre_corto ?? u.nombre]));
  const porId = new Map(lasUnidades.map((u) => [u.id, u]));
  // Se sube por el organigrama hasta el nivel 0. Una secretaría es su propia
  // secretaría.
  const secretariaDe = (id: string): string | null => {
    let u = porId.get(id);
    for (let i = 0; u && u.nivel > 0 && i < 10; i++) u = u.parent_id ? porId.get(u.parent_id) : undefined;
    return u && u.nivel === 0 ? u.nombre_corto ?? u.nombre : null;
  };
  const traidos = new Set(
    ((fichas ?? []) as { proyecto_origen_id: string | null }[])
      .map((f) => f.proyecto_origen_id)
      .filter(Boolean)
  );

  const porArea = new Map<string, ResumenAreaPoa>();
  const de = (id: string) => {
    let a = porArea.get(id);
    if (!a) {
      a = { unidad_id: id, nombre: nombre.get(id) ?? "(área desconocida)", secretaria: secretariaDe(id), proyectos2026: 0, aceptadas: 0, propuestas: 0, sinTraer: 0 };
      porArea.set(id, a);
    }
    return a;
  };
  for (const p of proyectos) {
    if (!p.unidad_id) continue;
    const a = de(p.unidad_id);
    a.proyectos2026++;
    if (!traidos.has(p.id)) a.sinTraer++;
  }
  for (const f of (fichas ?? []) as { unidad_id: string; estado: string }[]) {
    const a = de(f.unidad_id);
    if (f.estado === "aceptada") a.aceptadas++;
    else a.propuestas++;
  }

  // Primero las que tienen algo pendiente, de más a menos; después el resto.
  const areas = [...porArea.values()].sort(
    (a, b) => b.sinTraer - a.sinTraer || a.nombre.localeCompare(b.nombre, "es")
  );
  return {
    areas,
    sinTraer: areas.reduce((s, a) => s + a.sinTraer, 0),
    areasSinTraer: areas.filter((a) => a.sinTraer > 0).length,
  };
}

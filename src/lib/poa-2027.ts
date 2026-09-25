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

export interface FichaConArea {
  id: string;
  codigo: string | null;
  programa: string;
  relevancia: string | null;
  indicador: string | null;
  meta_anual: string | null;
  ancla: string | null;
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
  /** true si tocó alguna ficha después de haber enviado. */
  tocadoDespues: boolean;
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

  const [fichasRes, estadosRes, obsRes] = await Promise.all([
    sb
      .from("ficha_prisma")
      .select("id, codigo, programa, relevancia, indicador, meta_anual, ancla, unidad_id, updated_at")
      .in("unidad_id", ids)
      .is("deleted_at", null)
      .order("created_at"),
    sb.from("poa_area").select("unidad_id, estado, enviado_at").eq("anio", ANIO_POA).in("unidad_id", ids),
    sb.from("ficha_observacion").select("ficha_id").is("resuelta_at", null),
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
      .filter((f) => f.unidad_id === u.id)
      .map((f) => ({
        ...f,
        unidad_nombre: nombreDe(u),
        observaciones: obsPorFicha.get(f.id) ?? 0,
      })) as FichaConArea[];
    const enviadoAt = estado?.enviado_at ?? null;
    return {
      id: u.id,
      nombre: nombreDe(u),
      nivel: u.nivel,
      parent_id: u.parent_id,
      enviado: estado?.estado === "enviado",
      enviado_at: enviadoAt,
      fichas: suyas,
      // La ficha sigue editable después de enviada, así que esto es lo único
      // que le avisa a quien recibe que algo cambió abajo de sus pies.
      tocadoDespues: !!enviadoAt && suyas.some((f) => f.updated_at > enviadoAt),
    };
  };

  const padre = propia.parent_id ? porId.get(propia.parent_id) : null;

  return {
    propia: armar(propia),
    // Solo las que tienen algo que mostrar: un área sin fichas ni envío no le
    // dice nada a nadie y llenaría la pantalla de filas vacías.
    recibidas: abajo
      .map(armar)
      .filter((a) => a.fichas.length > 0 || a.enviado)
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

/**
 * Plan Rector: lectura de la jerarquía y de las imputaciones de proyectos.
 *
 * La jerarquía tiene cuatro niveles y vive en una sola tabla con `parent_id`,
 * igual que `unidad_organizacional`:
 *   área de intervención (5) → eje (17) → objetivo (19) → línea (63)
 * Los ODS cuelgan del eje, no de la línea: así viene el documento.
 *
 * Desde el 09.09 SÍ se calcula el avance (párrafo 703: "que se realice la
 * medición en base a los ámbitos [...] pero no saquen las líneas estratégicas,
 * déjenlas escritas, solo no las miden"). Era la definición que faltaba: el
 * nivel al que había que medir. Se calcula para todo el árbol y la pantalla lo
 * muestra solo en el ámbito.
 *
 * Sigue abierto a qué hacer si un proyecto cuelga de varios ejes y si "sin
 * vínculo" es una respuesta válida. Ver PLAN_RECTOR.md.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
// Las filas que devuelve PostgREST con embeds vienen sin tipar; se validan al
// mapearlas.
import { cache } from "react";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  rotuloCorto,
  avancePlanRector,
  type TipoNodoRector,
  type NodoRector,
  type NodoRectorArbol,
  type ImputacionProyecto,
  type ProyectoImputado,
  type PropuestaPendiente,
} from "./plan-rector-comun";
import {
  avanceAgregado,
  avanceMetaEnPlazo,
  calcularPorcentajeMeta,
  estadoDeAvance,
} from "./utils";

// Los tipos y los helpers puros viven en plan-rector-comun.ts para que los
// componentes con "use client" puedan importarlos sin arrastrar este módulo
// (que usa getSupabaseServer) al bundle del browser.
export type {
  TipoNodoRector, EstadoVinculoRector, NodoRector, NodoRectorArbol, ImputacionProyecto,
  ProyectoImputado, PropuestaPendiente,
} from "./plan-rector-comun";
export { recortar, rotuloCorto, rotuloCobertura, colorAmbito } from "./plan-rector-comun";

/**
 * true si el error es "esa tabla no existe".
 *
 * El código se despliega solo (Vercel sigue a `main`) y las migraciones las
 * aplica una persona aparte, así que entre un deploy y el otro paso hay una
 * ventana en la que estas tablas no existen todavía. Sin esto, `/plan-rector`
 * tiraría 500 y la ficha de cualquier proyecto se caería con ella.
 *
 * 42P01 es `undefined_table` de Postgres; PGRST205 es lo que devuelve PostgREST
 * cuando la tabla no está en su schema cache.
 */
function tablaInexistente(e: unknown): boolean {
  const err = e as { code?: string; message?: string } | null;
  if (!err) return false;
  return (
    err.code === "42P01" ||
    err.code === "PGRST205" ||
    /relation .* does not exist|could not find the table/i.test(err.message ?? "")
  );
}

const ARBOL_VACIO = { arbol: [] as NodoRectorArbol[], totalNodos: 0 };

/**
 * El avance de un conjunto de proyectos, con la cascada del sistema.
 *
 * Usa exactamente las mismas funciones que el Panel Ejecutivo, la TV, la lista
 * de Proyectos, las fotos de corte y el reporte trimestral:
 * `avanceMetaEnPlazo` → `avanceAgregado` → `estadoDeAvance`. El avance de CADA
 * proyecto es el mismo en todas las pantallas. Lo que el Plan Rector hace
 * distinto desde el 13.10 es el promedio: deja afuera a los no iniciados (ver
 * avancePlanRector).
 *
 * Devuelve un Map solo con los proyectos que siguen VIVOS (activos, no
 * borrados, del período en curso). Un vínculo a un proyecto que salió del POA
 * no aparece, así que no infla ni ensucia el promedio del ámbito.
 */
async function avanceDeProyectosImputados(
  supabase: Awaited<ReturnType<typeof getSupabaseServer>>,
  proyectoIds: string[]
): Promise<Map<string, ProyectoImputado>> {
  const salida = new Map<string, ProyectoImputado>();
  const ids = [...new Set(proyectoIds)];
  if (ids.length === 0) return salida;

  const { data: periodo } = await supabase
    .from("periodo")
    .select("id")
    .eq("activo", true)
    .maybeSingle();
  if (!periodo) return salida;

  const { data: pys } = await supabase
    .from("proyecto")
    .select("id, codigo, nombre, unidad_id, unidad:unidad_organizacional(nombre_corto, nombre)")
    .in("id", ids)
    .eq("periodo_id", (periodo as { id: string }).id)
    .eq("estado", "activo")
    .is("deleted_at", null);

  const vivos = (pys ?? []) as any[];
  if (vivos.length === 0) return salida;
  const idsVivos = vivos.map((p) => p.id as string);

  // La ruta de cada unidad en el organigrama, para poder ordenar los proyectos
  // agrupados por área (15.09, párrafo 1011).
  const { data: unis } = await supabase
    .from("unidad_organizacional")
    .select("id, parent_id, nivel, orden, nombre, nombre_corto");
  const uMap = new Map(((unis ?? []) as any[]).map((u) => [u.id as string, u]));
  const rutaDe = (unidadId: string | null): string => {
    const partes: string[] = [];
    let u = unidadId ? uMap.get(unidadId) : null;
    // Se sube hasta la raíz y se arma la ruta al revés, con el `orden` de cada
    // nivel rellenado a cuatro dígitos para que 2 no quede después de 10.
    let guarda = 0;
    while (u && guarda++ < 10) {
      partes.unshift(String(u.orden ?? 0).padStart(4, "0") + "·" + (u.nombre_corto ?? u.nombre ?? ""));
      u = u.parent_id ? uMap.get(u.parent_id) : null;
    }
    return partes.join("/");
  };

  const [metasRes, indRes] = await Promise.all([
    supabase
      .from("meta")
      .select(
        "id, proyecto_id, tipo_medicion, valor_actual, valor_meta, valor_linea_base, nivel_actual, escala_cualitativa, metadata, fecha_inicio, fecha_limite"
      )
      .in("proyecto_id", idsVivos)
      .is("deleted_at", null),
    supabase
      .from("indicador")
      .select(
        "id, meta_id, valor_actual, valor_objetivo, valor_actual_texto, estado_semaforo, metadata"
      )
      .is("deleted_at", null),
  ]);

  const metas = (metasRes.data ?? []) as any[];
  const metaIds = new Set(metas.map((m) => m.id as string));
  const indPorMeta = new Map<string, any[]>();
  for (const i of (indRes.data ?? []) as any[]) {
    if (!metaIds.has(i.meta_id)) continue;
    if (!indPorMeta.has(i.meta_id)) indPorMeta.set(i.meta_id, []);
    indPorMeta.get(i.meta_id)!.push(i);
  }
  const metasPorPy = new Map<string, any[]>();
  for (const m of metas) {
    if (!metasPorPy.has(m.proyecto_id)) metasPorPy.set(m.proyecto_id, []);
    metasPorPy.get(m.proyecto_id)!.push(m);
  }

  // Mismo `hoy` que el Panel Ejecutivo y la lista de Proyectos, a propósito: si
  // acá fuera `hoyLocal()` las pantallas discreparían entre las 21 y las 24 de
  // Tucumán. La zona horaria es un arreglo aparte, y afecta a seis pantallas.
  const hoy = new Date().toISOString().slice(0, 10);

  for (const p of vivos) {
    const pcts = (metasPorPy.get(p.id) ?? []).map(
      (m) =>
        avanceMetaEnPlazo(
          indPorMeta.get(m.id) ?? [],
          calcularPorcentajeMeta(m),
          { fecha_inicio: m.fecha_inicio, fecha_limite: m.fecha_limite },
          hoy
        ).pct
    );
    const av = avanceAgregado(pcts);
    salida.set(p.id as string, {
      id: p.id as string,
      codigo: (p.codigo as string | null) ?? null,
      nombre: p.nombre as string,
      unidad_nombre: p.unidad?.nombre_corto ?? p.unidad?.nombre ?? null,
      orden_area: rutaDe(p.unidad_id ?? null),
      pct: av.conDatos === 0 ? null : av.pct,
      estado: (av.conDatos === 0 ? "sin_datos" : av.estado) as ProyectoImputado["estado"],
    });
  }

  return salida;
}

// ---------------------------------------------------------------------------
// Jerarquía
// ---------------------------------------------------------------------------

/**
 * Árbol completo con el conteo de proyectos imputados por nodo.
 *
 * Son 104 nodos: se traen todos de una y se arma el árbol en memoria, que es
 * más barato que cuatro consultas anidadas.
 */
export const getPlanRectorArbol = cache(async function getPlanRectorArbol(): Promise<{
  arbol: NodoRectorArbol[];
  totalNodos: number;
}> {
  const supabase = await getSupabaseServer();

  const [nodosRes, odsRes, vinculosRes] = await Promise.all([
    supabase
      .from("plan_rector_nodo")
      .select("id, parent_id, tipo, nivel, clave_estable, codigo_cliente, nombre, nombre_corto, orden, activa")
      .eq("activa", true)
      .order("nivel")
      .order("orden"),
    supabase
      .from("pr_eje_ods")
      .select("nodo_id, ods:ods(numero, nombre)"),
    // Solo los confirmados cuentan como imputación firme. Los propuestos se
    // muestran aparte, en la pantalla de imputación.
    supabase
      .from("proyecto_plan_rector")
      .select("nodo_id, proyecto_id")
      .eq("estado", "confirmado"),
  ]);

  if (nodosRes.error) {
    if (tablaInexistente(nodosRes.error)) return ARBOL_VACIO;
    throw nodosRes.error;
  }

  const nodos = (nodosRes.data ?? []) as NodoRector[];

  const odsPorNodo = new Map<string, { numero: number; nombre: string }[]>();
  for (const fila of (odsRes.data ?? []) as any[]) {
    const o = fila.ods;
    if (!o) continue;
    if (!odsPorNodo.has(fila.nodo_id)) odsPorNodo.set(fila.nodo_id, []);
    odsPorNodo.get(fila.nodo_id)!.push({ numero: o.numero, nombre: o.nombre });
  }
  for (const lista of odsPorNodo.values()) lista.sort((a, b) => a.numero - b.numero);

  // Los proyectos imputados, con su avance. 09.09, párrafos 694 y 703: hay que
  // poder ver qué proyectos contiene cada nodo y medir el avance del ámbito.
  const vinculos = (vinculosRes.data ?? []) as { nodo_id: string; proyecto_id: string }[];
  const proyectosPorNodo = await avanceDeProyectosImputados(
    supabase,
    vinculos.map((v) => v.proyecto_id)
  );

  const imputadosPorNodo = new Map<string, number>();
  const listaPorNodo = new Map<string, ProyectoImputado[]>();
  for (const v of vinculos) {
    const py = proyectosPorNodo.get(v.proyecto_id);
    // Un vínculo a un proyecto que ya no está activo o fue borrado no cuenta:
    // el ámbito no puede mostrar avance de algo que salió del POA.
    if (!py) continue;
    imputadosPorNodo.set(v.nodo_id, (imputadosPorNodo.get(v.nodo_id) ?? 0) + 1);
    if (!listaPorNodo.has(v.nodo_id)) listaPorNodo.set(v.nodo_id, []);
    listaPorNodo.get(v.nodo_id)!.push(py);
  }
  // 15.09, parrafo 1011: agrupados por area siguiendo el organigrama, y dentro
  // de cada area por nombre de proyecto.
  for (const lista of listaPorNodo.values()) {
    lista.sort(
      (a, b) =>
        a.orden_area.localeCompare(b.orden_area, "es") ||
        a.nombre.localeCompare(b.nombre, "es")
    );
  }

  // Índice y armado del árbol.
  const porId = new Map<string, NodoRectorArbol>();
  for (const n of nodos) {
    porId.set(n.id, {
      ...n,
      hijos: [],
      ods: odsPorNodo.get(n.id) ?? [],
      imputados: imputadosPorNodo.get(n.id) ?? 0,
      imputadosSubarbol: 0,
      proyectos: listaPorNodo.get(n.id) ?? [],
      pct: null,
      estado: "sin_datos",
    });
  }
  const raices: NodoRectorArbol[] = [];
  for (const n of porId.values()) {
    if (n.parent_id) {
      // Si el padre está inactivo no viene en la consulta: el hijo se cuelga de
      // la raíz en vez de desaparecer, así una baja a medias se ve.
      const padre = porId.get(n.parent_id);
      if (padre) padre.hijos.push(n);
      else raices.push(n);
    } else {
      raices.push(n);
    }
  }

  const ordenar = (lista: NodoRectorArbol[]) => {
    lista.sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre, "es"));
    for (const n of lista) ordenar(n.hijos);
  };
  ordenar(raices);

  // Acumulado del subárbol, de abajo hacia arriba: la cantidad de proyectos y
  // el avance.
  //
  // El avance del ámbito es el PROMEDIO SIMPLE de los porcentajes de los
  // proyectos que cuelgan de él, sin ponderar por cantidad.
  //
  // Desde el 13.10 entran solo los que tienen avance registrado: los sin datos
  // y los no iniciados quedan afuera ("no se contabilizan en el promedio", el
  // texto del indicador que escribió Planificación). Hasta ese día era la misma
  // cuenta que el Panel, con los no iniciados como 0 %; ahora el Plan Rector
  // tiene la suya, y para los mismos proyectos da más alto. Ver
  // avancePlanRector.
  const acumular = (n: NodoRectorArbol): ProyectoImputado[] => {
    const propios = n.proyectos;
    const deHijos = n.hijos.flatMap((h) => acumular(h));
    const todos = [...propios, ...deHijos];
    n.imputadosSubarbol = todos.length;
    n.pct = avancePlanRector(todos.map((p) => p.pct)).pct;
    // El cast es porque EstadoSemaforo incluye "gris", que estadoDeAvance no
    // devuelve nunca: es para nodos inactivos y acá no hay.
    n.estado = estadoDeAvance(n.pct) as NodoRectorArbol["estado"];
    return todos;
  };
  for (const r of raices) acumular(r);

  return { arbol: raices, totalNodos: nodos.length };
});

/**
 * Las propuestas sin confirmar, agrupadas por eje.
 *
 * 11.09: Planificación pidió asociar los proyectos a los ejes, "los que se pueda,
 * el resto lo hacemos a mano". Son 441 proyectos y hasta ahora la única forma de
 * confirmar era abrir la ficha de cada uno. Esta es la lectura que alimenta la
 * pantalla de revisión en lote.
 *
 * Solo trae proyectos que NO tienen ya una imputación confirmada: lo que falta
 * decidir, no lo ya decidido.
 */
export async function getPropuestasPendientes(): Promise<{
  porEje: { eje_id: string; eje_nombre: string; eje_codigo: string | null; ambito_codigo: string | null; ambito_nombre: string; propuestas: PropuestaPendiente[] }[];
  total: number;
  sinPropuesta: number;
}> {
  const sb = await getSupabaseServer();
  const { arbol } = await getPlanRectorArbol();

  // Índice nodo -> eje y eje -> ámbito, para poder agrupar aunque la propuesta
  // apunte a un objetivo o a una línea.
  const ejeDe = new Map<string, { eje: NodoRectorArbol; ambito: NodoRectorArbol }>();
  for (const amb of arbol) {
    for (const eje of amb.hijos) {
      const marcar = (n: NodoRectorArbol) => {
        ejeDe.set(n.id, { eje, ambito: amb });
        for (const h of n.hijos) marcar(h);
      };
      marcar(eje);
    }
  }

  const { data, error } = await sb
    .from("proyecto_plan_rector")
    .select("id, proyecto_id, nodo_id, estado, justificacion");
  if (error) {
    if (tablaInexistente(error)) return { porEje: [], total: 0, sinPropuesta: 0 };
    throw error;
  }
  const vinculos = (data ?? []) as { id: string; proyecto_id: string; nodo_id: string; estado: string; justificacion: string | null }[];

  const yaConfirmado = new Set(vinculos.filter((v) => v.estado === "confirmado").map((v) => v.proyecto_id));
  const propuestos = vinculos.filter((v) => v.estado === "propuesto" && !yaConfirmado.has(v.proyecto_id));

  const { data: per } = await sb.from("periodo").select("id").eq("activo", true).maybeSingle();
  if (!per) return { porEje: [], total: 0, sinPropuesta: 0 };

  const { data: pys } = await sb
    .from("proyecto")
    .select("id, codigo, nombre, unidad:unidad_organizacional(nombre_corto, nombre)")
    .eq("periodo_id", (per as { id: string }).id)
    .eq("estado", "activo")
    .is("deleted_at", null);
  const proy = new Map((pys ?? []).map((p: any) => [p.id as string, p]));

  const grupos = new Map<string, PropuestaPendiente[]>();
  for (const v of propuestos) {
    const p = proy.get(v.proyecto_id);
    const ubic = ejeDe.get(v.nodo_id);
    // Un vínculo a un proyecto que salió del POA o a un nodo dado de baja no se
    // ofrece: no hay nada que confirmar ahí.
    if (!p || !ubic) continue;
    const fila: PropuestaPendiente = {
      vinculo_id: v.id,
      proyecto_id: v.proyecto_id,
      proyecto_codigo: p.codigo ?? null,
      proyecto_nombre: p.nombre,
      area: p.unidad?.nombre_corto ?? p.unidad?.nombre ?? null,
      justificacion: v.justificacion,
      eje_id: ubic.eje.id,
      eje_nombre: ubic.eje.nombre_corto ?? ubic.eje.nombre,
      eje_codigo: ubic.eje.codigo_cliente,
      ambito_codigo: ubic.ambito.codigo_cliente,
      ambito_nombre: ubic.ambito.nombre_corto ?? ubic.ambito.nombre,
    };
    if (!grupos.has(fila.eje_id)) grupos.set(fila.eje_id, []);
    grupos.get(fila.eje_id)!.push(fila);
  }

  const porEje = [...grupos.values()]
    .map((propuestas) => {
      propuestas.sort((a, b) => a.proyecto_nombre.localeCompare(b.proyecto_nombre, "es"));
      const p0 = propuestas[0];
      return {
        eje_id: p0.eje_id,
        eje_nombre: p0.eje_nombre,
        eje_codigo: p0.eje_codigo,
        ambito_codigo: p0.ambito_codigo,
        ambito_nombre: p0.ambito_nombre,
        propuestas,
      };
    })
    .sort(
      (a, b) =>
        (a.ambito_codigo ?? "").localeCompare(b.ambito_codigo ?? "") ||
        Number(a.eje_codigo ?? 0) - Number(b.eje_codigo ?? 0)
    );

  const total = porEje.reduce((n, g) => n + g.propuestas.length, 0);
  const activos = (pys ?? []).length;
  return { porEje, total, sinPropuesta: activos - yaConfirmado.size - total };
}

/** Lista plana de nodos imputables (eje, objetivo o línea) con su ruta legible. */
export const getNodosImputables = cache(async function getNodosImputables(): Promise<
  { id: string; tipo: TipoNodoRector; ruta: string; nombre: string }[]
> {
  const { arbol } = await getPlanRectorArbol();
  const salida: { id: string; tipo: TipoNodoRector; ruta: string; nombre: string }[] = [];

  const recorrer = (n: NodoRectorArbol, prefijo: string[]) => {
    const etiqueta = rotuloCorto(n);
    const ruta = [...prefijo, etiqueta];
    // El nivel 0 no es imputable: el área se deriva subiendo el árbol, así no
    // hay dos formas de decir lo mismo. La base también lo rechaza.
    if (n.tipo !== "area_intervencion") {
      salida.push({ id: n.id, tipo: n.tipo, ruta: ruta.join(" · "), nombre: n.nombre });
    }
    for (const h of n.hijos) recorrer(h, ruta);
  };
  for (const r of arbol) recorrer(r, []);
  return salida;
});




// ---------------------------------------------------------------------------
// Imputaciones de un proyecto
// ---------------------------------------------------------------------------

export async function getImputacionesDeProyecto(
  proyectoId: string
): Promise<{ imputaciones: ImputacionProyecto[]; excluido: { motivo: string } | null }> {
  const supabase = await getSupabaseServer();

  const [vinculosRes, exclusionRes, nodosRes] = await Promise.all([
    supabase
      .from("proyecto_plan_rector")
      .select("id, nodo_id, estado, principal, justificacion, confianza, created_at")
      .eq("proyecto_id", proyectoId)
      .order("created_at", { ascending: false }),
    supabase
      .from("proyecto_pr_exclusion")
      .select("motivo")
      .eq("proyecto_id", proyectoId)
      .maybeSingle(),
    getNodosImputables(),
  ]);

  if (vinculosRes.error) {
    if (tablaInexistente(vinculosRes.error)) return { imputaciones: [], excluido: null };
    throw vinculosRes.error;
  }

  const rutaPorId = new Map(nodosRes.map((n) => [n.id, n.ruta]));
  const imputaciones = ((vinculosRes.data ?? []) as Omit<ImputacionProyecto, "ruta">[]).map((v) => ({
    ...v,
    ruta: rutaPorId.get(v.nodo_id) ?? "(nodo dado de baja)",
  }));

  const excluido = (exclusionRes.data as { motivo: string } | null) ?? null;
  return { imputaciones, excluido };
}

/**
 * Cobertura global: cuántos proyectos activos del período ya tienen una
 * imputación confirmada o una exclusión declarada.
 *
 * Es el número que importa en los primeros meses, más que cualquier porcentaje
 * de avance: mientras la cobertura sea baja, el % de un ámbito habla de una
 * fracción del POA y no del POA.
 */
export async function getCoberturaPlanRector(periodoId: string): Promise<{
  activos: number;
  imputados: number;
  excluidos: number;
  pendientes: number;
  pct: number;
}> {
  const supabase = await getSupabaseServer();

  const { data: proyectos, error } = await supabase
    .from("proyecto")
    .select("id")
    .eq("periodo_id", periodoId)
    .eq("estado", "activo")
    .is("deleted_at", null);
  if (error) throw error;

  const ids = new Set((proyectos ?? []).map((p) => (p as { id: string }).id));
  if (ids.size === 0) return { activos: 0, imputados: 0, excluidos: 0, pendientes: 0, pct: 0 };

  const estados = await estadosPlanRector([...ids]);
  if (!estados) {
    return { activos: ids.size, imputados: 0, excluidos: 0, pendientes: ids.size, pct: 0 };
  }

  let imputados = 0, excluidos = 0;
  for (const e of estados.values()) {
    if (e === "imputado") imputados++;
    else if (e === "excluido") excluidos++;
  }
  const resueltos = imputados + excluidos;
  return {
    activos: ids.size,
    imputados,
    excluidos,
    pendientes: ids.size - resueltos,
    pct: Math.round((resueltos / ids.size) * 100),
  };
}

export type EstadoPlanRector = "imputado" | "excluido" | "pendiente";

/**
 * En qué quedó cada proyecto respecto del Plan Rector.
 *
 *   imputado   tiene al menos una imputación confirmada.
 *   excluido   se marcó "fuera del plan" y no tiene imputación.
 *   pendiente  ninguna de las dos: está sin resolver.
 *
 * La imputación manda sobre la exclusión: un proyecto con las dos está en el
 * plan. Es la misma regla de la cobertura, que también la usa, para que el
 * número de arriba del Plan Rector y lo que dice cada fila de proyectos no
 * puedan discrepar.
 *
 * 05.10: "¿Podrán poner una columna que diga si está o no asignado el proyecto
 * al plan rector? Si no hay que abrir uno por uno y demoramos mucho."
 *
 * Devuelve null si las tablas todavía no existen (migración 044 sin aplicar).
 */
async function estadosPlanRector(ids: string[]): Promise<Map<string, EstadoPlanRector> | null> {
  const supabase = await getSupabaseServer();

  // Paginado: PostgREST corta en 1000 filas y un proyecto puede tener varias
  // imputaciones. Hoy son unas 340, pero cortar en silencio es justo lo que no
  // puede pasar en una columna que dice "sin asignar".
  const leerTodo = async (tabla: string, confirmados: boolean) => {
    const filas: { proyecto_id: string }[] = [];
    for (let desde = 0; ; desde += 1000) {
      let q = supabase.from(tabla).select("proyecto_id").range(desde, desde + 999);
      if (confirmados) q = q.eq("estado", "confirmado");
      const { data, error } = await q;
      if (error) return { error, filas };
      filas.push(...((data ?? []) as { proyecto_id: string }[]));
      if (!data || data.length < 1000) break;
    }
    return { error: null, filas };
  };

  const [vinculos, exclusiones] = await Promise.all([
    leerTodo("proyecto_plan_rector", true),
    leerTodo("proyecto_pr_exclusion", false),
  ]);
  if (tablaInexistente(vinculos.error) || tablaInexistente(exclusiones.error)) return null;

  const imputados = new Set(vinculos.filas.map((v) => v.proyecto_id));
  const excluidos = new Set(exclusiones.filas.map((v) => v.proyecto_id));
  const salida = new Map<string, EstadoPlanRector>();
  for (const id of ids) {
    salida.set(id, imputados.has(id) ? "imputado" : excluidos.has(id) ? "excluido" : "pendiente");
  }
  return salida;
}

/** El estado de Plan Rector de varios proyectos, para listarlos. */
export async function getEstadoPlanRectorPorProyecto(
  ids: string[]
): Promise<Map<string, EstadoPlanRector>> {
  return (await estadosPlanRector(ids)) ?? new Map();
}

/**
 * El ámbito del Plan Rector de cada proyecto imputado — 13.10, para el punto 4
 * del informe: "en los reportes también debería salir el grado de cumplimiento
 * del Plan Rector porque se lo está midiendo".
 *
 * Va con el cliente ADMIN, como el detalle del corte que lee el informe: la
 * puerta de acceso ya la pasó getReporteUnidad, y con la sesión del lector un
 * director podría no ver la imputación de un proyecto de su propio informe. No
 * devuelve datos de proyectos, solo el ámbito de cada id; el informe cruza con
 * los suyos.
 *
 * La imputación es la de HOY, aunque el informe sea de un corte: el corte guarda
 * el avance de cada proyecto pero no su vínculo con el Plan Rector. Si se
 * reimputa un proyecto después del corte, su avance de ese día aparece en el
 * ámbito nuevo.
 *
 * Si las tablas del Plan Rector no están, devuelve vacío: el informe sale igual,
 * sin el punto 4.
 */
export async function getAmbitoPorProyecto(): Promise<
  Map<string, { codigo: string | null; nombre: string }>
> {
  const { getSupabaseAdmin } = await import("@/lib/supabase/admin");
  const sb = getSupabaseAdmin();
  const salida = new Map<string, { codigo: string | null; nombre: string }>();

  const { data: nodos, error } = await sb
    .from("plan_rector_nodo")
    .select("id, parent_id, codigo_cliente, nombre, nombre_corto")
    .eq("activa", true);
  if (error) {
    if (tablaInexistente(error)) return salida;
    throw error;
  }
  const porId = new Map(((nodos ?? []) as any[]).map((n) => [n.id as string, n]));
  const ambitoDe = (nodoId: string) => {
    let n = porId.get(nodoId);
    for (let i = 0; n?.parent_id && i < 6; i++) n = porId.get(n.parent_id);
    return n ? { codigo: (n.codigo_cliente ?? null) as string | null, nombre: (n.nombre_corto ?? n.nombre) as string } : null;
  };

  // Paginado: PostgREST corta en 1000 filas y ya hay más de 400 vínculos.
  for (let desde = 0; ; desde += 1000) {
    const { data, error: e } = await sb
      .from("proyecto_plan_rector")
      .select("proyecto_id, nodo_id")
      .eq("estado", "confirmado")
      .order("proyecto_id")
      .range(desde, desde + 999);
    if (e) throw e;
    for (const v of (data ?? []) as { proyecto_id: string; nodo_id: string }[]) {
      // Un proyecto en dos ámbitos cuenta en el primero: así los aportes del
      // informe siguen sumando el total (ver aportesPorAmbito).
      if (salida.has(v.proyecto_id)) continue;
      const a = ambitoDe(v.nodo_id);
      if (a) salida.set(v.proyecto_id, a);
    }
    if (!data || data.length < 1000) break;
  }
  return salida;
}

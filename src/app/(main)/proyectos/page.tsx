import {
  getPeriodoActivo,
  getProyectos,
  getUnidades,
  getIndicadoresAvance,
  getMetasDelPeriodo,
  type IndicadorAvance,
} from "@/lib/queries";
import { getPerfilActual, getScopeUnidades } from "@/lib/auth";
import {
  avanceAgregado,
  avanceMetaEnPlazo,
  calcularPorcentajeMeta,
  coincideBusqueda,
  perfilVeTodo,
  normalizarBusqueda,
  subtreeUnidades,
  unidadesQuePuedeCargar,
  type AvanceNivel,
} from "@/lib/utils";
import type { Meta, UnidadOrganizacional } from "@/types/database";
import { ProyectosSearch } from "./search";
import { PoaTree, type PoaIndicador, type PoaMeta, type PoaProyecto } from "@/components/poa/poa-tree";
import { NuevoProyectoForm } from "@/components/poa/nuevo-proyecto-form";
import { Suspense } from "react";

export const revalidate = 0;

interface Props {
  searchParams: Promise<{ q?: string; dir?: string; estado?: string }>;
}

export default async function ProyectosPage({ searchParams }: Props) {
  const params = await searchParams;
  // 15.08: todo lo que depende del período sale junto, en vez de encadenar
  // proyectos → metas → perfil.
  const periodo = await getPeriodoActivo();
  const [proyectos, unidades, indicadores, todasMetas, perfil] = await Promise.all([
    getProyectos(periodo.id),
    getUnidades(),
    getIndicadoresAvance(periodo.id),
    getMetasDelPeriodo(periodo.id),
    getPerfilActual(),
  ]);

  // Perfil + scope para saber si el usuario puede cargar avances
  const rolesCarga = ["director", "subsecretario", "secretario", "coordinador", "admin_funcional"];
  const puedeCargarBase = !!perfil && rolesCarga.includes(perfil.rol);
  const scopeUnidadesUsuario =
    puedeCargarBase && perfil ? new Set(await getScopeUnidades(perfil)) : null;

  // Mapas
  const metasPorPy = new Map<string, Meta[]>();
  for (const m of (todasMetas ?? []) as Meta[]) {
    (metasPorPy.get(m.proyecto_id) ?? metasPorPy.set(m.proyecto_id, []).get(m.proyecto_id)!).push(m);
  }
  const indPorMeta = new Map<string, IndicadorAvance[]>();
  for (const i of indicadores) {
    (indPorMeta.get(i.meta_id) ?? indPorMeta.set(i.meta_id, []).get(i.meta_id)!).push(i);
  }
  const unidadById = new Map(unidades.map((u) => [u.id, u]));
  const childrenByParent = new Map<string | null, UnidadOrganizacional[]>();
  for (const u of unidades) {
    const key = u.parent_id;
    (childrenByParent.get(key) ?? childrenByParent.set(key, []).get(key)!).push(u);
  }

  // -------------------------------------------------------
  // Avance del proyecto — 09.09, párrafo 721
  // -------------------------------------------------------
  // Esta pantalla usaba `calcularAvancePorIndicadores`, que era una TERCERA
  // regla de semáforo, distinta de la del resto del sistema: verde desde el
  // 70 %, rojo valuado en 10 en vez de 0, y promediando solo los indicadores
  // con dato en vez de todos. Resultado medido el 10.09 sobre los 441 proyectos
  // activos: acá salían 132 "Finalizados" contra 73 en el Panel Ejecutivo, 60 de
  // ellos por debajo del 100 % y 55 entre el 70 % y el 99 %. Y 113 proyectos
  // (26 %) mostraban un estado distinto según la pantalla en la que se los
  // mirara, con casos de 99 % acá contra 8 % allá.
  //
  // Eso es exactamente lo que reportaron: "todavía hay proyectos marcados como
  // Finalizados (en verde), cuando tienen un porcentaje de avance mayor al 80%".
  //
  // Ahora usa la misma cascada que el Panel Ejecutivo, la TV, Avance por
  // Dirección, las fotos de corte y el reporte trimestral: cada meta se deriva
  // de sus indicadores y el proyecto es el promedio de sus metas, contando
  // todas. Un solo número por proyecto en todo el sistema.
  //
  // `hoy` se calcula igual que en el Panel (UTC) A PROPÓSITO: si acá usara
  // `hoyLocal()` las dos pantallas volverían a discrepar entre las 21 y las 24
  // de Tucumán, que es justo el problema que este cambio cierra. La zona horaria
  // es un arreglo aparte y afecta a seis pantallas.
  const hoy = new Date().toISOString().slice(0, 10);
  const avancePorProyecto = new Map<string, AvanceNivel>();
  for (const py of proyectos) {
    const metaPcts = (metasPorPy.get(py.id) ?? []).map(
      (m) =>
        avanceMetaEnPlazo(
          indPorMeta.get(m.id) ?? [],
          calcularPorcentajeMeta(m),
          { fecha_inicio: m.fecha_inicio, fecha_limite: m.fecha_limite },
          hoy
        ).pct
    );
    avancePorProyecto.set(py.id, avanceAgregado(metaPcts));
  }

  /** Semáforo del proyecto, con el mismo criterio que el Panel Ejecutivo. */
  const estadoProyecto = (proyectoId: string) => {
    const av = avancePorProyecto.get(proyectoId);
    if (!av || av.conDatos === 0) return "sin_datos" as const;
    return av.estado;
  };

  // Filtrado
  let proyectosFiltrados = proyectos;
  if (params.q) {
    // Búsqueda sin distinguir mayúsculas, tildes ni puntuación (28.07)
    const q = normalizarBusqueda(params.q);
    proyectosFiltrados = proyectosFiltrados.filter(
      (p) =>
        coincideBusqueda(p.nombre, q) ||
        coincideBusqueda(p.codigo, q) ||
        coincideBusqueda(p.unidad?.nombre_corto, q) ||
        coincideBusqueda(p.unidad?.nombre, q)
    );
  }
  if (params.dir) {
    const descendientes = (id: string): string[] => {
      const directos = (childrenByParent.get(id) ?? []).map((u) => u.id);
      return [id, ...directos.flatMap((d) => descendientes(d))];
    };
    const dirIds = new Set(descendientes(params.dir));
    proyectosFiltrados = proyectosFiltrados.filter((p) => dirIds.has(p.unidad_id));
  }
  if (params.estado && params.estado !== "todos") {
    proyectosFiltrados = proyectosFiltrados.filter((p) => estadoProyecto(p.id) === params.estado);
  }

  // Construir el árbol Sec → (Sub) → Dir → Proyectos
  const sortByName = (a: UnidadOrganizacional, b: UnidadOrganizacional) =>
    (a.nombre_corto ?? a.nombre).localeCompare(b.nombre_corto ?? b.nombre);

  // Para el desplegable de "Nuevo proyecto": secretaría → subsecretarías →
  // direcciones, y alfabético dentro de cada nivel.
  const sortByNivelNombre = (a: UnidadOrganizacional, b: UnidadOrganizacional) =>
    a.nivel - b.nivel || sortByName(a, b);

  const proyectosPorUnidad = new Map<string, typeof proyectosFiltrados>();
  for (const py of proyectosFiltrados) {
    (proyectosPorUnidad.get(py.unidad_id) ?? proyectosPorUnidad.set(py.unidad_id, []).get(py.unidad_id)!).push(py);
  }

  const secretarias = unidades.filter((u) => u.nivel === 0).sort(sortByName);

  function toPoaProyectos(unidadIds: string[]): PoaProyecto[] {
    const result: PoaProyecto[] = [];
    for (const uId of unidadIds) {
      for (const py of (proyectosPorUnidad.get(uId) ?? []).sort((a, b) =>
        a.nombre.localeCompare(b.nombre)
      )) {
        const metas = (metasPorPy.get(py.id) ?? []).map<PoaMeta>((m) => ({
          id: m.id,
          codigo: m.codigo,
          nombre: m.nombre,
          estado_semaforo: m.estado_semaforo,
          ultima_actualizacion: m.ultima_actualizacion,
          indicadores: (indPorMeta.get(m.id) ?? []).map<PoaIndicador>((i) => ({
            id: i.id,
            codigo: i.codigo,
            nombre: i.nombre,
            valor_actual: i.valor_actual,
            valor_actual_texto: i.valor_actual_texto,
            valor_objetivo: i.valor_objetivo,
            valor_objetivo_texto: i.valor_objetivo_texto,
            unidad_medida: i.unidad_medida,
            estado_semaforo: i.estado_semaforo,
          })),
        }));
        // Avance del proyecto por la cascada del sistema (ver arriba)
        const av = avancePorProyecto.get(py.id);
        result.push({
          id: py.id,
          codigo: py.codigo,
          nombre: py.nombre,
          unidad_id: py.unidad_id,
          unidad_nombre: unidadById.get(py.unidad_id)?.nombre_corto ?? unidadById.get(py.unidad_id)?.nombre ?? null,
          metas,
          porcentaje: av?.pct ?? 0,
          estado: estadoProyecto(py.id),
          tieneSeguimiento: (av?.conDatos ?? 0) > 0,
          puedeCargar: !!scopeUnidadesUsuario && scopeUnidadesUsuario.has(py.unidad_id),
        });
      }
    }
    return result;
  }

  // Construye un nodo de dirección incluyendo sus subdirecciones (nivel 3)
  const toDireccion = (d: UnidadOrganizacional) => {
    const subdirs = (childrenByParent.get(d.id) ?? []).filter((u) => u.nivel >= 3).sort(sortByName);
    return {
      unidad: d,
      proyectos: toPoaProyectos([d.id]),
      subdirecciones: subdirs.map((sd) => ({ unidad: sd, proyectos: toPoaProyectos([sd.id]) })),
    };
  };

  // Build sec → (sub → dir → subdir → py) o (dir → py)
  const arbol = secretarias.map((sec) => {
    const subs = (childrenByParent.get(sec.id) ?? []).filter((u) => u.nivel === 1).sort(sortByName);
    const dirsDirectas = (childrenByParent.get(sec.id) ?? []).filter((u) => u.nivel === 2).sort(sortByName);
    return {
      unidad: sec,
      proyectosDirectos: toPoaProyectos([sec.id]),
      subs: subs.map((sub) => {
        const dirs = (childrenByParent.get(sub.id) ?? []).filter((u) => u.nivel === 2).sort(sortByName);
        return {
          unidad: sub,
          proyectosDirectos: toPoaProyectos([sub.id]),
          dirs: dirs.map(toDireccion),
        };
      }),
      dirsDirectas: dirsDirectas.map(toDireccion),
    };
  });

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">POA Operativo</h1>
          <p className="text-sm text-muted mt-1">
            {periodo.nombre} — {proyectosFiltrados.length} de {proyectos.length} proyectos · {indicadores.length} indicadores
          </p>
        </div>
        <Suspense>
          <ProyectosSearch
            unidades={
              perfilVeTodo(perfil) ? unidades : subtreeUnidades(unidades, perfil?.unidad_id ?? null)
            }
          />
        </Suspense>
      </div>

      {puedeCargarBase && perfil && (
        <div className="flex justify-end">
          {/* Un solo criterio para todos los roles, espejo de la RLS. Antes era
              un ternario por rol que no tenía rama para `coordinador`: le
              mostraba el botón con el desplegable vacío, así que no podía crear
              nada. Y el director no podía elegir área; desde el 26.08 también
              crea en su secretaría. */}
          <NuevoProyectoForm
            unidades={unidadesQuePuedeCargar(perfil, unidades).sort(sortByNivelNombre)}
          />
        </div>
      )}

      <PoaTree
        arbol={arbol}
        autoExpand={
          !perfilVeTodo(perfil) ||
          !!(params.dir || params.q || (params.estado && params.estado !== "todos"))
        }
      />
    </div>
  );
}

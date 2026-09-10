import {
  getPeriodoActivo,
  getResumenDashboard,
  getUnidades,
  getIndicadoresAvance,
  type IndicadorAvance,
} from "@/lib/queries";
import { KpiCard } from "@/components/ui/kpi-card";
import { GaugeCumplimiento } from "@/components/ui/gauge-cumplimiento";
import { EstadoProyectos } from "@/components/dashboard/estado-proyectos";
import { ProyectoCard } from "@/components/dashboard/proyecto-card";
import { FilterBar } from "@/components/dashboard/filter-bar";
import { ScopeSelector } from "@/components/dashboard/scope-selector";
import { AutoRefresh } from "@/components/dashboard/auto-refresh";
import { EmptyState } from "@/components/ui/empty-state";
import {
  calcularPorcentajeMeta,
  avanceMetaEnPlazo,
  avanceAgregado,
  avanceGlobalPorConteo,
  totalDistribucion,
  perfilVeTodo,
  type AvanceNivel,
} from "@/lib/utils";
import { getPerfilActual } from "@/lib/auth";
import type { Meta } from "@/types/database";
import { Suspense } from "react";
import Link from "next/link";

export const revalidate = 0; // sin cache mientras estamos cargando data

interface Props {
  searchParams: Promise<{ unidad?: string; estado?: string; scope?: string }>;
}

export default async function DashboardPage({ searchParams }: Props) {
  const params = await searchParams;
  // 15.08: estas lecturas iban una atrás de la otra. Las que no dependen del
  // período salen juntas, y el resumen + indicadores también entre sí.
  const [periodo, unidades, perfil] = await Promise.all([
    getPeriodoActivo(),
    getUnidades(),
    getPerfilActual(),
  ]);
  const [resumen, indicadores] = await Promise.all([
    getResumenDashboard(periodo.id),
    getIndicadoresAvance(periodo.id),
  ]);

  // Quien ve todo puede elegir el ámbito libremente. El resto (secretario/
  // subsec/director) queda fijado a su área. La marca `acceso_global` (03.08)
  // habilita el selector sin cambiarle el rol al usuario.
  const esGlobal = perfilVeTodo(perfil);

  const descendientes = (id: string): string[] => {
    const directos = unidades.filter((u) => u.parent_id === id).map((u) => u.id);
    return [id, ...directos.flatMap((d) => descendientes(d))];
  };

  // Si el usuario tiene área asignada y no es global, forzamos el scope a su unidad
  const scopeForzado = !esGlobal && perfil?.unidad_id ? perfil.unidad_id : null;
  const scopeId = scopeForzado ?? params.scope;
  const scopeUnidadIds = scopeId ? new Set(descendientes(scopeId)) : null;

  const proyectosScope = scopeUnidadIds
    ? resumen.proyectos.filter((p) => scopeUnidadIds.has(p.unidad_id))
    : resumen.proyectos;
  const proyectoIdsScope = new Set(proyectosScope.map((p) => p.id));
  const metasScope = scopeUnidadIds
    ? resumen.metas.filter((m) => proyectoIdsScope.has(m.proyecto_id))
    : resumen.metas;
  const proyectosActivos = proyectosScope.filter((p) => p.estado === "activo");

  // -------------------------------------------------------
  // Avance basado en INDICADORES (lo que cargan los directores)
  // -------------------------------------------------------
  const indByMeta = new Map<string, IndicadorAvance[]>();
  for (const i of indicadores) {
    const mId = i.meta_id;
    if (mId) (indByMeta.get(mId) ?? indByMeta.set(mId, []).get(mId)!).push(i);
  }

  // Indicadores dentro del scope
  const indScope = scopeUnidadIds
    ? indicadores.filter((i) => {
        const uId = i.meta?.proyecto?.unidad_id;
        return uId ? scopeUnidadIds.has(uId) : false;
      })
    : indicadores;

  const totalIndicadoresScope = indScope.length;

  const hoy = new Date().toISOString().slice(0, 10);

  // Avance por proyecto vía cascada: cada meta se deriva de sus indicadores y
  // el proyecto es el promedio de sus metas (contando todas). Considera el plazo.
  const avancePorProyecto = new Map<string, AvanceNivel>();
  for (const py of proyectosActivos) {
    const metasDelPy = resumen.metasPorProyecto.get(py.id) ?? [];
    const metaPcts = metasDelPy.map(
      (m) =>
        avanceMetaEnPlazo(
          indByMeta.get(m.id) ?? [],
          calcularPorcentajeMeta(m),
          { fecha_inicio: m.fecha_inicio, fecha_limite: m.fecha_limite },
          hoy
        ).pct
    );
    avancePorProyecto.set(py.id, avanceAgregado(metaPcts));
  }

  // Estado (semáforo) de un proyecto
  type EstadoProyecto = "verde" | "amarillo" | "rojo" | "sin_datos";
  const estadoProyecto = (py: { id: string }): EstadoProyecto => {
    const av = avancePorProyecto.get(py.id);
    if (!av || av.conDatos === 0) return "sin_datos";
    return av.estado as "verde" | "amarillo" | "rojo";
  };

  // Lo que recibe cada ProyectoCard. Desde el 09.09 el avance es obligatorio:
  // la tarjeta ya no calcula nada por su cuenta.
  const avanceCard = (proyectoId: string) => {
    const av = avancePorProyecto.get(proyectoId);
    return {
      porcentaje: av?.pct ?? null,
      estado: estadoProyecto({ id: proyectoId }),
      tieneSeguimiento: (av?.conDatos ?? 0) > 0,
    };
  };

  // Distribución (conteo) de proyectos por estado, para un conjunto dado
  const distribucion = (pys: typeof proyectosActivos) => {
    const d = { verde: 0, amarillo: 0, rojo: 0, sin_datos: 0 };
    for (const py of pys) d[estadoProyecto(py)]++;
    return d;
  };

  // Distribución del ámbito completo (tarjeta "Grado de avance")
  const distribucionProyectos = distribucion(proyectosActivos);

  // Filtro por estado (semáforo). El ámbito ya está aplicado en proyectosActivos.
  let proyectosFiltrados = proyectosActivos;
  if (params.estado && params.estado !== "todos") {
    proyectosFiltrados = proyectosActivos.filter((py) => estadoProyecto(py) === params.estado);
  }

  // -------------------------------------------------------
  // Cumplimiento global (28.07 + 30.07, presentación rehecha el 06.08)
  // -------------------------------------------------------
  // Se mide por CONTEO de proyectos: finalizados + en ejecución sobre el total
  // del ámbito. Es la fórmula del 28.07 y no cambia.
  //
  // 06.08: el filtro de estado de la lista de proyectos YA NO afecta a este
  // número, ni a los KPI, ni a las tarjetas de estado. Todo el bloque de
  // arriba mide siempre el ámbito completo; el filtro solo acota la lista.
  const totalAmbito = totalDistribucion(distribucionProyectos);
  const porcentajeGlobal = avanceGlobalPorConteo(distribucionProyectos);

  // Hay seguimiento si al menos un proyecto del ámbito tiene datos cargados.
  const tieneSeguimiento =
    distribucionProyectos.verde + distribucionProyectos.amarillo + distribucionProyectos.rojo > 0;

  const pctSinDatos =
    totalAmbito > 0 ? Math.round((distribucionProyectos.sin_datos / totalAmbito) * 100) : 0;

  // Agrupar por Secretaría: las direcciones que cuelgan directo de una
  // secretaría (sin subsecretaría) también tienen que aparecer.
  const secretarias = unidades.filter((u) => u.nivel === 0);

  const scopeUnidad = scopeId ? unidades.find((u) => u.id === scopeId) ?? null : null;

  const hayFiltros = !!scopeId || (!!params.estado && params.estado !== "todos");

  const estadoParam = params.estado && params.estado !== "todos" ? params.estado : null;

  // Fija el ámbito del panel sin perder el filtro de estado de la lista.
  const buildScopeHref = (unidadId: string) => {
    const sp = new URLSearchParams();
    sp.set("scope", unidadId);
    if (estadoParam) sp.set("estado", estadoParam);
    return `/dashboard?${sp.toString()}`;
  };

  // Los KPI llevan a su sección con el ÁMBITO solamente: desde el 06.08 sus
  // valores no dependen del filtro de estado, así que el destino tampoco.
  const buildHref = (base: string, areaKey: "dir" | "unidad") => {
    const sp = new URLSearchParams();
    if (scopeId) sp.set(areaKey, scopeId);
    const qs = sp.toString();
    return qs ? `${base}?${qs}` : base;
  };

  return (
    <div className="space-y-8 max-w-7xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-foreground">Panel Ejecutivo</h1>
          {esGlobal ? (
            <>
              <Suspense><ScopeSelector unidades={unidades} /></Suspense>
              {scopeUnidad && (
                <p className="mt-1 text-xs text-muted">Ámbito: {scopeUnidad.nombre}</p>
              )}
            </>
          ) : (
            <p className="mt-2 text-sm text-muted">
              {scopeUnidad ? scopeUnidad.nombre : "Tu área"}
            </p>
          )}
        </div>
        <div className="flex flex-col items-end gap-2 self-start">
          <Link href="/tv" target="_blank"
            className="text-xs text-muted hover:text-accent border border-border hover:border-accent/30 px-3 py-1.5 rounded-lg transition-colors inline-flex items-center gap-1.5">
            <span>▣</span> Modo TV
          </Link>
          <AutoRefresh intervalSegundos={60} />
        </div>
      </div>

      {/* Banner: planificacion sin seguimiento */}
      {!resumen.tieneSeguimiento && (
        <div className="rounded-2xl border border-primary/20 bg-primary/5 p-5">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-primary/20 flex items-center justify-center shrink-0">
              <span className="text-primary text-lg">◎</span>
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">Planificación cargada — Seguimiento pendiente</p>
              <p className="text-xs text-muted mt-0.5">
                El POA tiene {proyectosActivos.length} proyectos activos y {resumen.totalMetas} metas definidas.
                Los indicadores se activarán cuando se carguen los primeros avances operativos.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Cumplimiento global + cómo se calcula + leyenda (06.08) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 rounded-2xl border border-border bg-surface p-6">
          <p className="text-sm font-semibold text-foreground uppercase tracking-wider">
            Cumplimiento global del POA
          </p>
          <p className="text-xs text-muted mt-1">
            Grado de avance de los proyectos sobre el total de proyectos registrados del ámbito.
          </p>
          <div className="mt-4">
            <GaugeCumplimiento value={tieneSeguimiento ? porcentajeGlobal : null} />
          </div>
          {!tieneSeguimiento && (
            <p className="text-sm text-muted/70 text-center">Aguardando primer reporte</p>
          )}
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl border border-success/25 bg-surface p-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-success">
              ¿Cómo se calcula?
            </p>
            <p className="text-xs text-muted leading-relaxed mt-2">
              El cumplimiento global corresponde a la proporción de proyectos del POA que ya
              están en marcha sobre el total de proyectos registrados del ámbito.
            </p>
            <p className="text-xs text-muted leading-relaxed mt-2">
              Un proyecto finalizado y uno en ejecución cuentan como avance; los no iniciados y
              los que todavía no tienen datos cargados aportan 0 %.
            </p>
          </div>

          <div className="rounded-2xl border border-border bg-surface p-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-primary">
              Leyenda de colores
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 mt-3">
              {[
                { dot: "bg-success", texto: "Bueno / Completado" },
                { dot: "bg-info", texto: "Pendiente / Crítico" },
                { dot: "bg-warning", texto: "En progreso" },
                { dot: "bg-muted/60", texto: "Sin datos / Requiere atención" },
              ].map((l) => (
                <span key={l.texto} className="inline-flex items-center gap-2 text-xs text-muted">
                  <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${l.dot}`} />
                  {l.texto}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* KPIs: Proyectos → Metas → Indicadores */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Link href={buildHref("/proyectos", "dir")} className="block hover:scale-[1.02] transition-transform">
          <KpiCard label="Proyectos" value={proyectosActivos.length} sublabel="Total registrados" icon="▦" accent="primary" />
        </Link>

        <Link href={buildHref("/metas", "unidad")} className="block hover:scale-[1.02] transition-transform">
          <KpiCard label="Metas" value={metasScope.length} sublabel="Total planificadas" icon="◎" accent="accent" />
        </Link>

        <Link href={buildHref("/indicadores", "unidad")} className="block hover:scale-[1.02] transition-transform">
          <KpiCard label="Indicadores" value={totalIndicadoresScope} sublabel="Total asociados" icon="▤" accent="success" />
        </Link>
      </div>

      {/* Estado de los proyectos */}
      <div>
        <p className="text-sm font-semibold text-foreground uppercase tracking-wider mb-4">
          Estado de los proyectos
        </p>
        <EstadoProyectos distribucion={distribucionProyectos} />
      </div>

      {/* Aviso: proyectos sin datos */}
      {distribucionProyectos.sin_datos > 0 && (
        <div className="rounded-2xl border border-warning/25 bg-warning/5 p-4 flex items-start gap-3">
          <span className="text-warning text-sm shrink-0 mt-0.5">⚠</span>
          <div>
            <p className="text-sm font-semibold text-foreground">
              Proyectos sin datos: {distribucionProyectos.sin_datos} proyectos ({pctSinDatos}%)
              pendientes de actualización.
            </p>
            <p className="text-xs text-muted mt-0.5">
              La actualización de la información es clave para una gestión eficiente y un
              seguimiento preciso.
            </p>
          </div>
        </div>
      )}

      {/* Proyectos */}
      <div>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-5">
          <h2 className="text-lg font-semibold text-foreground">
            Proyectos{hayFiltros ? ` (${proyectosFiltrados.length})` : ""}
          </h2>
          <Suspense><FilterBar unidades={unidades} /></Suspense>
        </div>

        {proyectosFiltrados.length === 0 ? (
          <EmptyState title="Sin proyectos para este filtro"
            description="Probá cambiar los filtros o seleccionar otra área" icon="▦" />
        ) : hayFiltros ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {proyectosFiltrados.map((py) => {
              const metas = (resumen.metasPorProyecto.get(py.id) ?? []) as Meta[];
              return <ProyectoCard key={py.id} proyecto={py} metas={metas} avance={avanceCard(py.id)} />;
            })}
          </div>
        ) : (
          <div className="space-y-8">
            {secretarias.map((sec) => {
              const allUnitIds = descendientes(sec.id);
              const pysSec = proyectosFiltrados.filter((p) => allUnitIds.includes(p.unidad_id));
              if (pysSec.length === 0) return null;
              const nombreSec = sec.nombre_corto ?? sec.nombre;
              return (
                <div key={sec.id}>
                  {/* Click en la secretaría → fija el ámbito, y el ámbito ya
                      alimenta todos los KPI y gráficos del panel (28.07). */}
                  <Link
                    href={buildScopeHref(sec.id)}
                    className="flex items-center gap-2 mb-4 group w-fit"
                  >
                    <div className="h-6 w-6 rounded-md bg-accent/20 flex items-center justify-center">
                      <span className="text-accent text-xs font-bold">{nombreSec[0]}</span>
                    </div>
                    <h3 className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">
                      {nombreSec}
                    </h3>
                    <span className="text-xs text-muted">— {pysSec.length} proyectos</span>
                  </Link>
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                    {pysSec.slice(0, 9).map((py) => {
                      const metas = (resumen.metasPorProyecto.get(py.id) ?? []) as Meta[];
                      return <ProyectoCard key={py.id} proyecto={py} metas={metas} avance={avanceCard(py.id)} />;
                    })}
                  </div>
                  {pysSec.length > 9 && (
                    <Link href={buildScopeHref(sec.id)}
                      className="inline-block mt-3 text-xs text-primary hover:text-primary-light transition-colors">
                      Ver los {pysSec.length} proyectos →
                    </Link>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

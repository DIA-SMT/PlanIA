import { getIndicadores, getUnidades, getPeriodoActivo, getProyectos } from "@/lib/queries";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { IndicadoresFiltros } from "@/components/indicadores/indicadores-filtros";
import { getPerfilActual } from "@/lib/auth";
import {
  coincideBusqueda,
  perfilVeTodo,
  subtreeDeVarias,
  unidadesDelPerfil,
  estadoIndicadorEnPlazo,
  indicadorCumplido,
  normalizarBusqueda,
} from "@/lib/utils";
import { PlazoBadge } from "@/components/ui/plazo-badge";
import type { Indicador, UnidadOrganizacional } from "@/types/database";
import Link from "next/link";
import { Suspense } from "react";

export const revalidate = 0;

interface Props {
  searchParams: Promise<{ q?: string; estado?: string; unidad?: string }>;
}

type IndicadorJoined = Indicador & {
  meta?: {
    id: string;
    nombre: string;
    proyecto?: { id: string; nombre: string; codigo: string | null; unidad_id: string };
  };
};

export default async function IndicadoresPage({ searchParams }: Props) {
  const params = await searchParams;
  // 15.08: proyectos y perfil ya no esperan a que terminen los indicadores.
  const periodo = await getPeriodoActivo();
  const [indicadores, unidades, proyectos, perfil] = await Promise.all([
    getIndicadores(),
    getUnidades(),
    getProyectos(periodo.id),
    getPerfilActual(),
  ]);
  const unidadesFiltro = perfilVeTodo(perfil)
    ? unidades
    : unidadesDelPerfil(perfil).length > 0
      ? subtreeDeVarias(unidades, unidadesDelPerfil(perfil))
      : unidades;
  const proyectoById = new Map(proyectos.map((p) => [p.id, p]));
  const unidadById = new Map(unidades.map((u) => [u.id, u]));
  const hoy = new Date().toISOString().slice(0, 10);

  // Helper para encontrar la Secretaría ancestro de cualquier unidad
  const findSecretaria = (unidadId: string): UnidadOrganizacional | null => {
    let cur: UnidadOrganizacional | null = unidadById.get(unidadId) ?? null;
    while (cur && cur.parent_id) cur = unidadById.get(cur.parent_id) ?? null;
    return cur;
  };

  let filtrados = indicadores as IndicadorJoined[];

  if (params.q) {
    // Búsqueda sin distinguir mayúsculas, tildes ni puntuación (28.07)
    const q = normalizarBusqueda(params.q);
    filtrados = filtrados.filter(
      (i) =>
        coincideBusqueda(i.nombre, q) ||
        coincideBusqueda(i.codigo, q) ||
        coincideBusqueda(i.meta?.nombre, q)
    );
  }
  if (params.estado && params.estado !== "todos") {
    filtrados = filtrados.filter((i) => estadoIndicadorEnPlazo(i, hoy) === params.estado);
  }
  if (params.unidad) {
    const descendientes = (id: string): string[] => {
      const directos = unidades.filter((u) => u.parent_id === id).map((u) => u.id);
      return [id, ...directos.flatMap((d) => descendientes(d))];
    };
    const uIds = new Set(descendientes(params.unidad));
    filtrados = filtrados.filter((i) => {
      const proyectoId = i.meta?.proyecto?.id;
      const py = proyectoId ? proyectoById.get(proyectoId) : null;
      return py ? uIds.has(py.unidad_id) : false;
    });
  }

  // Agrupar por Secretaría → Dirección
  type Grupo = {
    secretaria: UnidadOrganizacional;
    direcciones: Map<string, { unidad: UnidadOrganizacional; indicadores: IndicadorJoined[] }>;
  };
  const gruposBySec = new Map<string, Grupo>();
  for (const ind of filtrados) {
    const py = ind.meta?.proyecto;
    if (!py) continue;
    const unidad = unidadById.get(py.unidad_id);
    if (!unidad) continue;
    const sec = findSecretaria(unidad.id);
    if (!sec) continue;
    let grupo = gruposBySec.get(sec.id);
    if (!grupo) {
      grupo = { secretaria: sec, direcciones: new Map() };
      gruposBySec.set(sec.id, grupo);
    }
    let dirEntry = grupo.direcciones.get(unidad.id);
    if (!dirEntry) {
      dirEntry = { unidad, indicadores: [] };
      grupo.direcciones.set(unidad.id, dirEntry);
    }
    dirEntry.indicadores.push(ind);
  }

  // Ordenar
  const sortByName = (a: UnidadOrganizacional, b: UnidadOrganizacional) =>
    (a.nombre_corto ?? a.nombre).localeCompare(b.nombre_corto ?? b.nombre);
  const gruposOrdenados = Array.from(gruposBySec.values()).sort((a, b) =>
    sortByName(a.secretaria, b.secretaria)
  );
  for (const g of gruposOrdenados) {
    g.direcciones = new Map(
      Array.from(g.direcciones.entries()).sort((a, b) =>
        sortByName(a[1].unidad, b[1].unidad)
      )
    );
  }

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Indicadores</h1>
          <p className="text-sm text-muted mt-1">
            {filtrados.length} de {indicadores.length} indicadores · agrupados por Secretaría
          </p>
        </div>
        <Suspense>
          <IndicadoresFiltros unidades={unidadesFiltro} />
        </Suspense>
      </div>

      {filtrados.length === 0 ? (
        <EmptyState
          title="Sin indicadores"
          description="Probá cambiar los filtros o el ámbito seleccionado"
          icon="◉"
        />
      ) : (
        <div className="space-y-8">
          {gruposOrdenados.map((grupo) => (
            <section key={grupo.secretaria.id}>
              <div className="flex items-center gap-2 mb-3 sticky top-0 bg-background py-2 z-10">
                <div className="h-7 w-7 rounded-md bg-primary/20 flex items-center justify-center">
                  <span className="text-primary text-xs font-bold">
                    {grupo.secretaria.nombre_corto?.[0] ?? grupo.secretaria.nombre[0]}
                  </span>
                </div>
                <h2 className="text-sm font-bold text-foreground">
                  {grupo.secretaria.nombre}
                </h2>
                <span className="text-xs text-muted">
                  · {Array.from(grupo.direcciones.values()).reduce((acc, d) => acc + d.indicadores.length, 0)} indicadores
                </span>
              </div>

              <div className="space-y-4 pl-2">
                {Array.from(grupo.direcciones.values()).map(({ unidad, indicadores }) => (
                  <div key={unidad.id}>
                    <p className="text-xs font-semibold text-accent uppercase tracking-wider mb-2">
                      {unidad.nombre_corto ?? unidad.nombre} · {indicadores.length}
                    </p>
                    <div className="space-y-1.5">
                      {indicadores.slice(0, 50).map((ind) => (
                        <Link
                          key={ind.id}
                          href={`/indicadores/${ind.id}`}
                          className="flex items-center gap-3 p-2.5 rounded-lg border border-border bg-surface hover:bg-surface-hover hover:border-primary/30 transition-all group"
                        >
                          <div className="w-16 shrink-0">
                            <StatusBadge estado={estadoIndicadorEnPlazo(ind, hoy)} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              {ind.codigo && (
                                <span className="text-[10px] font-mono text-muted bg-border/50 px-1.5 py-0.5 rounded shrink-0">
                                  {ind.codigo}
                                </span>
                              )}
                              <h3 className="text-xs font-semibold text-foreground group-hover:text-primary transition-colors line-clamp-1">
                                {ind.nombre}
                              </h3>
                              <PlazoBadge inicio={ind.fecha_inicio} fin={ind.fecha_fin} hoy={hoy}
                                mostrarRango={false} cumplido={indicadorCumplido(ind)} />
                            </div>
                            {ind.meta && (
                              <p className="text-[10px] text-muted mt-0.5 line-clamp-1">
                                {ind.meta.nombre}
                              </p>
                            )}
                          </div>
                          <div className="hidden md:block text-right shrink-0 text-xs">
                            {ind.valor_actual != null && ind.valor_objetivo != null ? (
                              <p className="font-semibold text-foreground">
                                {ind.valor_actual} / {ind.valor_objetivo} {ind.unidad_medida ?? ""}
                              </p>
                            ) : ind.valor_actual_texto || ind.valor_objetivo_texto ? (
                              <p className="font-semibold text-foreground">
                                {ind.valor_actual_texto ?? "—"} / {ind.valor_objetivo_texto ?? "—"} {ind.unidad_medida ?? ""}
                              </p>
                            ) : (
                              <span className="text-[10px] text-muted">—</span>
                            )}
                          </div>
                          <span className="text-muted group-hover:text-primary transition-colors">→</span>
                        </Link>
                      ))}
                      {indicadores.length > 50 && (
                        <p className="text-[10px] text-muted text-center py-2">
                          + {indicadores.length - 50} más. Usá filtros para acotar.
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

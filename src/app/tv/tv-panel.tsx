import {
  getResumenDashboard,
  getUnidades,
  getIndicadoresAvance,
  type IndicadorAvance,
} from "@/lib/queries";
import { GaugeCumplimiento } from "@/components/ui/gauge-cumplimiento";
import {
  formatFecha,
  formatFechaRelativa,
  calcularPorcentajeMeta,
  semaforoColor,
  avanceMetaEnPlazo,
  avanceAgregado,
  porcentajeDeMedida,
  medidaDe,
  totalDistribucion,
  type AvanceNivel,
  type DistribucionEstados,
} from "@/lib/utils";
import type { EstadoSemaforo, Meta } from "@/types/database";

/**
 * Panel ejecutivo en modo TV. Mismo formato que /dashboard desde las
 * correcciones del 06.08 (medidor con aguja + tarjetas de estado de los
 * proyectos), reacomodado para entrar de una sola pantalla, sin scroll.
 *
 * Los números salen de las mismas funciones que el panel web, así que las dos
 * pantallas siempre dicen lo mismo.
 */
export async function TvPanel({
  periodoId,
  periodoNombre,
  medida: claveMedida,
}: {
  periodoId: string;
  periodoNombre: string;
  /**
   * Que mide el velocimetro. Por defecto, lo mismo que el Panel (01.10).
   *
   * Una pantalla de sala no tiene a nadie que elija, asi que se fija por URL:
   * /tv?medida=finalizados deja esa pantalla midiendo eso. Sin parametro,
   * muestra lo mismo que ve cualquiera que abra el Panel.
   */
  medida?: string;
}) {
  const [resumen, unidades, indicadores] = await Promise.all([
    getResumenDashboard(periodoId),
    getUnidades(),
    getIndicadoresAvance(periodoId),
  ]);

  const proyectosActivos = resumen.proyectos.filter((p) => p.estado === "activo");
  const hoy = new Date().toISOString().slice(0, 10);

  // Avance por proyecto vía cascada (indicadores → metas → proyecto), igual que
  // el Panel Ejecutivo. Considera el plazo.
  const indByMeta = new Map<string, IndicadorAvance[]>();
  for (const i of indicadores) {
    if (i.meta_id) (indByMeta.get(i.meta_id) ?? indByMeta.set(i.meta_id, []).get(i.meta_id)!).push(i);
  }
  const avancePorProyecto = new Map<string, AvanceNivel>();
  for (const py of proyectosActivos) {
    const metasPy = (resumen.metasPorProyecto.get(py.id) ?? []) as Meta[];
    const pcts = metasPy.map(
      (m) =>
        avanceMetaEnPlazo(
          indByMeta.get(m.id) ?? [],
          calcularPorcentajeMeta(m),
          { fecha_inicio: m.fecha_inicio, fecha_limite: m.fecha_limite },
          hoy
        ).pct
    );
    avancePorProyecto.set(py.id, avanceAgregado(pcts));
  }

  // Cumplimiento global (28.07): conteo de proyectos finalizados + en ejecución
  // sobre el total del período.
  const distribucionProyectos: DistribucionEstados = { verde: 0, amarillo: 0, rojo: 0, sin_datos: 0 };
  for (const py of proyectosActivos) {
    const av = avancePorProyecto.get(py.id);
    if (!av || av.conDatos === 0) distribucionProyectos.sin_datos++;
    else distribucionProyectos[av.estado as "verde" | "amarillo" | "rojo"]++;
  }
  const totalAmbito = totalDistribucion(distribucionProyectos);
  const medida = medidaDe(claveMedida);
  // La misma cuenta que el Panel: con la medida por defecto, el grado de avance.
  const pctsProyectos = proyectosActivos.map((py) => avancePorProyecto.get(py.id)?.pct ?? null);
  const porcentajeGlobal = porcentajeDeMedida(distribucionProyectos, medida.clave, pctsProyectos);
  const tieneSeguimiento =
    distribucionProyectos.verde + distribucionProyectos.amarillo + distribucionProyectos.rojo > 0;
  const pctSinDatos =
    totalAmbito > 0 ? Math.round((distribucionProyectos.sin_datos / totalAmbito) * 100) : 0;

  // Proyectos con seguimiento que están en rojo (no iniciados)
  const proyectosCriticos = proyectosActivos.filter((py) => {
    const av = avancePorProyecto.get(py.id);
    return av != null && av.conDatos > 0 && av.estado === "rojo";
  });

  // Próximos hitos (solo futuros) e hitos vencidos
  const proximosHitos = resumen.hitos
    .filter((h) => !h.completado && h.fecha_esperada && h.fecha_esperada >= hoy)
    .sort((a, b) => a.fecha_esperada!.localeCompare(b.fecha_esperada!))
    .slice(0, 2);
  const hitosVencidos = resumen.hitos.filter(
    (h) => !h.completado && h.fecha_esperada && h.fecha_esperada < hoy
  );

  const unidadesNivel1 = unidades.filter((u) => u.nivel === 1);

  return (
    <div className="flex-1 grid grid-cols-12 grid-rows-6 gap-5 min-h-0">

      {/* Cumplimiento global — medidor con aguja (06.08) */}
      <div className="col-span-4 row-span-3 rounded-2xl border border-border bg-surface p-6 flex flex-col">
        <p className="text-sm font-semibold text-foreground uppercase tracking-wider">
          Cumplimiento global del POA
        </p>
        <p className="text-xs text-muted mt-1">
          {medida.subtitulo} · {periodoNombre}
        </p>
        <div className="flex-1 flex items-center justify-center min-h-0">
          <GaugeCumplimiento
            value={tieneSeguimiento ? porcentajeGlobal : null}
            label={medida.rotulo}
            size={360}
            grosor={28}
            claseSvg="w-full max-w-[420px] h-auto"
          />
        </div>
        {!tieneSeguimiento && (
          <p className="text-sm text-muted/70 text-center">Aguardando primer reporte</p>
        )}
      </div>

      {/* KPIs */}
      <div className="col-span-8 row-span-1 grid grid-cols-4 gap-5">
        <TvKpi label="Proyectos" value={proyectosActivos.length} icon="▦" accent="primary" />
        <TvKpi label="Metas" value={resumen.totalMetas} icon="◎" accent="accent" />
        <TvKpi label="Indicadores" value={indicadores.length} icon="▤" accent="success" />
        <TvKpi
          label="Hitos cumplidos"
          value={`${resumen.hitosCompletados}/${resumen.hitosTotal}`}
          icon="◆"
          accent="warning"
        />
      </div>

      {/* Estado de los proyectos (06.08) */}
      <div className="col-span-8 row-span-2 grid grid-cols-4 gap-5">
        {CATEGORIAS.map((c) => {
          const cantidad = distribucionProyectos[c.key];
          const porcentaje = totalAmbito > 0 ? Math.round((cantidad / totalAmbito) * 100) : 0;
          return (
            <div
              key={c.key}
              className={`rounded-2xl border bg-surface p-5 flex flex-col justify-between ${c.borde}`}
            >
              <div className="flex items-center gap-2.5">
                <span
                  className={`h-9 w-9 rounded-lg flex items-center justify-center text-base shrink-0 ${c.fondo} ${c.texto}`}
                >
                  {c.icono}
                </span>
                <span className={`text-xs font-semibold uppercase tracking-wider ${c.texto}`}>
                  {c.label}
                </span>
              </div>
              <div className="flex items-end justify-between">
                <p className="text-5xl font-bold text-foreground tabular-nums leading-none">
                  {cantidad}
                </p>
                <p className={`text-xl font-semibold ${c.texto}`}>{porcentaje}%</p>
              </div>
              <div className="h-2 rounded-full bg-border/50 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${c.barra}`}
                  style={{ width: `${porcentaje}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Avance por área */}
      <div className="col-span-5 row-span-3 rounded-2xl border border-border bg-surface p-6 flex flex-col">
        <h2 className="text-lg font-semibold text-foreground mb-4">Avance por Área</h2>
        <div className="flex-1 space-y-4 overflow-hidden">
          {unidadesNivel1.map((unidad) => {
            const dirs = unidades.filter((u) => u.parent_id === unidad.id);
            const allIds = [unidad.id, ...dirs.map((d) => d.id)];
            const pysUnidad = proyectosActivos.filter((p) => allIds.includes(p.unidad_id));
            const areaAv = avanceAgregado(pysUnidad.map((p) => avancePorProyecto.get(p.id)?.pct ?? null));
            const tieneSeg = areaAv.conDatos > 0;
            const avg = areaAv.pct ?? 0;
            const estado: EstadoSemaforo = areaAv.estado;

            return (
              <div key={unidad.id} className="flex items-center gap-4">
                <div className="w-44 shrink-0">
                  <p className="text-base font-medium text-foreground truncate">{unidad.nombre_corto}</p>
                  <p className="text-xs text-muted">{pysUnidad.length} proyectos</p>
                </div>
                <div className="flex-1">
                  <div className="h-4 rounded-full bg-border/50 overflow-hidden">
                    {tieneSeg ? (
                      <div className={`h-full rounded-full transition-all duration-700 ${semaforoColor(estado)}`}
                        style={{ width: `${avg}%` }} />
                    ) : (
                      <div className="h-full w-full bg-border/20 flex items-center justify-center">
                        <span className="text-[9px] text-muted/40 uppercase tracking-wider">pendiente</span>
                      </div>
                    )}
                  </div>
                </div>
                <p className="text-2xl font-bold text-foreground w-16 text-right tabular-nums">
                  {tieneSeg ? `${avg}%` : "—"}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Proyectos no iniciados / estado de la planificación */}
      <div className="col-span-4 row-span-3 rounded-2xl border border-border bg-surface p-6 flex flex-col">
        {resumen.tieneSeguimiento && proyectosCriticos.length > 0 ? (
          <>
            <div className="flex items-center gap-2 mb-4">
              <span className="h-3 w-3 rounded-full bg-info" />
              <h2 className="text-lg font-semibold text-foreground">Proyectos No Iniciados</h2>
              <span className="text-sm text-muted">({proyectosCriticos.length})</span>
            </div>
            <div className="flex-1 space-y-3 overflow-hidden">
              {proyectosCriticos.slice(0, 4).map((py) => {
                const porcentaje = avancePorProyecto.get(py.id)?.pct ?? null;
                return (
                  <div key={py.id} className="flex items-center justify-between rounded-xl bg-info/5 border border-info/10 px-5 py-3">
                    <div className="min-w-0">
                      <p className="text-base font-semibold text-foreground line-clamp-1">{py.nombre}</p>
                      <p className="text-sm text-muted line-clamp-1">{py.unidad?.nombre_corto}</p>
                    </div>
                    <p className="text-3xl font-bold text-info shrink-0 ml-3">{porcentaje ?? 0}%</p>
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center gap-3">
            <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center">
              <span className="text-primary text-3xl">◎</span>
            </div>
            {resumen.tieneSeguimiento ? (
              <p className="text-xl text-success font-medium">Sin proyectos críticos</p>
            ) : (
              <>
                <p className="text-xl font-semibold text-foreground">Planificación Lista</p>
                <p className="text-sm text-muted text-center max-w-md">
                  {proyectosActivos.length} proyectos y {resumen.totalMetas} metas definidas.
                  Aguardando el inicio del seguimiento operativo.
                </p>
              </>
            )}
          </div>
        )}
      </div>

      {/* Próximos hitos + alertas */}
      <div className="col-span-3 row-span-3 flex flex-col gap-5 min-h-0">
        <div className="flex-1 rounded-2xl border border-accent/20 bg-surface p-5 flex flex-col min-h-0">
          <div className="flex items-center gap-2 mb-3">
            <span className="h-2.5 w-2.5 rounded-full bg-accent" />
            <h2 className="text-base font-semibold text-foreground">Próximos Hitos</h2>
          </div>
          <div className="flex-1 space-y-3 overflow-hidden">
            {proximosHitos.length > 0 ? proximosHitos.map((hito, i) => {
              const py = resumen.proyectos.find((p) => p.id === hito.proyecto_id);
              return (
                <div key={hito.id}
                  className={`rounded-xl px-4 py-3 border ${i === 0 ? "border-accent/30 bg-accent/5" : "border-border bg-background/50"}`}>
                  <p className={`text-xl font-bold tabular-nums ${i === 0 ? "text-accent" : "text-foreground"}`}>
                    {formatFecha(hito.fecha_esperada)}
                  </p>
                  <p className="text-sm font-medium text-foreground mt-0.5 line-clamp-1">{hito.nombre}</p>
                  <p className="text-xs text-muted line-clamp-1">{py?.nombre}</p>
                </div>
              );
            }) : (
              <div className="h-full flex items-center justify-center">
                <p className="text-sm text-muted">Sin hitos próximos</p>
              </div>
            )}
          </div>
        </div>

        <div className="flex-1 rounded-2xl border border-border bg-surface p-5 flex flex-col min-h-0">
          <h2 className="text-base font-semibold text-foreground mb-3">Alertas</h2>
          <div className="flex-1 space-y-2 overflow-hidden">
            {/* Aviso de proyectos sin datos (06.08) */}
            {distribucionProyectos.sin_datos > 0 && (
              <div className="rounded-xl bg-warning/5 border border-warning/20 px-4 py-2.5">
                <p className="text-sm font-semibold text-warning">
                  {distribucionProyectos.sin_datos} proyectos sin datos ({pctSinDatos}%)
                </p>
                <p className="text-xs text-muted">Pendientes de actualización</p>
              </div>
            )}
            {hitosVencidos.slice(0, 3).map((h) => {
              const py = resumen.proyectos.find((p) => p.id === h.proyecto_id);
              return (
                <div key={h.id} className="rounded-xl bg-info/5 border border-info/20 px-4 py-2.5">
                  <p className="text-sm font-semibold text-info line-clamp-1">{h.nombre}</p>
                  <p className="text-xs text-muted line-clamp-1">
                    {py?.nombre} · Vencido {formatFechaRelativa(h.fecha_esperada)}
                  </p>
                </div>
              );
            })}
            {distribucionProyectos.sin_datos === 0 && hitosVencidos.length === 0 && (
              <div className="h-full flex items-center justify-center">
                <p className="text-base text-success">Todo en orden</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Mismas cuatro categorías (y colores) que las tarjetas del panel web.
const CATEGORIAS = [
  {
    key: "verde",
    icono: "✓",
    label: "Finalizados",
    texto: "text-success",
    borde: "border-success/30",
    fondo: "bg-success/10",
    barra: "bg-success",
  },
  {
    key: "amarillo",
    icono: "◐",
    label: "En ejecución",
    texto: "text-warning",
    borde: "border-warning/30",
    fondo: "bg-warning/10",
    barra: "bg-warning",
  },
  {
    key: "rojo",
    icono: "▶",
    label: "No iniciados",
    texto: "text-info",
    borde: "border-info/30",
    fondo: "bg-info/10",
    barra: "bg-info",
  },
  {
    key: "sin_datos",
    icono: "◇",
    label: "Sin datos",
    texto: "text-muted",
    borde: "border-border",
    fondo: "bg-muted/10",
    barra: "bg-muted/50",
  },
] as const;

const CHIPS = {
  primary: "bg-primary/10 text-primary",
  accent: "bg-accent/10 text-accent",
  success: "bg-success/10 text-success",
  warning: "bg-warning/10 text-warning",
} as const;

const BORDES = {
  primary: "border-primary/30",
  accent: "border-accent/30",
  success: "border-success/30",
  warning: "border-warning/30",
} as const;

function TvKpi({
  label,
  value,
  icon,
  accent,
}: {
  label: string;
  value: string | number;
  icon: string;
  accent: keyof typeof CHIPS;
}) {
  return (
    <div className={`rounded-2xl border bg-surface px-5 flex items-center gap-4 ${BORDES[accent]}`}>
      <span className={`h-12 w-12 rounded-xl flex items-center justify-center text-xl shrink-0 ${CHIPS[accent]}`}>
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-xs font-medium uppercase tracking-wider text-muted">{label}</p>
        <p className="text-4xl font-bold tracking-tight text-foreground tabular-nums leading-tight">
          {value}
        </p>
      </div>
    </div>
  );
}

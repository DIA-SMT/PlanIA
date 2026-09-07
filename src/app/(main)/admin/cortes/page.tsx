import { getPerfilActual } from "@/lib/auth";
import { listarCortes, finDeTrimestre } from "@/lib/corte-trimestral";
import { TomarCorteBoton } from "@/components/admin/tomar-corte-boton";
import { BackButton } from "@/components/layout/back-button";
import { EmptyState } from "@/components/ui/empty-state";
import { formatFecha } from "@/lib/utils";

export const revalidate = 0;

/**
 * Cortes trimestrales — etapa 1 del reporte trimestral.
 *
 * Solo Planificación Estratégica. Es una pantalla de infraestructura: el
 * reporte en sí (etapas 2 a 7) va a leer de acá.
 */
export default async function CortesPage() {
  const perfil = await getPerfilActual();
  if (!perfil || perfil.rol !== "admin_funcional") {
    return (
      <div className="space-y-6 max-w-3xl">
        <BackButton fallback="/dashboard" />
        <EmptyState
          title="Solo Planificación Estratégica"
          description="Los cortes trimestrales los administra la Dirección de Planificación Estratégica."
          icon="⚿"
        />
      </div>
    );
  }

  const hoy = new Date().toISOString().slice(0, 10);
  let cortes: Awaited<ReturnType<typeof listarCortes>> = [];
  let errorTabla: string | null = null;
  try {
    cortes = await listarCortes();
  } catch (e) {
    // La migración 045 puede no estar aplicada todavía: el código se despliega
    // solo y las migraciones las aplica una persona.
    errorTabla = e instanceof Error ? e.message : String(e);
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <BackButton fallback="/dashboard" />

      <div>
        <h1 className="text-2xl font-bold text-foreground">Cortes trimestrales</h1>
        <p className="text-sm text-muted mt-1">
          Cada corte guarda cómo estaba el POA ese día. Es lo que después lee el reporte
          trimestral de cumplimiento.
        </p>
      </div>

      <section className="rounded-xl border border-border bg-surface p-4 space-y-3">
        <div>
          <h2 className="text-sm font-bold text-foreground">Por qué existe esto</h2>
          <p className="text-xs text-muted mt-1 leading-relaxed">
            PlanIA no puede decir cómo estaba el municipio en una fecha pasada: el
            historial de carga arranca el 31 de julio de 2026 y cubre una parte de los
            indicadores. Si el cierre del trimestre pasa sin foto, el reporte de ese
            trimestre no se puede reconstruir después. El proceso automático la toma sola
            el último día de cada trimestre; el botón de acá abajo es la red.
          </p>
        </div>
        <TomarCorteBoton finDeTrimestre={finDeTrimestre(hoy)} />
      </section>

      {errorTabla ? (
        <div className="rounded-xl border border-warning/30 bg-warning/5 p-4">
          <p className="text-sm font-semibold text-warning">No se pudo leer los cortes</p>
          <p className="text-xs text-muted mt-1">
            Probablemente falte aplicar la migración{" "}
            <code className="text-foreground">045_corte_trimestral.sql</code>.
          </p>
          <p className="text-[11px] text-muted/70 mt-2 font-mono break-all">{errorTabla}</p>
        </div>
      ) : cortes.length === 0 ? (
        <EmptyState
          title="Todavía no hay ningún corte"
          description={`El próximo cierre de trimestre es el ${finDeTrimestre(hoy)}. Podés tomar una foto ahora para probar.`}
          icon="◷"
        />
      ) : (
        <div className="rounded-xl border border-border bg-surface overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-surface-hover/40">
                  {["Corte", "Tomada", "Proyectos", "Final.", "En ejec.", "No inic.", "Sin datos", "Avance"].map(
                    (h) => (
                      <th
                        key={h}
                        className="text-left px-3 py-2 text-[10px] text-muted uppercase tracking-wider font-medium whitespace-nowrap"
                      >
                        {h}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody>
                {cortes.map((c) => {
                  const desfasado = c.fecha_corte !== String(c.tomado_at).slice(0, 10);
                  return (
                    <tr key={c.id} className="border-b border-border/60 last:border-0">
                      <td className="px-3 py-2 whitespace-nowrap">
                        <span className="font-semibold text-foreground">
                          {c.anio} · T{c.trimestre}
                        </span>
                        <span className="text-muted ml-2 text-xs">{formatFecha(c.fecha_corte)}</span>
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-xs text-muted">
                        {formatFecha(String(c.tomado_at).slice(0, 10))}
                        <span className="ml-1.5 text-[10px] uppercase tracking-wider">
                          {c.origen === "automatico" ? "auto" : "manual"}
                        </span>
                        {desfasado && (
                          <span
                            className="ml-1.5 text-warning"
                            title="La foto se tomó un día distinto al de la fecha del corte"
                          >
                            ⚠
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 tabular-nums font-semibold">{c.proyectos}</td>
                      <td className="px-3 py-2 tabular-nums text-success">{c.finalizados}</td>
                      <td className="px-3 py-2 tabular-nums text-warning">{c.en_ejecucion}</td>
                      <td className="px-3 py-2 tabular-nums text-info">{c.no_iniciados}</td>
                      <td className="px-3 py-2 tabular-nums text-muted">{c.sin_datos}</td>
                      <td className="px-3 py-2 tabular-nums font-semibold">
                        {c.pct_promedio != null ? `${c.pct_promedio}%` : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <p className="text-[11px] text-muted/70 leading-relaxed">
        Tomar la foto dos veces el mismo día reemplaza la de ese día. Tomarla otro día crea
        una nueva y no pisa la anterior: un reporte ya emitido no puede dejar de coincidir
        con el sistema. El ⚠ marca los cortes cuya foto se tomó en una fecha distinta a la
        del cierre.
      </p>
    </div>
  );
}

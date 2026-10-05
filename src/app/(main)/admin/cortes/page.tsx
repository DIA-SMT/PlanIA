import { getPerfilActual } from "@/lib/auth";
import {
  listarCortes,
  finDeTrimestre,
  ultimoCierrePasado,
  cierrePendiente,
  DIAS_MAXIMOS_DE_RESCATE,
} from "@/lib/corte-trimestral";
import { sumarDias } from "@/lib/queries";
import { TomarCorteBoton } from "@/components/admin/tomar-corte-boton";
import { EnviarInformesBoton } from "@/components/admin/enviar-informes-boton";
import { BackButton } from "@/components/layout/back-button";
import { EmptyState } from "@/components/ui/empty-state";
import { formatFecha, hoyLocal } from "@/lib/utils";

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

  const hoy = hoyLocal();
  let cortes: Awaited<ReturnType<typeof listarCortes>> = [];
  let errorTabla: string | null = null;
  try {
    cortes = await listarCortes();
  } catch (e) {
    // La migración 045 puede no estar aplicada todavía: el código se despliega
    // solo y las migraciones las aplica una persona.
    errorTabla = e instanceof Error ? e.message : String(e);
  }

  // Si quedó un cierre de trimestre sin foto, cuánto falta para que ya no se
  // pueda rescatar. 05.10: el del T3 no salió —el proceso programado falló la
  // primera vez que le tocaba— y nadie lo sabía, porque esta pantalla no lo
  // decía. Ahora lo dice arriba de todo, con la fecha límite.
  const pendiente = errorTabla ? null : await cierrePendiente(hoy).catch(() => null);
  const limite = pendiente?.fecha ? sumarDias(pendiente.fecha, DIAS_MAXIMOS_DE_RESCATE) : null;
  const quedan = pendiente?.fecha ? DIAS_MAXIMOS_DE_RESCATE - pendiente.dias : 0;

  return (
    <div className="space-y-6 max-w-4xl">
      <BackButton fallback="/dashboard" />

      {pendiente?.fecha && !pendiente.vencido && (
        <div className="rounded-xl border border-warning/40 bg-warning/10 p-4">
          <p className="text-sm font-semibold text-warning">
            El cierre del {formatFecha(pendiente.fecha)} todavía no tiene foto
          </p>
          <p className="text-xs text-foreground/80 mt-1 leading-relaxed">
            Se puede rescatar hasta el <strong>{formatFecha(limite)}</strong>
            {quedan > 0 ? ` — ${quedan === 1 ? "queda 1 día" : `quedan ${quedan} días`}` : ""}.
            Después de esa fecha el sistema ya no deja tomarla, porque los datos de ese día
            ya no serían los del cierre. Se toma con el botón de abajo, “Tomar la foto ahora”: la fecha del cierre ya viene puesta.
          </p>
        </div>
      )}
      {pendiente?.fecha && pendiente.vencido && (
        <div className="rounded-xl border border-danger/30 bg-danger/5 p-4">
          <p className="text-sm font-semibold text-danger">
            El cierre del {formatFecha(pendiente.fecha)} quedó sin foto
          </p>
          <p className="text-xs text-muted mt-1">
            Ya pasó la ventana para rescatarlo. El informe de ese trimestre no se puede
            reconstruir con los datos de hoy.
          </p>
        </div>
      )}

      <div>
        <h1 className="text-2xl font-bold text-foreground">Cortes e informes</h1>
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
        <TomarCorteBoton
          ultimoCierre={ultimoCierrePasado(hoy)}
          proximoCierre={finDeTrimestre(hoy)}
          hoy={hoy}
          pendiente={pendiente?.fecha && !pendiente.vencido ? pendiente.fecha : null}
        />
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
          description={`El último cierre fue el ${formatFecha(ultimoCierrePasado(hoy))} y el próximo es el ${formatFecha(finDeTrimestre(hoy))}. La foto se toma con el botón de arriba.`}
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

      {/* 18.09, párrafo 1033: "la idea es que le llegue el informe a cada mail,
          a cada secretario, subsecretario y director". Va acá y no en la
          pantalla del reporte, que quedó con solo tres botones, y se dispara a
          mano: son 68 correos y conviene que alguien decida cuándo salen. */}
      {/* 02.10: "tengo entendido que Abril solicitó que se mande por mail a los
          mails registrados y no tenemos esa opción". La opción existía desde el
          18.09, pero esta sección solo se dibujaba cuando ya había un corte, y no
          había ninguno: el correo era invisible. Ahora se ve siempre, y sin corte
          explica qué falta. */}
      {cortes.length === 0 && !errorTabla && (
        <section className="rounded-xl border border-border bg-surface p-4 space-y-2">
          <h2 className="text-sm font-bold text-foreground">
            Enviar el informe a los responsables
          </h2>
          <p className="text-xs text-muted leading-relaxed">
            A cada secretario, subsecretario y director le llega por correo el informe de
            avance de <strong>su</strong> área. El informe sale de un corte, así que primero
            hay que tomar la foto del trimestre con el botón de arriba; después aparece acá el
            botón para enviarlo.
          </p>
        </section>
      )}
      {cortes.length > 0 && (
        <section className="rounded-xl border border-border bg-surface p-4 space-y-3">
          <div>
            <h2 className="text-sm font-bold text-foreground">
              Enviar el informe a los responsables
            </h2>
            <p className="text-xs text-muted mt-1 leading-relaxed">
              A cada secretario, subsecretario y director le llega por correo el informe de
              avance de <strong>su</strong> área, con sus números y el enlace al detalle. Las
              áreas sin proyectos no reciben nada. Sale del último corte tomado:{" "}
              {cortes[0].anio} · T{cortes[0].trimestre} del {formatFecha(cortes[0].fecha_corte)}.
            </p>
          </div>
          <EnviarInformesBoton
            corteId={cortes[0].id}
            etiqueta={`${cortes[0].trimestre}° trimestre ${cortes[0].anio}`}
          />
        </section>
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

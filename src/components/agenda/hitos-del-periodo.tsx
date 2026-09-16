import type { HitoCalendario } from "@/lib/queries";

/**
 * El calendario de hitos del municipio, arriba de la agenda.
 *
 * 15.09, párrafos 799 a 803: "necesitamos que las fechas que tienen, con sus
 * actividades, se visualicen en la agenda de todos los usuarios, no importa el
 * tipo de perfil que tengan".
 *
 * Va como banda aparte y no dentro de los días del calendario. Medido sobre la
 * planilla: 54 de los 92 hitos duran más de un día, la mediana de esos es de 29
 * días y hay jornadas con 24 hitos encima. Pintados día por día taparían la
 * agenda que cada área carga, que es lo que la pantalla vino a mostrar. Acá cada
 * hito aparece una vez, con su rango escrito.
 */

const COLOR_TIPO: Record<string, string> = {
  EVENTO: "text-primary bg-primary/10 border-primary/30",
  EFEMERIDE: "text-accent bg-accent/10 border-accent/30",
  ACTIVIDAD: "text-success bg-success/10 border-success/30",
  PROYECTO: "text-warning bg-warning/10 border-warning/30",
  PROGRAMA: "text-muted bg-border/40 border-border",
};

function rango(desde: string, hasta: string): string {
  const f = (iso: string) =>
    new Date(iso + "T00:00:00").toLocaleDateString("es-AR", { day: "numeric", month: "short" });
  return desde === hasta ? f(desde) : `${f(desde)} al ${f(hasta)}`;
}

export function HitosDelPeriodo({ hitos }: { hitos: HitoCalendario[] }) {
  if (hitos.length === 0) return null;

  const propios = hitos.filter((h) => !h.enCurso);
  const enCurso = hitos.filter((h) => h.enCurso);

  return (
    <section className="rounded-xl border border-border bg-surface overflow-hidden">
      <div className="px-4 py-2.5 border-b border-border flex items-baseline gap-2 flex-wrap">
        <h2 className="text-sm font-semibold text-foreground">Calendario de hitos</h2>
        <span className="text-[11px] text-muted">
          {propios.length > 0
            ? `${propios.length} ${propios.length === 1 ? "hito" : "hitos"} en este período`
            : "sin hitos propios de este período"}
          {enCurso.length > 0 && ` · ${enCurso.length} en curso`} · del municipio
        </span>
      </div>

      <ul className="divide-y divide-border/60 max-h-72 overflow-y-auto">
        {hitos.map((h) => (
          <li
            key={h.id}
            className={`flex items-start gap-3 px-4 py-2 ${h.enCurso ? "opacity-60" : ""}`}
          >
            <span className="text-[11px] text-muted tabular-nums shrink-0 w-28 pt-0.5">
              {/* Los que vienen de antes y siguen después no se fechan: repetir
                  "5 ene al 30 dic" en cada semana del año no dice nada. */}
              {h.enCurso ? "todo el período" : rango(h.fecha_desde, h.fecha_hasta)}
            </span>
            {h.tipo && (
              <span
                className={`text-[9px] uppercase tracking-wider font-semibold rounded px-1.5 py-0.5 border shrink-0 ${
                  COLOR_TIPO[h.tipo] ?? "text-muted bg-border/40 border-border"
                }`}
              >
                {h.tipo}
              </span>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-xs text-foreground">{h.nombre}</p>
              {(h.direccion || h.secretaria) && (
                <p className="text-[10px] text-muted mt-0.5">{h.direccion || h.secretaria}</p>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

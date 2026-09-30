import Link from "next/link";
import type { Actividad, VistaAgenda } from "@/lib/agenda-geo-comun";
import { tipoDe, estadoDe } from "@/lib/agenda-geo-comun";
import { estiloChip } from "@/lib/colores-agenda";
import type { HitoCalendario } from "@/lib/queries";

const DIAS_CORTOS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

interface Props {
  vista: VistaAgenda;
  /** Días que se muestran, en orden (YYYY-MM-DD). */
  dias: string[];
  actividades: Actividad[];
  /** Mes de referencia (0-11) — en vista mes, los días de otro mes se atenúan. */
  mesReferencia: number;
  hoy: string;
  /**
   * Los filtros activos, para que los enlaces al día no los pierdan.
   *
   * Sin esto, filtrar por "Salud" y hacer clic en un día devolvía el día
   * entero sin filtrar, que es justo lo contrario de lo que uno pidió.
   */
  paramsActuales: Record<string, string>;
  /**
   * Los hitos del municipio, pintados DENTRO de la cuadrícula.
   *
   * Vienen de la agenda de PlanIA, que se fue el 30.09. Se conserva la
   * corrección del 18.09 al pie de la letra: "los hitos están arriba y no
   * propiamente en el calendario, necesitamos trasladarlos a la cuadrícula".
   * Antes de eso eran una banda aparte y pidieron que no lo fueran; moverlos de
   * producto no es motivo para devolverlos a donde no los querían.
   *
   * Los ve todo el mundo sin filtro por área ni por rol (15.09, párrafo 803).
   */
  hitos?: HitoCalendario[];
}

/**
 * La agenda de la Agenda Georreferenciada: mes, semana y día (etapa 2 del plan
 * del 22.09).
 *
 * Hermana de `agenda/calendario-vista.tsx` y no la misma. Aquella está tipada a
 * `EventoAgenda` —`actividad`, `horario`, `lugar`, `fecha_lunes`— y enlaza a
 * `/agenda/:unidad/:semana`; una `Actividad` no tiene ninguno de esos campos y
 * sí tiene dos que aquella desconoce, `tipo` y `estado`, que son justamente por
 * los que se filtra acá. Lo que sí se reusa es la forma de las tres vistas y
 * `estiloChip`, que ya sabe pintar un chip a partir de un hex.
 *
 * El color sale del TIPO de actividad, no de la unidad: es el mismo criterio
 * que va a usar el pin del mapa en la etapa 3, y está definido una sola vez en
 * `agenda-geo-comun.ts`.
 */
export function AgendaVista({
  vista,
  dias,
  actividades,
  mesReferencia,
  hoy,
  paramsActuales,
  hitos = [],
}: Props) {
  const porDia = new Map<string, Actividad[]>();
  for (const a of actividades) {
    (porDia.get(a.fecha) ?? porDia.set(a.fecha, []).get(a.fecha)!).push(a);
  }

  // Un hito con rango entra en todos los días que cubre. Se recorren los días
  // que la vista muestra y no el rango del hito, que puede ser de meses.
  const hitosPorDia = new Map<string, HitoCalendario[]>();
  for (const h of hitos) {
    for (const d of dias) {
      if (d >= h.fecha_desde && d <= h.fecha_hasta) {
        (hitosPorDia.get(d) ?? hitosPorDia.set(d, []).get(d)!).push(h);
      }
    }
  }
  // Primero los que EMPIEZAN o TERMINAN ese día, después los que vienen
  // corriendo. Sin esto los hitos que duran todo el año encabezan las 31
  // casillas del mes y empujan abajo lo que de verdad pasa ese día.
  for (const [d, lista] of hitosPorDia) {
    const propio = (h: HitoCalendario) => (h.fecha_desde === d || h.fecha_hasta === d ? 0 : 1);
    lista.sort((a, b) => propio(a) - propio(b) || a.nombre.localeCompare(b.nombre, "es"));
  }

  /** Enlace al día, conservando los filtros que estén puestos. */
  const alDia = (fecha: string) => ({
    pathname: "/territorio/agenda",
    query: { ...paramsActuales, vista: "dia", fecha },
  });

  if (vista === "dia") {
    const fecha = dias[0];
    const delDia = porDia.get(fecha) ?? [];
    return (
      <div className="rounded-xl border border-border bg-surface overflow-hidden">
        <div className="px-4 py-3 border-b border-border bg-border/20">
          <p className="text-sm font-semibold text-foreground first-letter:uppercase">{legibleLargo(fecha)}</p>
          <p className="text-[11px] text-muted">
            {delDia.length} {delDia.length === 1 ? "actividad" : "actividades"}
          </p>
        </div>
        {(hitosPorDia.get(fecha) ?? []).length > 0 && (
          <ul className="divide-y divide-border border-b border-border">
            {(hitosPorDia.get(fecha) ?? []).map((h) => (
              <li key={h.id} className="p-3">
                <HitoChip hito={h} />
              </li>
            ))}
          </ul>
        )}
        {delDia.length === 0 ? (
          <p className="p-6 text-sm text-muted text-center">
            Sin actividades cargadas para este día.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {delDia.map((a) => (
              <li key={a.id} className="p-3">
                <ActividadFila actividad={a} />
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  if (vista === "semana") {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-7 gap-2">
        {dias.map((fecha, i) => {
          const delDia = porDia.get(fecha) ?? [];
          const esHoy = fecha === hoy;
          return (
            <div
              key={fecha}
              className={`rounded-xl border bg-surface min-h-[220px] flex flex-col ${
                esHoy ? "border-primary/50" : "border-border"
              }`}
            >
              <Link
                href={alDia(fecha)}
                className={`px-2 py-1.5 border-b text-center block hover:bg-surface-hover transition-colors ${
                  esHoy ? "border-primary/30 bg-primary/10" : "border-border"
                }`}
              >
                <p className="text-[10px] text-muted uppercase tracking-wider">{DIAS_CORTOS[i]}</p>
                <p className={`text-sm font-bold ${esHoy ? "text-primary" : "text-foreground"}`}>
                  {Number(fecha.slice(8, 10))}
                </p>
              </Link>
              <div className="p-1.5 space-y-1 flex-1">
                {(hitosPorDia.get(fecha) ?? []).map((h) => (
                  <HitoChip key={h.id} hito={h} compacto />
                ))}
                {delDia.map((a) => (
                  <ActividadChip key={a.id} actividad={a} />
                ))}
                {delDia.length === 0 && (hitosPorDia.get(fecha) ?? []).length === 0 && (
                  <p className="text-[10px] text-muted/50 text-center pt-4">—</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  // Vista mes
  const semanas: string[][] = [];
  for (let i = 0; i < dias.length; i += 7) semanas.push(dias.slice(i, i + 7));

  return (
    <div className="rounded-xl border border-border bg-surface overflow-hidden">
      <div className="grid grid-cols-7 bg-border/20 border-b border-border">
        {DIAS_CORTOS.map((d) => (
          <div
            key={d}
            className="px-2 py-2 text-[10px] text-muted uppercase tracking-wider text-center"
          >
            {d}
          </div>
        ))}
      </div>
      <div>
        {semanas.map((semana, si) => (
          <div key={si} className="grid grid-cols-7 border-b border-border last:border-b-0">
            {semana.map((fecha) => {
              const delDia = porDia.get(fecha) ?? [];
              const esHoy = fecha === hoy;
              const otroMes = Number(fecha.slice(5, 7)) - 1 !== mesReferencia;
              // Tres por casilla: es lo que entra sin que la fila crezca y
              // desacomode el mes entero. El resto se cuenta y se entra al día.
              const visibles = delDia.slice(0, 3);
              const resto = delDia.length - visibles.length;
              return (
                <div
                  key={fecha}
                  className={`min-h-[110px] border-r border-border last:border-r-0 p-1.5 ${
                    otroMes ? "bg-background/40" : ""
                  }`}
                >
                  <div className="flex items-center justify-end mb-1">
                    <Link
                      href={alDia(fecha)}
                      className={`text-[11px] h-5 min-w-5 px-1 rounded-full inline-flex items-center justify-center ${
                        esHoy
                          ? "bg-primary text-white font-bold"
                          : otroMes
                          ? "text-muted/50"
                          : "text-muted hover:text-foreground"
                      }`}
                    >
                      {Number(fecha.slice(8, 10))}
                    </Link>
                  </div>
                  <div className="space-y-1">
                    {(hitosPorDia.get(fecha) ?? []).slice(0, 2).map((h) => (
                      <HitoChip key={h.id} hito={h} compacto />
                    ))}
                    {(hitosPorDia.get(fecha) ?? []).length > 2 && (
                      <Link
                        href={alDia(fecha)}
                        className="block text-[10px] text-muted hover:text-primary pl-1"
                      >
                        +{(hitosPorDia.get(fecha) ?? []).length - 2} hitos
                      </Link>
                    )}
                    {visibles.map((a) => (
                      <ActividadChip key={a.id} actividad={a} compacto />
                    ))}
                    {resto > 0 && (
                      <Link
                        href={alDia(fecha)}
                        className="block text-[10px] text-muted hover:text-primary pl-1"
                      >
                        +{resto} más
                      </Link>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Un hito del municipio dentro de una casilla.
 *
 * Se distingue de una actividad a propósito: las actividades son de un área y
 * llevan el color de su tipo; los hitos son de todos y llevan siempre el mismo,
 * con un punto lleno adelante. Si no se diferenciaran, un día con tres hitos
 * parecería un día con tres actividades del área que uno está mirando.
 */
function HitoChip({ hito, compacto = false }: { hito: HitoCalendario; compacto?: boolean }) {
  const varios = hito.fecha_desde !== hito.fecha_hasta;
  return (
    <div
      title={`${hito.nombre}${hito.tipo ? ` · ${hito.tipo}` : ""}${
        varios ? ` · del ${hito.fecha_desde} al ${hito.fecha_hasta}` : ""
      }${hito.secretaria ? ` · ${hito.secretaria}` : ""}`}
      className={`flex items-center gap-1 rounded border border-accent/30 bg-accent/10 ${
        compacto ? "px-1 py-0.5" : "px-1.5 py-1"
      }`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-accent shrink-0" />
      <span className={`${compacto ? "text-[10px]" : "text-xs"} text-accent truncate`}>
        {hito.nombre}
      </span>
    </div>
  );
}

/** Una actividad en la vista de día. El título abre su ficha (etapa 4). */
function ActividadFila({ actividad: a }: { actividad: Actividad }) {
  const t = tipoDe(a.tipo);
  const e = estadoDe(a.estado);
  return (
    <div className="flex items-start gap-3">
      <span
        className="mt-1.5 h-2 w-2 rounded-full shrink-0"
        style={{ backgroundColor: t.hex }}
        title={t.rotulo}
      />
      <span className="w-24 shrink-0 text-xs text-muted tabular-nums">{horario(a) ?? "—"}</span>
      <span className="flex-1 min-w-0">
        <Link
          href={`/territorio/actividades/${a.id}`}
          className="block text-sm text-foreground hover:text-primary"
        >
          {a.titulo}
        </Link>
        <span className="block text-[11px] text-muted">
          {a.unidad_nombre ?? "—"}
          {a.lugar_texto ? ` · ${a.lugar_texto}` : ""}
        </span>
        {a.descripcion && (
          <span className="block text-[11px] text-muted/80 italic mt-0.5 line-clamp-2">
            {a.descripcion}
          </span>
        )}
      </span>
      <span className="flex items-center gap-2 shrink-0">
        {a.requiere_confirmacion && a.estado === "programada" && (
          <span className="text-[10px] text-warning" title="Requiere confirmación">
            ⚠
          </span>
        )}
        <span
          className={`text-[10px] uppercase tracking-wider border rounded px-1.5 py-0.5 ${e.clase}`}
        >
          {e.rotulo}
        </span>
      </span>
    </div>
  );
}

function ActividadChip({
  actividad: a,
  compacto = false,
}: {
  actividad: Actividad;
  compacto?: boolean;
}) {
  const t = tipoDe(a.tipo);
  const e = estadoDe(a.estado);
  return (
    <Link
      href={`/territorio/actividades/${a.id}`}
      title={`${horario(a) ? horario(a) + " · " : ""}${a.titulo}${
        a.lugar_texto ? ` · ${a.lugar_texto}` : ""
      } — ${a.unidad_nombre ?? "—"} · ${t.rotulo} · ${e.rotulo}`}
      style={estiloChip(t.hex)}
      className={`block rounded border px-1.5 py-1 hover:brightness-125 transition ${
        // Una suspendida sigue estando —se avisó que iba a pasar— pero no puede
        // pesar lo mismo que una que sigue en pie.
        a.estado === "suspendida" ? "opacity-50 line-through" : ""
      }`}
    >
      <p className={`${compacto ? "text-[10px]" : "text-[11px]"} font-medium line-clamp-1`}>
        {a.hora_desde ? <span className="opacity-80">{a.hora_desde.slice(0, 5)} </span> : null}
        {a.titulo}
      </p>
      {!compacto && (
        <p className="text-[9px] opacity-70 line-clamp-1">{a.unidad_nombre ?? "—"}</p>
      )}
    </Link>
  );
}

/** "09:00 a 11:30", "09:00", o null si no se cargó horario. */
function horario(a: Actividad): string | null {
  if (!a.hora_desde) return null;
  const desde = a.hora_desde.slice(0, 5);
  return a.hora_hasta ? `${desde} a ${a.hora_hasta.slice(0, 5)}` : desde;
}

function legibleLargo(fechaIso: string): string {
  return new Date(fechaIso + "T00:00:00").toLocaleDateString("es-AR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

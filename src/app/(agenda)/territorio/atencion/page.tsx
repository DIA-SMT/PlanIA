import Link from "next/link";
import { hoyLocal, unidadesQuePuedeCargar } from "@/lib/utils";
import { getPerfilActual } from "@/lib/auth";
import { getUnidades } from "@/lib/queries";
import {
  getRequierenAtencion,
  getHistorialDeVarias,
  tipoDe,
  estadoDe,
  faltantesDe,
  type Actividad,
  type CambioActividad,
} from "@/lib/agenda-geo";
import { HistorialActividad } from "@/components/territorio/historial-actividad";
import { AccionesEstado } from "@/components/territorio/acciones-estado";
import { EmptyState } from "@/components/ui/empty-state";

export const revalidate = 0;
export const metadata = { title: "Requiere atención" };

/**
 * Requiere atención — etapa 5 del plan del 22.09.
 *
 * "La lista de requiere atención: pendientes, modificadas hoy, incompletas. El
 * historial de cambios por actividad."
 *
 * Nada de esto se guarda: se calcula en cada visita. Una actividad sale de la
 * lista en el momento en que alguien la confirma o la completa, sin que haya
 * que acordarse de borrar una alerta.
 *
 * El historial se muestra solo en "modificadas hoy", que es donde la pregunta
 * es justamente qué cambió. Traerlo para las tres listas serían cientos de
 * filas para responder algo que nadie preguntó.
 */
export default async function AtencionPage() {
  const hoy = hoyLocal();

  let datos = {
    pendientes: [] as Actividad[],
    modificadas: [] as Actividad[],
    incompletas: [] as Actividad[],
  };
  let historial = new Map<string, CambioActividad[]>();
  let error: string | null = null;
  try {
    datos = await getRequierenAtencion(hoy);
    historial = await getHistorialDeVarias(datos.modificadas.map((a) => a.id));
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  // Sobre que areas puede actuar: la RLS decide de verdad, pero un boton que va
  // a fallar es peor que ninguno.
  const perfil = await getPerfilActual();
  const unidades = await getUnidades().catch(() => []);
  const editables = new Set(
    (perfil ? unidadesQuePuedeCargar(perfil, unidades) : []).map((u) => u.id)
  );

  const total = datos.pendientes.length + datos.modificadas.length + datos.incompletas.length;

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Requiere atención</h1>
          <p className="text-sm text-muted mt-1">
            Lo que está esperando algo: una confirmación, un dato que falta, o un cambio
            reciente que conviene mirar.
          </p>
        </div>
        <Link
          href="/territorio/agenda"
          className="text-xs text-foreground border border-border hover:border-primary/40 rounded-lg px-3 py-1.5 self-start"
        >
          📅 Ver la agenda
        </Link>
      </div>

      {error ? (
        <div className="rounded-xl border border-danger/30 bg-danger/5 p-4">
          <p className="text-sm font-semibold text-danger">No se pudieron leer las actividades</p>
          <p className="text-xs text-muted mt-1 font-mono break-all">{error}</p>
          <p className="text-xs text-muted mt-2">
            Si dice que no existe la tabla, falta aplicar la migración 052.
          </p>
        </div>
      ) : total === 0 ? (
        <EmptyState
          title="No hay nada esperando"
          description="Ninguna actividad próxima está pendiente de confirmación ni le faltan datos, y hoy no se modificó ninguna."
          icon="✓"
        />
      ) : (
        <div className="space-y-6">
          <Grupo
            titulo="Pendientes de confirmación"
            explicacion="Se cargaron pidiendo confirmación y siguen programadas. Quien las organiza tiene que confirmarlas o suspenderlas."
            actividades={datos.pendientes}
            color="text-warning"
            editables={editables}
          />

          <Grupo
            titulo="Modificadas hoy"
            explicacion="Cambiaron en el día. Si alguien movió una fecha o un lugar, acá se ve qué y quién."
            actividades={datos.modificadas}
            color="text-info"
            historial={historial}
          />

          <Grupo
            titulo="Incompletas"
            explicacion="Se cargaron rápido y quedaron a medias. Sin lugar y sin punto no salen en el mapa."
            actividades={datos.incompletas}
            color="text-muted"
            mostrarFaltantes
          />
        </div>
      )}
    </div>
  );
}

function Grupo({
  titulo,
  explicacion,
  actividades,
  color,
  historial,
  mostrarFaltantes = false,
  editables,
}: {
  titulo: string;
  explicacion: string;
  actividades: Actividad[];
  color: string;
  historial?: Map<string, CambioActividad[]>;
  mostrarFaltantes?: boolean;
  /** Areas donde esta persona puede actuar; habilita confirmar y suspender. */
  editables?: Set<string>;
}) {
  // Un grupo vacío no se dibuja: "Pendientes de confirmación — 0" ocupa el
  // mismo lugar que uno con algo y hace que la lista parezca larga cuando no
  // hay nada que hacer.
  if (actividades.length === 0) return null;

  return (
    <section className="space-y-2">
      <div className="flex items-baseline gap-2 border-b border-border pb-2">
        <h2 className={`text-sm font-semibold ${color}`}>{titulo}</h2>
        <span className="text-xs text-muted tabular-nums">{actividades.length}</span>
      </div>
      <p className="text-[11px] text-muted/80">{explicacion}</p>

      <div className="rounded-xl border border-border bg-surface divide-y divide-border">
        {actividades.map((a) => {
          const t = tipoDe(a.tipo);
          const e = estadoDe(a.estado);
          const faltan = mostrarFaltantes ? faltantesDe(a) : [];
          const cambios = historial?.get(a.id) ?? [];
          return (
            <div key={a.id} className="p-3 space-y-1.5">
              <div className="flex items-start gap-3">
                <span
                  className="h-2.5 w-2.5 rounded-full shrink-0 mt-1.5"
                  style={{ backgroundColor: t.hex }}
                  title={t.rotulo}
                />
                <div className="min-w-0 flex-1">
                  <Link
                    href={{
                      pathname: "/territorio/agenda",
                      query: { vista: "dia", fecha: a.fecha },
                    }}
                    className="text-sm font-medium text-foreground hover:text-primary"
                  >
                    {a.titulo}
                  </Link>
                  <p className="text-xs text-muted mt-0.5">
                    {a.fecha}
                    {a.hora_desde ? ` · ${a.hora_desde.slice(0, 5)}` : ""}
                    {" · "}
                    {a.unidad_nombre ?? "—"}
                    {a.lugar_texto ? ` · ${a.lugar_texto}` : ""}
                  </p>
                </div>
                <span
                  className={`text-[10px] uppercase tracking-wider border rounded px-1.5 py-0.5 shrink-0 ${e.clase}`}
                >
                  {e.rotulo}
                </span>
              </div>

              {faltan.length > 0 && (
                <p className="text-[11px] text-warning pl-[22px]">
                  Le falta: {faltan.join(", ")}.
                </p>
              )}

              {historial && (
                <div className="pl-[22px]">
                  <HistorialActividad cambios={cambios} limite={4} />
                </div>
              )}

              {editables?.has(a.unidad_id) && (
                <div className="pl-[22px]">
                  <AccionesEstado id={a.id} titulo={a.titulo} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

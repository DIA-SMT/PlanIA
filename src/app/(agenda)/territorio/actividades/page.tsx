import { getPerfilActual } from "@/lib/auth";
import { getUnidades } from "@/lib/queries";
import { unidadesQuePuedeCargar, hoyLocal, formatFecha } from "@/lib/utils";
import { getActividades, tipoDe, estadoDe } from "@/lib/agenda-geo";
import { FormActividad } from "@/components/territorio/form-actividad";
import { EmptyState } from "@/components/ui/empty-state";
import { BackButton } from "@/components/layout/back-button";

export const revalidate = 0;

/**
 * Actividades — la carga y el listado (etapa 1 del plan del 22.09).
 *
 * Muestra desde hoy hacia adelante, que es lo que se mira todos los días. Lo
 * pasado está en la agenda, que llega con la etapa 2 y tiene las vistas de
 * día, semana y mes.
 */
export default async function ActividadesPage() {
  const perfil = await getPerfilActual();
  const hoy = hoyLocal();

  const unidades = await getUnidades();
  const editables = perfil ? unidadesQuePuedeCargar(perfil, unidades) : [];

  const enDias = (n: number) => {
    const d = new Date(hoy + "T00:00:00");
    d.setDate(d.getDate() + n);
    return d.toISOString().slice(0, 10);
  };

  let actividades: Awaited<ReturnType<typeof getActividades>> = [];
  let error: string | null = null;
  try {
    actividades = await getActividades({ desde: hoy, hasta: enDias(60) });
  } catch (e) {
    // La migración 052 puede no estar aplicada todavía: el código se despliega
    // solo y las migraciones las aplica una persona.
    error = e instanceof Error ? e.message : String(e);
  }

  const porDia = new Map<string, typeof actividades>();
  for (const a of actividades) {
    (porDia.get(a.fecha) ?? porDia.set(a.fecha, []).get(a.fecha)!).push(a);
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <BackButton fallback="/territorio" />

      <div>
        <h1 className="text-2xl font-bold text-foreground">Actividades</h1>
        <p className="text-sm text-muted mt-1">
          Lo que viene, de hoy en adelante. Cada área carga las suyas y las ve todo el
          municipio.
        </p>
      </div>

      <FormActividad
        unidades={editables}
        unidadPorDefecto={perfil?.unidad_id ?? null}
        hoy={hoy}
      />

      {error ? (
        <div className="rounded-xl border border-danger/30 bg-danger/5 p-4">
          <p className="text-sm font-semibold text-danger">No se pudieron leer las actividades</p>
          <p className="text-xs text-muted mt-1 font-mono break-all">{error}</p>
          <p className="text-xs text-muted mt-2">
            Si dice que no existe la tabla, falta aplicar la migración 052.
          </p>
        </div>
      ) : actividades.length === 0 ? (
        <EmptyState
          title="No hay actividades cargadas para los próximos dos meses"
          description="Cargá la primera con el formulario de arriba."
          icon="📅"
        />
      ) : (
        <div className="space-y-4">
          {[...porDia.entries()].map(([fecha, delDia]) => (
            <section key={fecha} className="space-y-2">
              <h2 className="text-xs text-muted uppercase tracking-wider">
                {formatFecha(fecha)}
                {fecha === hoy && <span className="text-primary ml-2">hoy</span>}
              </h2>
              <div className="rounded-xl border border-border bg-surface divide-y divide-border">
                {delDia.map((a) => {
                  const t = tipoDe(a.tipo);
                  const e = estadoDe(a.estado);
                  return (
                    <div key={a.id} className="p-3 flex items-start gap-3">
                      <span
                        className="h-2.5 w-2.5 rounded-full shrink-0 mt-1.5"
                        style={{ backgroundColor: t.hex }}
                        title={t.rotulo}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-foreground">{a.titulo}</p>
                        <p className="text-xs text-muted mt-0.5">
                          {a.hora_desde ? `${a.hora_desde.slice(0, 5)} · ` : ""}
                          {a.unidad_nombre ?? "—"}
                          {a.lugar_texto ? ` · ${a.lugar_texto}` : ""}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {a.requiere_confirmacion && a.estado === "programada" && (
                          <span
                            className="text-[10px] text-warning"
                            title="Requiere confirmación"
                          >
                            ⚠
                          </span>
                        )}
                        <span
                          className={`text-[10px] uppercase tracking-wider border rounded px-1.5 py-0.5 ${e.clase}`}
                        >
                          {e.rotulo}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

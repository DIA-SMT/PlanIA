import Link from "next/link";
import { Suspense } from "react";
import { getUnidades } from "@/lib/queries";
import { hoyLocal } from "@/lib/utils";
import { getActividades, getResumen, TIPOS } from "@/lib/agenda-geo";
import type { Actividad } from "@/lib/agenda-geo";
import {
  rangoDeVista,
  filtrarActividades,
  filtrosEnUrl,
  esIso,
  esVista,
} from "@/lib/agenda-periodo";
import { AgendaToolbar } from "@/components/territorio/agenda-toolbar";
import { AgendaVista } from "@/components/territorio/agenda-vista";
import { ContadoresAgenda } from "@/components/territorio/contadores-agenda";
import type { UnidadOrganizacional } from "@/types/database";

export const revalidate = 0;
export const metadata = { title: "Agenda" };

interface Props {
  searchParams: Promise<{
    vista?: string;
    fecha?: string;
    sec?: string;
    sub?: string;
    dir?: string;
    tipo?: string;
    estado?: string;
    q?: string;
  }>;
}

/**
 * La agenda de la Agenda Georreferenciada — etapa 2 del plan del 22.09.
 *
 * Mes, semana y día con los filtros por área, tipo, fecha y estado. Todo vive
 * en la URL: la vista se comparte por enlace y la página se sigue renderizando
 * en el servidor. El período y los filtros salen de `agenda-periodo.ts`, que
 * comparte con el mapa para que "los mismos filtros" siga siendo cierto.
 *
 * A diferencia de la agenda de PlanIA, acá NO se recorta por el área del
 * usuario: la política `actividad_select_todos` de la migración 052 deja leer
 * todo a cualquiera que haya iniciado sesión, porque el sentido del producto es
 * que cada área cargue lo suyo y lo vea el municipio entero.
 */
export default async function AgendaTerritorioPage({ searchParams }: Props) {
  const params = await searchParams;

  // `hoyLocal()` y no `new Date().toISOString()`: a la noche de Tucumán el UTC
  // ya está en el día siguiente y "hoy" se corría un día.
  const hoy = hoyLocal();
  const vista = esVista(params.vista);
  const fecha = esIso(params.fecha) ? params.fecha : hoy;
  const periodo = rangoDeVista(vista, fecha);

  let unidades: UnidadOrganizacional[] = [];
  let delRango: Actividad[] = [];
  let resumen = { hoy: 0, proximas48: 0, porConfirmar: 0, modificadas: 0 };
  let error: string | null = null;
  try {
    [unidades, delRango, resumen] = await Promise.all([
      getUnidades(),
      getActividades({ desde: periodo.desde, hasta: periodo.hasta }),
      getResumen(hoy),
    ]);
  } catch (e) {
    // La migración 052 puede no estar aplicada todavía: el código se despliega
    // solo y las migraciones las aplica una persona.
    error = e instanceof Error ? e.message : String(e);
    unidades = await getUnidades().catch(() => []);
  }

  const actividades = filtrarActividades(delRango, unidades, params);

  // Leyenda: solo los tipos que de verdad aparecen en lo que se está mirando.
  const tiposPresentes = TIPOS.filter((t) => actividades.some((a) => a.tipo === t.clave));

  return (
    <div className="space-y-6 max-w-7xl">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Agenda</h1>
          <p className="text-sm text-muted mt-1">
            Las actividades de todas las áreas del municipio, por mes, semana o día.
          </p>
        </div>
        <div className="flex items-center gap-2 self-start">
          <Link
            href="/territorio/mapa"
            className="text-xs text-foreground border border-border hover:border-primary/40 rounded-lg px-3 py-1.5"
          >
            🗺 Ver en el mapa
          </Link>
          <Link
            href="/territorio/actividades"
            className="text-xs text-primary border border-primary/30 bg-primary/10 hover:bg-primary/20 rounded-lg px-3 py-1.5"
          >
            + Cargar actividad
          </Link>
        </div>
      </div>

      <ContadoresAgenda resumen={resumen} hoy={hoy} />

      {error ? (
        <div className="rounded-xl border border-danger/30 bg-danger/5 p-4">
          <p className="text-sm font-semibold text-danger">No se pudieron leer las actividades</p>
          <p className="text-xs text-muted mt-1 font-mono break-all">{error}</p>
          <p className="text-xs text-muted mt-2">
            Si dice que no existe la tabla, falta aplicar la migración 052.
          </p>
        </div>
      ) : (
        <>
          <Suspense>
            <AgendaToolbar
              vista={vista}
              fecha={fecha}
              titulo={periodo.titulo}
              unidades={unidades}
              sec={params.sec ?? null}
              sub={params.sub ?? null}
              dir={params.dir ?? null}
              tipo={params.tipo ?? null}
              estado={params.estado ?? null}
              q={params.q ?? ""}
              anterior={periodo.anterior}
              siguiente={periodo.siguiente}
              hoy={hoy}
            />
          </Suspense>

          <AgendaVista
            vista={vista}
            dias={periodo.dias}
            actividades={actividades}
            mesReferencia={periodo.mesReferencia}
            hoy={hoy}
            paramsActuales={filtrosEnUrl(params)}
          />

          {tiposPresentes.length > 0 && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              {tiposPresentes.map((t) => (
                <span
                  key={t.clave}
                  className="inline-flex items-center gap-1.5 text-[11px] text-muted"
                >
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: t.hex }} />
                  {t.rotulo}
                </span>
              ))}
            </div>
          )}

          {/* Que el período esté vacío es distinto de que los filtros lo hayan
              dejado sin nada. Decirlo mal manda a buscar el problema donde no
              está. */}
          {actividades.length === 0 && (
            <p className="text-sm text-muted text-center py-4">
              {delRango.length > 0
                ? "Ninguna actividad de este período coincide con los filtros."
                : "No hay actividades cargadas en este período."}{" "}
              <Link href="/territorio/actividades" className="text-primary hover:underline">
                Cargar una
              </Link>
              .
            </p>
          )}
        </>
      )}
    </div>
  );
}

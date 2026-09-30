import Link from "next/link";
import { Suspense } from "react";
import { getUnidades } from "@/lib/queries";
import { hoyLocal } from "@/lib/utils";
import { getActividades, getResumen, TIPOS } from "@/lib/agenda-geo";
import type { Actividad } from "@/lib/agenda-geo";
import {
  rangoDeVista,
  filtrarActividades,
  esIso,
  esVista,
} from "@/lib/agenda-periodo";
import { AgendaToolbar } from "@/components/territorio/agenda-toolbar";
import { ContadoresAgenda } from "@/components/territorio/contadores-agenda";
import { MapaCliente } from "@/components/territorio/mapa-cliente";
import type { UnidadOrganizacional } from "@/types/database";

export const revalidate = 0;

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
 * El Mapa Territorial — etapa 3 del plan del 22.09.
 *
 * Los pines por tipo de actividad, con los mismos filtros que la agenda. Son
 * literalmente los mismos: la barra y el cálculo del período son el mismo
 * código, y lo único que cambia es que acá los cambios de filtro vuelven al
 * mapa en vez de a la agenda.
 *
 * El período importa tanto como en la agenda: un mapa con todas las actividades
 * de la historia es una mancha de puntos. Se mira un mes, una semana o un día,
 * igual que allá.
 */
export default async function MapaTerritorioPage({ searchParams }: Props) {
  const params = await searchParams;

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
    error = e instanceof Error ? e.message : String(e);
    unidades = await getUnidades().catch(() => []);
  }

  const actividades = filtrarActividades(delRango, unidades, params);

  // La diferencia que manda en esta pantalla: una actividad sin coordenadas no
  // se puede dibujar. No es un error —la carga rápida no pide la ubicación— y
  // esconderla en silencio sería peor que contarla, porque quien mira el mapa
  // creería que ya está todo.
  const conPin = actividades.filter((a) => a.lat != null && a.lng != null);
  const sinPin = actividades.length - conPin.length;

  const tiposPresentes = TIPOS.filter((t) => conPin.some((a) => a.tipo === t.clave));

  return (
    <div className="space-y-6 max-w-7xl">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Mapa Territorial</h1>
          <p className="text-sm text-muted mt-1">
            Dónde pasan las actividades del municipio, con el color de su tipo.
          </p>
        </div>
        <div className="flex items-center gap-2 self-start">
          <Link
            href="/territorio/agenda"
            className="text-xs text-foreground border border-border hover:border-primary/40 rounded-lg px-3 py-1.5"
          >
            📅 Ver en la agenda
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
              ruta="/territorio/mapa"
            />
          </Suspense>

          <MapaCliente actividades={conPin} />

          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
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
            <p className="text-[11px] text-muted">
              {conPin.length} {conPin.length === 1 ? "actividad ubicada" : "actividades ubicadas"}
              {sinPin > 0 && (
                <>
                  {" · "}
                  <Link
                    href={{
                      pathname: "/territorio/agenda",
                      query: { ...params, vista, fecha },
                    }}
                    className="text-warning hover:underline"
                  >
                    {sinPin} sin ubicación en el mapa
                  </Link>
                </>
              )}
            </p>
          </div>

          {conPin.length === 0 && (
            <p className="text-sm text-muted text-center py-2">
              {actividades.length > 0
                ? "Las actividades de este período todavía no tienen su punto en el mapa. Se les agrega al editarlas, escribiendo la dirección."
                : delRango.length > 0
                ? "Ninguna actividad de este período coincide con los filtros."
                : "No hay actividades cargadas en este período."}
            </p>
          )}
        </>
      )}
    </div>
  );
}

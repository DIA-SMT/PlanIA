import Link from "next/link";
import { getPerfilActual } from "@/lib/auth";
import { hoyLocal } from "@/lib/utils";
import { getResumen, contarActividades } from "@/lib/agenda-geo";
import { EmptyState } from "@/components/ui/empty-state";
import { ContadoresAgenda } from "@/components/territorio/contadores-agenda";

export const revalidate = 0;

/**
 * Inicio de la Agenda Georreferenciada — 22.09, con los contadores conectados
 * el 30.09 al cerrar la etapa 2.
 *
 * Hasta la etapa 2 los cuatro números estaban dibujados en cero, con el aviso
 * de que no había datos: se veía la forma de la pantalla sin mentir una cifra.
 * Ahora salen de `getResumen`, que es la misma consulta que usa la agenda.
 */
export default async function TerritorioInicio() {
  const hoy = hoyLocal();

  let resumen = { hoy: 0, proximas48: 0, porConfirmar: 0, modificadas: 0 };
  let total = 0;
  let error: string | null = null;
  try {
    [resumen, total] = await Promise.all([getResumen(hoy), contarActividades()]);
  } catch (e) {
    // La migración 052 puede no estar aplicada todavía: el código se despliega
    // solo y las migraciones las aplica una persona.
    error = e instanceof Error ? e.message : String(e);
  }
  const perfil = await getPerfilActual();

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Agenda Georreferenciada</h1>
          <p className="text-sm text-muted mt-1">
            Las actividades de todas las áreas del municipio, en el calendario y en el mapa.
          </p>
        </div>
        <Link href="/" className="text-xs text-muted hover:text-foreground underline">
          Cambiar de sistema
        </Link>
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
      ) : total === 0 ? (
        <div>
          <EmptyState
            title="Todavía no hay actividades cargadas"
            description="Ya se puede cargar una actividad con su fecha, su área y su ubicación, y verla en la agenda por mes, semana o día. El mapa viene después."
            icon="🗺"
          />
          <div className="flex justify-center -mt-8">
            <Link
              href="/territorio/actividades"
              className="text-xs text-primary border border-primary/30 bg-primary/10 hover:bg-primary/20 rounded-lg px-3 py-1.5"
            >
              Cargar la primera actividad
            </Link>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Link
            href="/territorio/agenda"
            className="text-xs text-primary border border-primary/30 bg-primary/10 hover:bg-primary/20 rounded-lg px-3 py-1.5"
          >
            Ver la agenda
          </Link>
          <Link
            href="/territorio/actividades"
            className="text-xs text-foreground border border-border hover:border-primary/40 rounded-lg px-3 py-1.5"
          >
            Cargar una actividad
          </Link>
          <span className="text-xs text-muted self-center ml-1">
            {total} {total === 1 ? "actividad cargada" : "actividades cargadas"} en total
          </span>
        </div>
      )}

      {perfil?.rol === "admin_funcional" && (
        <div className="rounded-xl border border-border bg-surface p-4">
          <p className="text-sm font-semibold text-foreground">Qué viene</p>
          <ol className="text-xs text-muted mt-2 space-y-1 list-decimal pl-5 leading-relaxed">
            <li>
              El módulo de actualidad. Está frenado hasta que digan de dónde salen las
              noticias: leídas solas de los medios, o cargadas a mano.
            </li>
          </ol>
          <p className="text-[11px] text-muted/70 mt-2">
            Hechas al 30.09: la carga de actividades, la agenda por mes, semana y día, el
            mapa territorial, la ficha con briefing y documentos, y “requiere atención” con
            el historial de cambios.
          </p>
        </div>
      )}
    </div>
  );
}

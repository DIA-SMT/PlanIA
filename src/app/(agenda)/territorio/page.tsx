import Link from "next/link";
import { getPerfilActual } from "@/lib/auth";
import { EmptyState } from "@/components/ui/empty-state";

export const revalidate = 0;

/**
 * Inicio de la Agenda Georreferenciada — 22.09.
 *
 * Por ahora es el esqueleto: la etapa 0 del plan es el selector de sistema y el
 * marco, y la carga de actividades viene en la etapa 1. Los cuatro contadores de
 * la maqueta están dibujados en cero para que se vea la forma de la pantalla,
 * con el aviso de que todavía no hay datos — mentir un número acá sería peor.
 */
export default async function TerritorioInicio() {
  const perfil = await getPerfilActual();

  const contadores = [
    { rotulo: "Actividades de hoy", valor: 0 },
    { rotulo: "Próximas 48 hs", valor: 0 },
    { rotulo: "Pendientes de confirmación", valor: 0 },
    { rotulo: "Modificadas recientemente", valor: 0 },
  ];

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

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {contadores.map((c) => (
          <div key={c.rotulo} className="rounded-xl border border-border bg-surface p-4">
            <p className="text-xs text-muted">{c.rotulo}</p>
            <p className="text-3xl font-bold text-foreground/40 mt-1 tabular-nums">{c.valor}</p>
          </div>
        ))}
      </div>

      <EmptyState
        title="Todavía no hay actividades cargadas"
        description="El sistema está en construcción: por ahora está el acceso y el marco. Lo próximo es poder cargar una actividad con su fecha, su área y su ubicación."
        icon="🗺"
      />

      {perfil?.rol === "admin_funcional" && (
        <div className="rounded-xl border border-border bg-surface p-4">
          <p className="text-sm font-semibold text-foreground">Qué viene</p>
          <ol className="text-xs text-muted mt-2 space-y-1 list-decimal pl-5 leading-relaxed">
            <li>Cargar actividades, con carga rápida para lo que surge de un día para el otro.</li>
            <li>La agenda en vistas de día, semana y mes, con filtros por área, tipo y estado.</li>
            <li>El mapa con los pines por tipo de actividad.</li>
            <li>La ficha de cada actividad, con documentos y briefing.</li>
            <li>Las alertas de confirmación y el historial de cambios.</li>
            <li>El módulo de actualidad.</li>
          </ol>
        </div>
      )}
    </div>
  );
}

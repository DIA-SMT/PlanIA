import Link from "next/link";
import type { Proyecto, Meta, EstadoSemaforo } from "@/types/database";
import { StatusBadge } from "@/components/ui/status-badge";
import { ProgressBar } from "@/components/ui/progress-bar";
import { formatFecha, formatFechaRelativa } from "@/lib/utils";

interface ProyectoCardProps {
  proyecto: Proyecto;
  metas: Meta[];
  /**
   * Avance ya calculado por quien renderiza, con la cascada del sistema
   * (`avanceMetaEnPlazo` → `avanceAgregado`).
   *
   * Es OBLIGATORIO desde el 09.09. Antes era opcional y, si no venía, la
   * tarjeta calculaba por su cuenta con `calcularEstadoProyecto`, que tenía
   * umbrales propios (verde desde el 70 %) y además pintaba rojo el proyecto
   * entero si UNA meta estaba roja. En la práctica no se disparaba nunca
   * —el Panel siempre pasa el avance—, pero era una regla de semáforo más
   * esperando a que alguien montara la tarjeta sin el dato. Las reglas de
   * cálculo viven en un solo lugar y los componentes solo muestran.
   */
  avance: { porcentaje: number | null; estado: EstadoSemaforo; tieneSeguimiento: boolean };
}

export function ProyectoCard({ proyecto, metas, avance }: ProyectoCardProps) {
  const { porcentaje, estado, tieneSeguimiento } = avance;

  const ultimaAct = metas
    .map((m) => m.ultima_actualizacion)
    .filter(Boolean)
    .sort()
    .reverse()[0] ?? null;

  return (
    <Link
      href={`/proyectos/${proyecto.id}`}
      className="block rounded-xl border border-border bg-surface p-4 hover:bg-surface-hover hover:border-primary/30 transition-all group"
    >
      <div className="flex items-start justify-between mb-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            {proyecto.codigo && (
              <span className="text-[10px] font-mono text-muted bg-border/50 px-1.5 py-0.5 rounded">
                {proyecto.codigo}
              </span>
            )}
            <StatusBadge estado={estado} />
          </div>
          <h3 className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors line-clamp-2">
            {proyecto.nombre}
          </h3>
          {proyecto.unidad && (
            <p className="text-xs text-muted mt-0.5 truncate">
              {proyecto.unidad.nombre_corto ?? proyecto.unidad.nombre}
            </p>
          )}
        </div>
      </div>

      {tieneSeguimiento ? (
        <ProgressBar value={porcentaje ?? 0} estado={estado} size="sm" />
      ) : (
        <div className="h-2 rounded-full bg-border/30" />
      )}

      <div className="flex items-center justify-between mt-2 text-xs text-muted">
        <span>{metas.length} metas</span>
        {tieneSeguimiento ? (
          // Fecha exacta, igual que en la tarjeta de la meta (09.09, párrafo
          // 740). El relativo queda en el globito.
          <span title={formatFechaRelativa(ultimaAct)}>{formatFecha(ultimaAct)}</span>
        ) : (
          <span className="text-primary/60">Sin seguimiento</span>
        )}
      </div>
    </Link>
  );
}

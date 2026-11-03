import type { DistribucionEstados } from "@/lib/utils";
import { totalDistribucion } from "@/lib/utils";

/**
 * "Estado de los proyectos" (correcciones 06.08): las cuatro categorías del
 * semáforo con su cantidad, su peso sobre el total del ámbito y una barra.
 *
 * Los colores salen de los tokens del semáforo (`info` = No iniciado, que vale
 * rojo desde el 30.07): si vuelven a cambiar el color, se cambia en globals.css
 * y estas tarjetas acompañan.
 */
const CATEGORIAS = [
  {
    key: "verde",
    icono: "✓",
    label: "Finalizados",
    detalle: "Proyectos completados al 100%",
    texto: "text-success",
    borde: "border-success/30",
    fondo: "bg-success/10",
    barra: "bg-success",
  },
  {
    key: "amarillo",
    icono: "◐",
    label: "En ejecución",
    detalle: "Proyectos en desarrollo con avance parcial",
    texto: "text-warning",
    borde: "border-warning/30",
    fondo: "bg-warning/10",
    barra: "bg-warning",
  },
  {
    key: "rojo",
    icono: "▶",
    label: "No iniciados",
    detalle: "Proyectos pendientes de inicio",
    texto: "text-info",
    borde: "border-info/30",
    fondo: "bg-info/10",
    barra: "bg-info",
  },
  {
    key: "sin_datos",
    icono: "◇",
    label: "Sin datos",
    detalle: "Proyectos pendientes de actualización",
    texto: "text-muted",
    borde: "border-border",
    fondo: "bg-muted/10",
    barra: "bg-muted/50",
  },
] as const;

export function EstadoProyectos({
  distribucion,
  prioritarios,
}: {
  distribucion: DistribucionEstados;
  /**
   * 30.10: "en estado de los proyectos yo agregaría en cada cuadrado cuántos
   * prioritarios incluyen". Sin esto, la tarjeta no dice nada de prioritarios.
   */
  prioritarios?: DistribucionEstados;
}) {
  const total = totalDistribucion(distribucion);
  const pct = (n: number) => (total > 0 ? Math.round((n / total) * 100) : 0);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {CATEGORIAS.map((c) => {
        const cantidad = distribucion[c.key];
        const porcentaje = pct(cantidad);
        return (
          <div
            key={c.key}
            className={`rounded-2xl border bg-surface p-5 flex flex-col gap-3 ${c.borde}`}
          >
            <div className="flex items-center gap-2.5">
              <span
                className={`h-8 w-8 rounded-lg flex items-center justify-center text-sm shrink-0 ${c.fondo} ${c.texto}`}
              >
                {c.icono}
              </span>
              <span className={`text-xs font-semibold uppercase tracking-wider ${c.texto}`}>
                {c.label}
              </span>
            </div>

            <div>
              <p className="text-3xl font-bold text-foreground tabular-nums leading-none">
                {cantidad}
              </p>
              <p className={`text-sm font-semibold mt-1 ${c.texto}`}>{porcentaje}%</p>
              {prioritarios && (
                <p className="text-[11px] text-primary mt-1">
                  ★ {prioritarios[c.key] === 1 ? "incluye 1 prioritario" : `incluye ${prioritarios[c.key]} prioritarios`}
                </p>
              )}
            </div>

            <div className="h-1.5 rounded-full bg-border/50 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${c.barra}`}
                style={{ width: `${porcentaje}%` }}
              />
            </div>

            <p className="text-[11px] text-muted leading-snug">{c.detalle}</p>
          </div>
        );
      })}
    </div>
  );
}

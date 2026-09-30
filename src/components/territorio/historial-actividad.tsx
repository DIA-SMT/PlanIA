import type { CambioActividad } from "@/lib/agenda-geo";
import { CAMPOS_HISTORIAL, tipoDe, estadoDe } from "@/lib/agenda-geo-comun";

/**
 * El historial de cambios de una actividad — etapa 5 del plan del 22.09.
 *
 * Es lo que el pedido llama "registro de modificaciones e historial de
 * cambios". Los datos ya venían: el trigger de la migración 052 anota una fila
 * por campo modificado desde el 22.09, así que esto muestra algo que se estuvo
 * juntando solo. Acá no se escribe nada.
 *
 * Va aparte de la pantalla que lo usa porque su lugar natural es la ficha de la
 * actividad, que llega con la etapa 4. Hasta entonces vive en "requiere
 * atención", donde sirve para lo mismo: ver qué cambió.
 */
export function HistorialActividad({
  cambios,
  limite = 6,
}: {
  cambios: CambioActividad[];
  limite?: number;
}) {
  if (cambios.length === 0) {
    return <p className="text-[11px] text-muted/70">Sin cambios registrados.</p>;
  }

  const visibles = cambios.slice(0, limite);
  const resto = cambios.length - visibles.length;

  return (
    <div className="space-y-1">
      {visibles.map((c) => (
        <p key={c.id} className="text-[11px] text-muted leading-relaxed">
          <span className="text-foreground/80">{CAMPOS_HISTORIAL[c.campo] ?? c.campo}</span>
          {": "}
          <span className="line-through opacity-60">{legible(c.campo, c.valor_anterior)}</span>
          {" → "}
          <span className="text-foreground/90">{legible(c.campo, c.valor_nuevo)}</span>
          <span className="opacity-60">
            {" · "}
            {hora(c.created_at)}
            {c.cambiado_por_email ? ` · ${c.cambiado_por_email}` : ""}
          </span>
        </p>
      ))}
      {resto > 0 && (
        <p className="text-[11px] text-muted/60">y {resto} cambio{resto === 1 ? "" : "s"} más</p>
      )}
    </div>
  );
}

/**
 * El valor de un campo como se lee, no como se guarda.
 *
 * El trigger anota lo que hay en la columna, así que un cambio de tipo queda
 * como "obras_publicas" y uno de estado como "en_curso". Mostrar eso sería
 * pedirle a un director que lea nombres de variables.
 *
 * `unidad_id` queda en crudo: es un UUID y traducirlo pediría traer el
 * organigrama entero hasta acá. Se muestra el rótulo del campo —"Área
 * responsable"— que ya dice lo que pasó, sin el detalle de a cuál.
 */
function legible(campo: string, valor: string | null): string {
  if (valor == null || valor === "") return "—";
  if (campo === "tipo") return tipoDe(valor).rotulo;
  if (campo === "estado") return estadoDe(valor).rotulo;
  if (campo === "requiere_confirmacion") return valor === "true" ? "sí" : "no";
  if (campo === "hora_desde" || campo === "hora_hasta") return valor.slice(0, 5);
  if (campo === "unidad_id") return "otra área";
  if (campo === "lat" || campo === "lng") return Number(valor).toFixed(5);
  return valor;
}

function hora(iso: string): string {
  return new Date(iso).toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

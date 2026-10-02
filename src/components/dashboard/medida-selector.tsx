"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { MEDIDAS_PANEL } from "@/lib/utils";

/**
 * Qué mide el velocímetro del Panel (01.10).
 *
 * Usa su propio parámetro, `medida`, y NO el `estado` que ya existe. El 06.08
 * se pidió justamente lo contrario de mezclarlos: "el filtro de estado de la
 * lista de proyectos ya no afecta a este número, ni a los KPI, ni a las
 * tarjetas de estado". Si el selector escribiera en `estado`, elegir qué mide
 * el medidor recortaría la lista de abajo y deshacría esa corrección sin que
 * nadie lo pida.
 *
 * Vive en la URL como el resto de los filtros del Panel, así la vista se
 * comparte por enlace y la página sigue renderizándose en el servidor.
 */
export function MedidaSelector({ medida }: { medida: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const elegir = (clave: string) => {
    const params = new URLSearchParams(searchParams.toString());
    // La de por defecto no ensucia la URL: sin parámetro, el Panel abre en ella.
    if (clave === MEDIDAS_PANEL[0].clave) params.delete("medida");
    else params.set("medida", clave);
    const q = params.toString();
    router.push(q ? `${pathname}?${q}` : pathname, { scroll: false });
  };

  return (
    <label className="flex items-center gap-2 text-xs text-muted">
      <span className="shrink-0">Medir:</span>
      <select
        value={medida}
        onChange={(e) => elegir(e.target.value)}
        aria-label="Qué mide el velocímetro"
        className="bg-background border border-border rounded-lg px-2 py-1.5 text-foreground text-xs max-w-[220px]"
      >
        {MEDIDAS_PANEL.map((m) => (
          <option key={m.clave} value={m.clave}>
            {m.rotulo}
          </option>
        ))}
      </select>
    </label>
  );
}

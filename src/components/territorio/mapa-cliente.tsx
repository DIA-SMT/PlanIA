"use client";

import dynamic from "next/dynamic";
import type { Actividad } from "@/lib/agenda-geo-comun";

/**
 * La puerta de entrada al mapa desde una pantalla de servidor.
 *
 * Leaflet lee `window` al importarse, así que el módulo no puede existir
 * durante el render del servidor: entra con `ssr: false`. Y como `dynamic` con
 * `ssr: false` no se puede llamar desde un componente de servidor, hace falta
 * este envoltorio de cliente en el medio. Es andamiaje de Next, no una decisión
 * de diseño.
 */
const Mapa = dynamic(() => import("./mapa-actividades"), {
  ssr: false,
  loading: () => (
    <div
      className="rounded-xl border border-border bg-surface flex items-center justify-center"
      style={{ height: 600 }}
    >
      <p className="text-sm text-muted">Cargando el mapa…</p>
    </div>
  ),
});

export function MapaCliente({
  actividades,
  alto,
}: {
  actividades: Actividad[];
  alto?: string;
}) {
  return <Mapa actividades={actividades} alto={alto} />;
}

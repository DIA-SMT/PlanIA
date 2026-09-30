"use client";

import { useEffect, useMemo } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Actividad } from "@/lib/agenda-geo-comun";
import { tipoDe, estadoDe, CENTRO_SMT, ZOOM_CIUDAD } from "@/lib/agenda-geo-comun";

/**
 * El mapa territorial — etapa 3 del plan del 22.09.
 *
 * Leaflet + OpenStreetMap, que fue la decisión del 22.09: gratis, sin cuenta ni
 * tarjeta, funcionando el día uno.
 *
 * Este archivo NO se importa directo desde una pantalla: Leaflet toca `window`
 * al cargarse y revienta en el render del servidor. Entra por `mapa-cliente.tsx`,
 * que lo trae con `dynamic(..., { ssr: false })`.
 *
 * Los pines son `divIcon` con el color del tipo y no los marcadores que trae
 * Leaflet. Dos razones: el pedido es justamente distinguir el tipo de un
 * vistazo, y los iconos por defecto resuelven su URL de una manera que los
 * bundlers rompen —es el bug clásico del marcador que no aparece—. Un div con
 * su color esquiva las dos cosas.
 */

interface Props {
  actividades: Actividad[];
  /** Alto del mapa; la pantalla del mapa lo quiere más alto que una ficha. */
  alto?: string;
}

function iconoDe(hex: string, atenuado: boolean) {
  return L.divIcon({
    className: "",
    html: `<span style="
      display:block;width:16px;height:16px;border-radius:9999px;
      background:${hex};border:2px solid rgba(255,255,255,.85);
      box-shadow:0 1px 4px rgba(0,0,0,.5);opacity:${atenuado ? 0.45 : 1};
    "></span>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
    popupAnchor: [0, -10],
  });
}

/**
 * Encuadra el mapa sobre los pines que hay.
 *
 * Va como componente hijo y no como prop de MapContainer porque `center` y
 * `zoom` solo se leen al montar: si cambian los filtros y el mapa ya existe,
 * hay que moverlo a mano.
 */
function Encuadrar({ puntos }: { puntos: [number, number][] }) {
  const mapa = useMap();
  useEffect(() => {
    if (puntos.length === 0) {
      mapa.setView(CENTRO_SMT, ZOOM_CIUDAD);
      return;
    }
    if (puntos.length === 1) {
      mapa.setView(puntos[0], 16);
      return;
    }
    mapa.fitBounds(L.latLngBounds(puntos), { padding: [40, 40], maxZoom: 16 });
    // `puntos` entra como dependencia directa porque llega memoizado desde
    // arriba: solo cambia de identidad cuando cambian las actividades, que es
    // exactamente cuando hay que reencuadrar.
  }, [mapa, puntos]);
  return null;
}

export default function MapaActividades({ actividades, alto = "600px" }: Props) {
  // Solo las que tienen pin. Una actividad sin coordenadas no es un error: se
  // carga con la dirección escrita y el punto se completa después.
  const conPin = useMemo(
    () => actividades.filter((a) => a.lat != null && a.lng != null),
    [actividades]
  );
  const puntos = useMemo(
    () => conPin.map((a) => [a.lat!, a.lng!] as [number, number]),
    [conPin]
  );

  return (
    <MapContainer
      center={CENTRO_SMT}
      zoom={ZOOM_CIUDAD}
      scrollWheelZoom
      style={{ height: alto, width: "100%" }}
      className="rounded-xl border border-border z-0"
    >
      {/* La atribución no es decorativa: la licencia de OpenStreetMap la exige. */}
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        maxZoom={19}
      />
      <Encuadrar puntos={puntos} />
      {conPin.map((a) => {
        const t = tipoDe(a.tipo);
        const e = estadoDe(a.estado);
        return (
          <Marker
            key={a.id}
            position={[a.lat!, a.lng!]}
            icon={iconoDe(t.hex, a.estado === "suspendida")}
          >
            {/* La ficha llega con la etapa 4. Hasta entonces el globo muestra
                lo que se sabe, que es mejor que un enlace a ninguna parte. */}
            <Popup>
              <p className="text-sm font-semibold">{a.titulo}</p>
              <p className="text-xs">
                {a.hora_desde ? `${a.hora_desde.slice(0, 5)} · ` : ""}
                {a.unidad_nombre ?? "—"}
              </p>
              {a.lugar_texto && <p className="text-xs">{a.lugar_texto}</p>}
              <p className="text-xs">
                <span style={{ color: t.hex }}>●</span> {t.rotulo} · {e.rotulo}
              </p>
            </Popup>
          </Marker>
        );
      })}
    </MapContainer>
  );
}

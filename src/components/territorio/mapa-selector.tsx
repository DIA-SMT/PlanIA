"use client";

import { useEffect } from "react";
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { CENTRO_SMT, ZOOM_CIUDAD } from "@/lib/agenda-geo-comun";

/**
 * El mapa chico para poner el pin de una actividad — etapa 3 del 22.09.
 *
 * "Se escribe la dirección, el sistema propone el punto y quien carga lo corrige
 * arrastrando el pin". Esta es la parte de corregir: el pin se arrastra, y un
 * clic en cualquier lado del mapa lo manda ahí. Lo segundo no estaba pedido,
 * pero arrastrar un pin que todavía no existe es imposible y sin eso una
 * dirección que el buscador no encuentra no se podría ubicar nunca.
 *
 * Como `mapa-actividades.tsx`, entra por un `dynamic(..., { ssr: false })`:
 * Leaflet toca `window` al importarse.
 */

interface Props {
  lat: number | null;
  lng: number | null;
  onCambio: (lat: number, lng: number) => void;
}

const PIN = L.divIcon({
  className: "",
  html: `<span style="
    display:block;width:18px;height:18px;border-radius:9999px;
    background:#2563EB;border:3px solid #fff;
    box-shadow:0 1px 6px rgba(0,0,0,.6);cursor:grab;
  "></span>`,
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});

/** Un clic en el mapa pone el pin ahí. */
function ClicPonePin({ onCambio }: { onCambio: (lat: number, lng: number) => void }) {
  useMapEvents({
    click: (e) => onCambio(e.latlng.lat, e.latlng.lng),
  });
  return null;
}

/**
 * Mueve el mapa cuando el punto cambia desde afuera.
 *
 * Es lo que hace que buscar una dirección lleve el mapa hasta ella: sin esto el
 * pin aparece donde corresponde pero el mapa se queda mirando otro lado.
 */
function SeguirAlPunto({ lat, lng }: { lat: number | null; lng: number | null }) {
  const mapa = useMap();
  useEffect(() => {
    if (lat != null && lng != null) mapa.setView([lat, lng], 17);
  }, [mapa, lat, lng]);
  return null;
}

export default function MapaSelector({ lat, lng, onCambio }: Props) {
  const hayPunto = lat != null && lng != null;
  return (
    <MapContainer
      center={hayPunto ? [lat, lng] : CENTRO_SMT}
      zoom={hayPunto ? 17 : ZOOM_CIUDAD}
      scrollWheelZoom
      style={{ height: 260, width: "100%" }}
      className="rounded border border-border z-0"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        maxZoom={19}
      />
      <ClicPonePin onCambio={onCambio} />
      <SeguirAlPunto lat={lat} lng={lng} />
      {hayPunto && (
        <Marker
          position={[lat, lng]}
          icon={PIN}
          draggable
          eventHandlers={{
            dragend: (e) => {
              const p = (e.target as L.Marker).getLatLng();
              onCambio(p.lat, p.lng);
            },
          }}
        />
      )}
    </MapContainer>
  );
}

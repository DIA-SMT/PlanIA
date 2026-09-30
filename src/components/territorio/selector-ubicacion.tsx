"use client";

import { useState, useTransition } from "react";
import dynamic from "next/dynamic";
import { geocodificar, type Candidato } from "@/lib/actions-geo";

/**
 * La ubicación de una actividad: la dirección escrita y el punto en el mapa.
 *
 * Etapa 3 del plan del 22.09, con la decisión de ese día: "las dos cosas: se
 * escribe la dirección, el sistema propone el punto y quien carga lo corrige
 * arrastrando el pin".
 *
 * El punto es OPCIONAL a propósito. La carga rápida existe para lo que surge de
 * un día para el otro, y exigir coordenadas ahí la volvería lenta —que es
 * exactamente lo que el pedido quería evitar—. Una actividad sin pin se carga
 * igual, no sale en el mapa, y el mapa dice cuántas le faltan.
 *
 * La búsqueda se dispara con el botón y no al tipear: la política de uso de
 * Nominatim desaconseja el autocompletado, y un servicio comunitario gratuito
 * no se castiga con diez consultas por dirección.
 */

const MapaSelector = dynamic(() => import("./mapa-selector"), {
  ssr: false,
  loading: () => (
    <div
      className="rounded border border-border bg-background flex items-center justify-center"
      style={{ height: 260 }}
    >
      <p className="text-xs text-muted">Cargando el mapa…</p>
    </div>
  ),
});

interface Props {
  lugar: string;
  lat: number | null;
  lng: number | null;
  onLugar: (v: string) => void;
  onPunto: (lat: number | null, lng: number | null) => void;
  deshabilitado?: boolean;
  claseCampo: string;
  claseRotulo: string;
}

export function SelectorUbicacion({
  lugar,
  lat,
  lng,
  onLugar,
  onPunto,
  deshabilitado = false,
  claseCampo,
  claseRotulo,
}: Props) {
  const [buscando, empezarBusqueda] = useTransition();
  const [candidatos, setCandidatos] = useState<Candidato[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [verMapa, setVerMapa] = useState(false);

  const buscar = () => {
    setError(null);
    setCandidatos([]);
    empezarBusqueda(async () => {
      const r = await geocodificar(lugar);
      if (!r.success || !r.candidatos) {
        setError(r.error ?? "No se pudo buscar");
        // Aunque falle se abre el mapa: el camino de salida es poner el pin a
        // mano, y esconderlo dejaría a la persona sin nada que hacer.
        setVerMapa(true);
        return;
      }
      const [primero, ...resto] = r.candidatos;
      onPunto(primero.lat, primero.lng);
      // Los demás solo si hay: ofrecer una lista de uno es ruido.
      setCandidatos(resto.length > 0 ? r.candidatos : []);
      setVerMapa(true);
    });
  };

  return (
    <div className="sm:col-span-2">
      <label className={claseRotulo}>Dónde</label>
      <div className="flex gap-2">
        <input
          value={lugar}
          onChange={(e) => onLugar(e.target.value)}
          onKeyDown={(e) => {
            // Enter busca en vez de mandar el formulario entero, que es lo que
            // uno espera de un campo con un botón de buscar al lado.
            if (e.key === "Enter") {
              e.preventDefault();
              buscar();
            }
          }}
          disabled={deshabilitado}
          placeholder="Bº Ciudadela — Florida 1514"
          className={claseCampo}
        />
        <button
          type="button"
          onClick={buscar}
          disabled={deshabilitado || buscando || lugar.trim().length < 4}
          className="shrink-0 text-xs text-primary border border-primary/30 bg-primary/10 hover:bg-primary/20 disabled:opacity-40 rounded px-3"
        >
          {buscando ? "Buscando…" : "Ubicar"}
        </button>
      </div>

      {error && <p className="text-[11px] text-warning mt-1">{error}</p>}

      {candidatos.length > 0 && (
        <div className="mt-2 rounded border border-border divide-y divide-border">
          <p className="text-[10px] text-muted px-2 py-1 bg-border/20">
            Varias coincidencias — elegí la correcta:
          </p>
          {candidatos.map((c, i) => {
            const elegido = c.lat === lat && c.lng === lng;
            return (
              <button
                key={`${c.lat},${c.lng},${i}`}
                type="button"
                onClick={() => onPunto(c.lat, c.lng)}
                className={`block w-full text-left text-[11px] px-2 py-1.5 hover:bg-surface-hover ${
                  elegido ? "text-primary" : "text-muted"
                }`}
              >
                {elegido ? "● " : "○ "}
                {c.etiqueta}
                {!c.cerca && <span className="text-warning"> · fuera de Tucumán</span>}
              </button>
            );
          })}
        </div>
      )}

      {lat != null && lng != null ? (
        <div className="mt-2 space-y-1">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <p className="text-[11px] text-muted">
              Punto: <span className="tabular-nums">{lat.toFixed(5)}, {lng.toFixed(5)}</span> ·
              arrastrá el pin o hacé clic en el mapa para corregirlo.
            </p>
            <button
              type="button"
              onClick={() => {
                onPunto(null, null);
                setCandidatos([]);
              }}
              className="text-[11px] text-muted hover:text-danger underline"
            >
              Quitar el punto
            </button>
          </div>
          <MapaSelector lat={lat} lng={lng} onCambio={(la, ln) => onPunto(la, ln)} />
        </div>
      ) : verMapa ? (
        <div className="mt-2 space-y-1">
          <p className="text-[11px] text-muted">
            Hacé clic en el mapa donde va la actividad.
          </p>
          <MapaSelector lat={null} lng={null} onCambio={(la, ln) => onPunto(la, ln)} />
        </div>
      ) : (
        <p className="text-[10px] text-muted/70 mt-1">
          Escribí la dirección y tocá <strong>Ubicar</strong> para ponerle el punto en el
          mapa. Es opcional: sin punto la actividad se carga igual, pero no aparece en el
          Mapa Territorial.{" "}
          <button
            type="button"
            onClick={() => setVerMapa(true)}
            className="text-primary hover:underline"
          >
            Poner el pin a mano
          </button>
        </p>
      )}
    </div>
  );
}

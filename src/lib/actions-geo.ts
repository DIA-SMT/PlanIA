"use server";

import { RECUADRO_TUCUMAN, enTucuman } from "@/lib/agenda-geo-comun";

/**
 * Buscar un punto a partir de una dirección escrita — etapa 3 del 22.09.
 *
 * Decisión del 22.09: "las dos cosas: se escribe la dirección, el sistema
 * propone el punto y quien carga lo corrige arrastrando el pin". Esto es la
 * primera mitad; la corrección a mano vive en `selector-ubicacion.tsx`.
 *
 * Usa Nominatim, el buscador de OpenStreetMap, que es el que corresponde a la
 * decisión de usar OSM: gratis y sin cuenta. Su política de uso pide tres cosas
 * que este archivo cumple:
 *
 * 1. Identificarse con un User-Agent propio. Por eso la llamada va del lado del
 *    servidor y no del navegador: desde acá se controla la cabecera.
 * 2. No más de una consulta por segundo. Por eso se dispara con un botón y no
 *    con cada tecla: un autocompletado haría diez consultas por dirección y es
 *    justamente lo que la política desaconseja.
 * 3. No usarlo para cargas masivas. Acá es una consulta por actividad cargada.
 *
 * Cada búsqueda sale del servidor del municipio hacia openstreetmap.org con el
 * texto de la dirección. No se manda nada más: ni quién busca, ni de qué
 * actividad se trata.
 */

export interface Candidato {
  etiqueta: string;
  lat: number;
  lng: number;
  /** Si cae dentro del recuadro de Tucumán; los de afuera se muestran al final. */
  cerca: boolean;
}

interface Respuesta {
  success: boolean;
  candidatos?: Candidato[];
  error?: string;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export async function geocodificar(direccion: string): Promise<Respuesta> {
  const texto = direccion.trim();
  if (texto.length < 4) {
    return { success: false, error: "Escribí una dirección un poco más larga." };
  }

  const r = RECUADRO_TUCUMAN;
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", texto);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "6");
  url.searchParams.set("countrycodes", "ar");
  url.searchParams.set("addressdetails", "0");
  // El recuadro sesga sin obligar. Con `bounded=1` una dirección apenas afuera
  // —Yerba Buena, Banda del Río Salí— no devolvería nada, y esas también son
  // actividades del área metropolitana. Se prioriza después, al ordenar.
  url.searchParams.set("viewbox", `${r.oeste},${r.norte},${r.este},${r.sur}`);

  try {
    const resp = await fetch(url, {
      headers: {
        "User-Agent": "PlanIA-AgendaGeorreferenciada/1.0 (+https://github.com/DIA-SMT/PlanIA)",
        "Accept-Language": "es",
      },
      // La respuesta de una dirección no cambia de un día para el otro, y el
      // caché ahorra consultas repetidas contra un servicio comunitario.
      next: { revalidate: 86400 },
    });

    if (!resp.ok) {
      return {
        success: false,
        error: `El buscador de direcciones respondió ${resp.status}. Probá de nuevo en un rato o poné el pin a mano.`,
      };
    }

    const datos = (await resp.json()) as any[];
    const candidatos: Candidato[] = datos
      .map((d) => {
        const lat = Number(d.lat);
        const lng = Number(d.lon);
        return {
          etiqueta: String(d.display_name ?? "").replace(/, Argentina$/, ""),
          lat,
          lng,
          cerca: enTucuman(lat, lng),
        };
      })
      .filter((c) => Number.isFinite(c.lat) && Number.isFinite(c.lng))
      // Los de Tucumán primero: buscando "Florida 1514" sin aclarar la ciudad,
      // OSM conoce muchas calles Florida y la de acá no es la primera.
      .sort((a, b) => Number(b.cerca) - Number(a.cerca));

    if (candidatos.length === 0) {
      return {
        success: false,
        error: "No se encontró esa dirección. Podés poner el pin a mano en el mapa.",
      };
    }
    return { success: true, candidatos };
  } catch {
    return {
      success: false,
      error: "No se pudo consultar el buscador de direcciones. Poné el pin a mano en el mapa.",
    };
  }
}

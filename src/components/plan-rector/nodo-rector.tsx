"use client";

import { useState } from "react";
import Link from "next/link";
import {
  colorAmbito,
  type NodoRectorArbol,
  type ProyectoImputado,
} from "@/lib/plan-rector-comun";

/**
 * Un nodo del árbol del Plan Rector, desplegable.
 *
 * Las áreas de intervención arrancan abiertas (son 5, y cerradas la pantalla
 * parece vacía); los ejes arrancan cerrados, porque abrir los 17 con sus 63
 * líneas de una es una pared de texto.
 */
export function NodoRector({
  nodo,
  profundidad = 0,
  colorHeredado = null,
}: {
  nodo: NodoRectorArbol;
  profundidad?: number;
  /**
   * El color del ámbito del que cuelga este nodo.
   *
   * 11.09, pedido de Planificación: "si se podría el listado de ejes ponerlos en
   * color como está en el plan rector impreso, ayuda más a asociar". En el
   * documento impreso el color no es del ámbito solo: baja a sus ejes, que es lo
   * que deja ubicar de un vistazo a qué ámbito pertenece cada eje sin tener que
   * subir con la vista hasta el encabezado.
   */
  colorHeredado?: string | null;
}) {
  const [abierto, setAbierto] = useState(nodo.tipo === "area_intervencion");
  const tieneHijos = nodo.hijos.length > 0;

  // La línea es la hoja: no despliega, muestra el texto completo.
  if (nodo.tipo === "linea") {
    return (
      <li className="border-t border-border/60">
        <div className="flex items-start gap-3 py-2.5 pl-3 pr-3">
          <span className="text-muted/40 text-xs mt-1 shrink-0">—</span>
          <p className="text-sm text-foreground/90 flex-1 min-w-0">{nodo.nombre}</p>
          <ContadorImputados n={nodo.imputados} />
        </div>
        <ProyectosDelNodo proyectos={nodo.proyectos} />
      </li>
    );
  }

  const esArea = nodo.tipo === "area_intervencion";
  const esEje = nodo.tipo === "eje";
  // El ámbito define el color; todo lo que cuelga de él lo hereda.
  const color = esArea ? colorAmbito(nodo.codigo_cliente) : colorHeredado;

  return (
    <li className={esArea ? "" : "border-t border-border/60"}>
      <button
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        className={`w-full flex items-center gap-3 text-left transition-colors
          ${esArea ? "px-4 py-3 rounded-t-xl bg-surface-hover/50 hover:bg-surface-hover" : "px-3 py-2.5 hover:bg-surface-hover/60"}`}
      >
        <span className="text-muted text-[10px] w-2.5 shrink-0">{abierto ? "▾" : "▸"}</span>

        {/* 09.09, párrafo 687: el color que Planificación le puso a cada ámbito
            en su planilla. Va como estilo inline y no como clase de Tailwind
            porque son cinco valores del cliente, no de la paleta del sistema. */}
        {esArea && nodo.codigo_cliente && (
          <span
            className="text-[11px] font-bold rounded px-1.5 py-0.5 shrink-0 text-white"
            style={{ backgroundColor: color ?? undefined }}
          >
            {nodo.codigo_cliente}
          </span>
        )}
        {/* El eje lleva el color de su ámbito, como en el plan impreso. */}
        {esEje && nodo.codigo_cliente && (
          <span
            className="text-[11px] font-bold shrink-0 w-5 text-right tabular-nums"
            style={{ color: color ?? undefined }}
          >
            {nodo.codigo_cliente}.
          </span>
        )}

        <span
          className={`flex-1 min-w-0 ${
            esArea ? "text-sm font-bold text-foreground" : "text-sm text-foreground"
          }`}
        >
          {/* 09.09, párrafo 691: "un solo texto para el objetivo, aunque sea
              extenso". Antes la fila mostraba el nombre del objetivo recortado y
              al abrirse lo repetía entero. Ahora la fila dice el rótulo que
              pidieron y el texto va una sola vez, completo, abajo. */}
          {esArea || esEje ? (
            nodo.nombre_corto ?? nodo.nombre
          ) : (
            <span className="text-[10px] font-semibold text-muted uppercase tracking-wider">
              Objetivo Estratégico{nodo.codigo_cliente ? " " + nodo.codigo_cliente : ""}
            </span>
          )}
        </span>

        {tieneHijos && (
          <span className="text-[10px] text-muted/70 shrink-0 hidden sm:inline">
            {resumenHijos(nodo)}
          </span>
        )}
        <ContadorImputados n={nodo.imputadosSubarbol} />
        {/* 09.09, párrafo 703: la medición va EN EL ÁMBITO. Las líneas quedan
            escritas y no se miden, así que el porcentaje sale solo acá aunque
            esté calculado para todo el árbol. */}
        {esArea && <PorcentajeAmbito pct={nodo.pct} color={color} />}
      </button>

      {abierto && (
        <>
          {esEje && nodo.ods.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 px-3 pb-2 pl-9">
              {nodo.ods.map((o) => (
                <IconoODS key={o.numero} numero={o.numero} nombre={o.nombre} />
              ))}
            </div>
          )}

          {nodo.tipo === "objetivo" && (
            <p className="text-sm text-foreground/90 px-3 pb-2 pl-9 leading-relaxed">
              {nodo.nombre}
            </p>
          )}

          {/* 09.09, párrafo 694: "los proyectos vinculados a cada ámbito deben
              visualizarse abajo del objetivo estratégico y las líneas
              estratégicas". */}
          <ProyectosDelNodo proyectos={nodo.proyectos} />

          {tieneHijos && (
            <>
              {nodo.tipo === "objetivo" && (
                <p className="text-[10px] font-semibold text-muted uppercase tracking-wider px-3 pt-1 pb-1 pl-9">
                  Líneas Estratégicas
                </p>
              )}
              <ul className={profundidad >= 1 ? "pl-4" : "pl-3"}>
                {nodo.hijos.map((h) => (
                  <NodoRector
                    key={h.id}
                    nodo={h}
                    profundidad={profundidad + 1}
                    colorHeredado={color}
                  />
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </li>
  );
}

function ContadorImputados({ n }: { n: number }) {
  if (n === 0) {
    return (
      <span className="text-[10px] text-muted/50 shrink-0 w-16 text-right" title="Sin proyectos imputados">
        sin imputar
      </span>
    );
  }
  return (
    <span
      className="text-[11px] font-semibold text-foreground shrink-0 w-16 text-right tabular-nums"
      title={`${n} proyecto${n === 1 ? "" : "s"} del POA imputado${n === 1 ? "" : "s"}`}
    >
      {n} proy.
    </span>
  );
}

function resumenHijos(nodo: NodoRectorArbol): string {
  const n = nodo.hijos.length;
  if (nodo.tipo === "area_intervencion") return `${n} eje${n === 1 ? "" : "s"}`;
  if (nodo.tipo === "eje") {
    const lineas = nodo.hijos.reduce((a, o) => a + o.hijos.length, 0);
    return `${n} obj. · ${lineas} línea${lineas === 1 ? "" : "s"}`;
  }
  return `${n} línea${n === 1 ? "" : "s"}`;
}

/**
 * Los colores oficiales de los 17 ODS, de Naciones Unidas.
 *
 * Están acá y no en la base porque son una constante del mundo, no un dato del
 * municipio: no cambian y no los edita nadie.
 */
const COLOR_ODS: Record<number, string> = {
  1: "#E5243B", 2: "#DDA63A", 3: "#4C9F38", 4: "#C5192D", 5: "#FF3A21",
  6: "#26BDE2", 7: "#FCC30B", 8: "#A21942", 9: "#FD6925", 10: "#DD1367",
  11: "#FD9D24", 12: "#BF8B2E", 13: "#3F7E44", 14: "#0A97D9", 15: "#56C02B",
  16: "#00689D", 17: "#19486A",
};

/**
 * El ODS de un eje — 09.09, párrafo 687: "agregarle a cada ODS su foto".
 *
 * Muestra el ícono oficial si el archivo está en `public/ods/{numero}.png`, y si
 * no, un cuadrado con el número y el color oficial del objetivo.
 *
 * Por qué así y no enlazando a la web de la ONU: si ese sitio cambia una ruta,
 * el tablero queda con huecos y nadie se entera hasta que un secretario lo abre.
 * Y por qué con reserva en vez de esperar a tener los archivos: el color oficial
 * ya distingue los 14 ODS de un vistazo, que es para lo que están, y el día que
 * las imágenes se copien a `public/ods/` aparecen solas sin tocar el código.
 */
function IconoODS({ numero, nombre }: { numero: number; nombre: string }) {
  const [sinImagen, setSinImagen] = useState(false);
  const color = COLOR_ODS[numero] ?? "#6B7280";
  const etiqueta = `ODS ${numero}: ${nombre}`;

  if (sinImagen) {
    return (
      <span
        title={etiqueta}
        aria-label={etiqueta}
        className="h-6 w-6 rounded flex items-center justify-center text-[10px] font-bold text-white shrink-0"
        style={{ backgroundColor: color }}
      >
        {numero}
      </span>
    );
  }

  return (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img
      src={`/ods/${numero}.png`}
      alt={etiqueta}
      title={etiqueta}
      width={24}
      height={24}
      onError={() => setSinImagen(true)}
      className="h-6 w-6 rounded shrink-0 object-cover"
    />
  );
}

/**
 * El porcentaje de avance del ámbito — 09.09, párrafo 703.
 *
 * Es el promedio simple de los proyectos imputados al ámbito y a todo lo que
 * cuelga de él. La misma cuenta que hace el Panel Ejecutivo para un área, así
 * que las dos pantallas dicen lo mismo de los mismos proyectos.
 */
function PorcentajeAmbito({ pct, color }: { pct: number | null; color: string | null }) {
  if (pct == null) {
    return (
      <span
        className="text-[10px] text-muted/60 shrink-0 w-14 text-right"
        title="Ninguno de los proyectos imputados tiene datos cargados"
      >
        sin datos
      </span>
    );
  }
  return (
    <span
      className="shrink-0 w-14 text-right"
      title={pct + " % de avance promedio de los proyectos imputados"}
    >
      <span className="text-sm font-bold tabular-nums" style={{ color: color ?? undefined }}>
        {pct}%
      </span>
    </span>
  );
}

/**
 * Los proyectos imputados a un nodo, listados debajo (09.09, párrafo 694).
 *
 * Es también la respuesta a "una opción para ver qué proyectos contiene cada
 * ámbito": abriendo el ámbito se llega a sus ejes, objetivos y líneas, y cada
 * uno muestra los suyos con su avance y un link a la ficha.
 */
function ProyectosDelNodo({ proyectos }: { proyectos: ProyectoImputado[] }) {
  if (proyectos.length === 0) return null;
  return (
    <ul className="pl-9 pr-3 pb-2 space-y-1">
      {proyectos.map((p) => (
        <li key={p.id} className="flex items-center gap-2 text-xs">
          <span
            className={`h-1.5 w-1.5 rounded-full shrink-0 ${
              p.estado === "verde"
                ? "bg-success"
                : p.estado === "amarillo"
                ? "bg-warning"
                : p.estado === "rojo"
                ? "bg-info"
                : "bg-muted/40"
            }`}
          />
          <Link
            href={`/proyectos/${p.id}`}
            className="flex-1 min-w-0 line-clamp-1 text-foreground/90 hover:text-primary"
            title={p.nombre}
          >
            {p.nombre}
          </Link>
          {p.unidad_nombre && (
            <span className="text-[10px] text-muted/70 shrink-0 hidden sm:inline">
              {p.unidad_nombre}
            </span>
          )}
          <span className="text-[10px] text-muted shrink-0 w-10 text-right tabular-nums">
            {p.pct != null ? `${p.pct}%` : "—"}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Selector plano de nodo imputable. Se usa en la ficha del proyecto. */
export function SelectorNodo({
  nodos,
  value,
  onChange,
  disabled,
}: {
  nodos: { id: string; tipo: string; ruta: string }[];
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className="w-full text-sm bg-background border border-border rounded px-3 py-2 disabled:opacity-50"
    >
      <option value="">Elegí un eje, objetivo o línea…</option>
      <optgroup label="Ejes estratégicos">
        {nodos.filter((n) => n.tipo === "eje").map((n) => (
          <option key={n.id} value={n.id}>{n.ruta}</option>
        ))}
      </optgroup>
      <optgroup label="Objetivos">
        {nodos.filter((n) => n.tipo === "objetivo").map((n) => (
          <option key={n.id} value={n.id}>{n.ruta}</option>
        ))}
      </optgroup>
      <optgroup label="Líneas estratégicas">
        {nodos.filter((n) => n.tipo === "linea").map((n) => (
          <option key={n.id} value={n.id}>{n.ruta}</option>
        ))}
      </optgroup>
    </select>
  );
}



"use client";

import { useState } from "react";
import Link from "next/link";
import { StatusBadge } from "@/components/ui/status-badge";
import { ProgressBar } from "@/components/ui/progress-bar";
import type { EstadoSemaforo } from "@/types/database";

/**
 * Lista de Proyectos prioritarios 2027 por área — 27.11: "les habíamos pedido
 * que esta vista sea como la de los proyectos [...] podrían darle prioridad al
 * buscador de prioritarios? [...] así vemos más general y perdemos menos
 * tiempo para buscar".
 *
 * Como el POA Operativo (/proyectos): arriba el buscador, el filtro por área y
 * el de estado; abajo una fila plegada por área y, al abrirla, una fila por
 * proyecto. Con una búsqueda o un filtro puesto, las áreas que quedan se
 * abren solas. Reemplaza al buscador del 12.11, que mostraba todas las
 * tarjetas abiertas una debajo de la otra.
 */

export type EstadoPrioritario = EstadoSemaforo;

export type FilaPrioritario = {
  id: string;
  nombre: string;
  /** El proyecto del POA vigente al que está vinculada, si tiene. */
  proyecto: string | null;
  estado: EstadoPrioritario;
  /** Avance del proyecto vinculado; null si no tiene seguimiento. */
  pct: number | null;
  meta: string;
};

export type AreaPrioritarios = { id: string; nombre: string; fichas: FilaPrioritario[] };

const sinTildes = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

const ESTADOS: { value: "todos" | EstadoPrioritario; label: string; clase: string }[] = [
  { value: "todos", label: "Todos", clase: "bg-primary/20 text-primary border-primary/30" },
  { value: "verde", label: "FINALIZADO", clase: "bg-success/20 text-success border-success/30" },
  { value: "amarillo", label: "EN EJECUCIÓN", clase: "bg-warning/20 text-warning border-warning/30" },
  { value: "rojo", label: "NO INICIADO", clase: "bg-info/20 text-info border-info/30" },
  { value: "sin_datos", label: "SIN SEGUIMIENTO", clase: "bg-border/60 text-foreground border-border" },
];

export function ListaPrioritarios({ areas, anio }: { areas: AreaPrioritarios[]; anio: number }) {
  const [busqueda, setBusqueda] = useState("");
  const [area, setArea] = useState("");
  const [estado, setEstado] = useState<"todos" | EstadoPrioritario>("todos");

  const q = sinTildes(busqueda.trim());
  const filtrando = !!q || !!area || estado !== "todos";

  const visibles = areas
    .filter((a) => !area || a.id === area)
    .map((a) => {
      // Si el área coincide con la búsqueda, van todos sus proyectos.
      const porArea = !!q && sinTildes(a.nombre).includes(q);
      const fichas = a.fichas.filter(
        (f) =>
          (estado === "todos" || f.estado === estado) &&
          (!q || porArea || sinTildes(`${f.nombre} ${f.proyecto ?? ""}`).includes(q))
      );
      return { ...a, fichas };
    })
    .filter((a) => a.fichas.length > 0);
  const total = visibles.reduce((n, a) => n + a.fichas.length, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar proyecto o área..."
          aria-label="Buscar proyecto o área"
          className="text-sm bg-surface border border-border rounded-lg px-3 py-1.5 text-foreground placeholder:text-muted/50 focus:outline-none focus:border-primary/50 w-64"
        />
        <select
          value={area}
          onChange={(e) => setArea(e.target.value)}
          aria-label="Filtrar por área"
          className="text-sm bg-surface border border-border rounded-lg px-3 py-1.5 text-foreground focus:outline-none focus:border-primary/50 max-w-full"
        >
          <option value="">Todas las áreas</option>
          {areas.map((a) => (
            <option key={a.id} value={a.id}>
              {a.nombre}
            </option>
          ))}
        </select>
        <div className="flex flex-wrap items-center gap-1">
          {ESTADOS.map((e) => (
            <button
              key={e.value}
              onClick={() => setEstado(e.value)}
              className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                estado === e.value ? e.clase : "border-border text-muted hover:text-foreground"
              }`}
            >
              {e.label}
            </button>
          ))}
        </div>
        {filtrando && (
          <span className="text-xs text-muted">
            {total} {total === 1 ? "proyecto" : "proyectos"} en {visibles.length}{" "}
            {visibles.length === 1 ? "área" : "áreas"}
          </span>
        )}
      </div>

      {visibles.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface p-8 text-center">
          <p className="text-sm text-muted">Ningún proyecto prioritario coincide con la búsqueda.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {visibles.map((a) => {
            const conSeguimiento = a.fichas.filter((f) => f.pct !== null).length;
            return (
              // La clave cambia al filtrar para que `open` se vuelva a aplicar.
              <details
                key={`${a.id}-${filtrando}`}
                open={filtrando}
                className="group rounded-xl border border-border bg-surface overflow-hidden"
              >
                <summary className="cursor-pointer list-none p-4 hover:bg-surface-hover transition-colors flex items-center gap-3">
                  <span className="text-muted text-xs w-3 group-open:rotate-90 transition-transform">▸</span>
                  <div className="h-8 w-8 rounded-lg bg-primary/20 flex items-center justify-center text-xs font-bold text-primary shrink-0">
                    {a.nombre[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-foreground line-clamp-1">{a.nombre}</p>
                    <p className="text-[10px] text-muted">
                      {a.fichas.length} {a.fichas.length === 1 ? "proyecto prioritario" : "proyectos prioritarios"}
                      {" · "}
                      {conSeguimiento} con seguimiento
                    </p>
                  </div>
                </summary>
                <div className="px-4 pb-4 pt-2 space-y-1.5 border-t border-border/50">
                  {a.fichas.map((f) => (
                    <Link
                      key={f.id}
                      href={`/poa-2027/prioritarios/${f.id}`}
                      className="rounded-md border border-border bg-surface p-2.5 flex flex-wrap md:flex-nowrap items-center gap-2 hover:bg-surface-hover hover:border-primary/30 transition-colors group/fila"
                    >
                      <span className="text-primary text-xs shrink-0">★</span>
                      <StatusBadge estado={f.estado} />
                      <div className="flex-1 min-w-0">
                        <p
                          className="text-xs font-semibold text-foreground group-hover/fila:text-primary line-clamp-1"
                          title={f.nombre}
                        >
                          {f.nombre}
                        </p>
                        <p className="text-[10px] text-muted line-clamp-1">
                          {f.proyecto ? `POA ${anio}: ${f.proyecto}` : "Sin proyecto del POA vinculado"}
                        </p>
                      </div>
                      <span className="text-[10px] text-muted shrink-0">{f.meta}</span>
                      {f.pct !== null ? (
                        <div className="flex items-center gap-2 shrink-0">
                          <div className="w-20 hidden md:block">
                            <ProgressBar value={f.pct} estado={f.estado} size="sm" />
                          </div>
                          <span className="text-xs font-bold text-foreground w-9 text-right">{f.pct}%</span>
                        </div>
                      ) : (
                        <span className="text-[9px] text-muted/60 uppercase shrink-0">sin seguimiento</span>
                      )}
                    </Link>
                  ))}
                </div>
              </details>
            );
          })}
        </div>
      )}
    </div>
  );
}

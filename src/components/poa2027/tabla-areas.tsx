"use client";

import { useState } from "react";
import Link from "next/link";
import type { ResumenAreaPoa } from "@/lib/poa-2027";

/**
 * La tabla de "Todas las áreas" del POA 2027, con buscador y orden — 06.10.
 *
 * "Aquí podríamos poner un buscador y organizar el orden como en los proyectos
 * o bien x orden alfabético." Son 48 áreas: sin buscador, encontrar una es leer
 * la lista entera.
 *
 * Los tres órdenes:
 *   - Por secretaría: como en Proyectos, cada área debajo de su secretaría. Es
 *     el que viene de entrada.
 *   - Alfabético.
 *   - Pendientes primero: las que tienen más proyectos sin traer arriba. Era el
 *     único orden hasta hoy.
 *
 * El buscador encuentra por el nombre del área o el de su secretaría, sin
 * importar tildes ni mayúsculas.
 */

type Orden = "secretaria" | "alfabetico" | "pendientes";

const sinTildes = (s: string) =>
  s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

const porNombre = (a: ResumenAreaPoa, b: ResumenAreaPoa) => a.nombre.localeCompare(b.nombre, "es");

export function TablaAreasPoa({ areas }: { areas: ResumenAreaPoa[] }) {
  const [busqueda, setBusqueda] = useState("");
  const [orden, setOrden] = useState<Orden>("secretaria");

  const q = sinTildes(busqueda.trim());
  const visibles = areas
    .filter((a) => !q || sinTildes(`${a.nombre} ${a.secretaria ?? ""}`).includes(q))
    .sort(
      orden === "pendientes"
        ? (a, b) => b.sinTraer - a.sinTraer || porNombre(a, b)
        : porNombre
    );

  // Por secretaría: un grupo por cada una, en orden alfabético, y las que no
  // cuelgan de ninguna al final.
  const grupos: { titulo: string | null; areas: ResumenAreaPoa[] }[] =
    orden === "secretaria"
      ? [...new Set(visibles.map((a) => a.secretaria))]
          .sort((a, b) => (a == null ? 1 : b == null ? -1 : a.localeCompare(b, "es")))
          .map((s) => ({
            titulo: s ?? "Sin secretaría",
            areas: visibles.filter((a) => a.secretaria === s),
          }))
      : [{ titulo: null, areas: visibles }];

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar área..."
          aria-label="Buscar área"
          className="text-sm bg-surface border border-border rounded-lg px-3 py-1.5 text-foreground placeholder:text-muted/50 focus:outline-none focus:border-primary/50 w-56"
        />
        <select
          value={orden}
          onChange={(e) => setOrden(e.target.value as Orden)}
          aria-label="Ordenar áreas"
          className="text-sm bg-surface border border-border rounded-lg px-3 py-1.5 text-foreground focus:outline-none focus:border-primary/50"
        >
          <option value="secretaria">Por secretaría</option>
          <option value="alfabetico">Alfabético</option>
          <option value="pendientes">Más pendientes primero</option>
        </select>
        {q && (
          <span className="text-xs text-muted">
            {visibles.length} de {areas.length}
          </span>
        )}
      </div>

      <div className="overflow-x-auto border border-border rounded-lg">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border bg-surface-hover/40 text-muted">
              <th className="text-left font-medium px-3 py-2">Área</th>
              <th className="text-right font-medium px-3 py-2" title="Proyectos activos del POA 2026">Proyectos 2026</th>
              <th className="text-right font-medium px-3 py-2" title="Entran en el documento">Aceptadas</th>
              <th className="text-right font-medium px-3 py-2" title="Esperando que el área las revise">Propuestas</th>
              <th className="text-right font-medium px-3 py-2" title="Proyectos del 2026 que todavía no se trajeron">Sin traer</th>
              <th className="px-3 py-2"><span className="sr-only">Editar</span></th>
            </tr>
          </thead>
          {visibles.length === 0 ? (
            <tbody>
              <tr>
                <td colSpan={6} className="px-3 py-4 text-center text-muted">
                  Ningún área coincide con “{busqueda.trim()}”.
                </td>
              </tr>
            </tbody>
          ) : (
            grupos.map((g) => (
              <tbody key={g.titulo ?? "todas"} className="divide-y divide-border">
                {g.titulo && (
                  <tr className="bg-surface-hover/60">
                    <td colSpan={6} className="px-3 py-1.5 text-[11px] font-semibold text-foreground uppercase tracking-wide">
                      {g.titulo}
                    </td>
                  </tr>
                )}
                {g.areas.map((a) => (
                  <tr key={a.unidad_id}>
                    <td className={`py-1.5 ${g.titulo ? "pl-6 pr-3" : "px-3"}`}>
                      <Link
                        href={`/poa-2027/mis-fichas?unidad=${a.unidad_id}`}
                        className="text-foreground hover:text-primary"
                      >
                        {a.nombre}
                      </Link>
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-muted">{a.proyectos2026}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{a.aceptadas || "—"}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{a.propuestas || "—"}</td>
                    <td className={`px-3 py-1.5 text-right tabular-nums ${a.sinTraer > 0 ? "text-warning" : "text-muted/50"}`}>
                      {a.sinTraer || "—"}
                    </td>
                    <td className="px-3 py-1.5 text-right">
                      <Link
                        href={`/poa-2027/mis-fichas?unidad=${a.unidad_id}`}
                        className="text-primary hover:underline whitespace-nowrap"
                      >
                        Editar →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            ))
          )}
        </table>
      </div>
    </div>
  );
}

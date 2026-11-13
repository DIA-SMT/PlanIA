"use client";

import { useState } from "react";

/**
 * Buscador por área para Proyectos prioritarios 2027 — 12.11: "aquí se puede
 * poner un buscador por área como está en la POA. Perdemos mucho tiempo
 * buscando abajo así por separado".
 *
 * Las secciones llegan armadas del servidor; acá solo se muestran o no. Busca
 * por el nombre del área y por el de sus proyectos, sin importar tildes ni
 * mayúsculas, como la tabla de áreas del POA 2027.
 */

const sinTildes = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

export function BuscadorAreas({
  secciones,
}: {
  secciones: { clave: string; texto: string; contenido: React.ReactNode }[];
}) {
  const [busqueda, setBusqueda] = useState("");
  const q = sinTildes(busqueda.trim());
  const visibles = secciones.filter((s) => !q || sinTildes(s.texto).includes(q));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar área o proyecto..."
          aria-label="Buscar área o proyecto"
          className="text-sm bg-surface border border-border rounded-lg px-3 py-1.5 text-foreground placeholder:text-muted/50 focus:outline-none focus:border-primary/50 w-64"
        />
        {q && (
          <span className="text-xs text-muted">
            {visibles.length} de {secciones.length} áreas
          </span>
        )}
      </div>
      {visibles.length === 0 ? (
        <p className="text-sm text-muted">Ningún área ni proyecto coincide con “{busqueda.trim()}”.</p>
      ) : (
        <div className="space-y-8">
          {visibles.map((s) => (
            <div key={s.clave}>{s.contenido}</div>
          ))}
        </div>
      )}
    </div>
  );
}

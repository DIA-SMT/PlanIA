"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { agregarAreaPrioritaria, quitarAreaPrioritaria } from "@/lib/actions-proyectos-prioritarios";

/**
 * Las áreas con proyectos prioritarios, en POA 2027 → Proyectos prioritarios.
 *
 * 12.11: "aquí se puede poner un buscador por área como está en la POA.
 * Perdemos mucho tiempo buscando abajo así por separado". Busca como la tabla
 * de áreas del POA 2027: sin importar tildes ni mayúsculas.
 *
 * 11.11: "crear una herramienta/botón en este tablero para que desde
 * planificación estratégica podamos asignar proyectos prioritarios a nuevas
 * direcciones y eliminar direcciones de ser necesario". Solo para
 * Planificación: agregar un área de la lista de abajo y quitar las que están.
 */

const sinTildes = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

const TIPOS: Record<string, string> = {
  secretaria: "Secretarías",
  subsecretaria: "Subsecretarías",
  direccion: "Direcciones",
  coordinacion: "Coordinaciones",
  departamento: "Departamentos",
};

export function AreasPrioritarias({
  areas,
  esPlanificacion,
  paraAgregar,
}: {
  areas: { id: string; nombre: string; fichas: number }[];
  esPlanificacion: boolean;
  paraAgregar: { id: string; nombre: string; tipo: string }[];
}) {
  const [busqueda, setBusqueda] = useState("");
  const q = sinTildes(busqueda.trim());
  const visibles = areas.filter((a) => !q || sinTildes(a.nombre).includes(q));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar área..."
          aria-label="Buscar área"
          className="text-sm bg-surface border border-border rounded-lg px-3 py-1.5 text-foreground placeholder:text-muted/50 focus:outline-none focus:border-primary/50 w-56"
        />
        {q && (
          <span className="text-xs text-muted">
            {visibles.length} de {areas.length}
          </span>
        )}
      </div>

      {visibles.length === 0 ? (
        <p className="text-sm text-muted">
          {areas.length === 0 ? "Todavía no hay áreas con proyectos prioritarios." : `Ningún área coincide con “${busqueda.trim()}”.`}
        </p>
      ) : (
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {visibles.map((a) => (
            <li key={a.id} className="flex items-stretch gap-1">
              <Link
                href={`/poa-2027/prioritarios?unidad=${a.id}`}
                className="flex-1 min-w-0 flex items-center justify-between gap-3 rounded-xl border border-border bg-surface px-4 py-3 hover:bg-surface-hover"
              >
                <span className="text-sm text-foreground">{a.nombre}</span>
                <span
                  className={`text-[11px] shrink-0 tabular-nums ${a.fichas ? "font-semibold text-primary" : "text-muted/60"}`}
                >
                  {a.fichas ? `${a.fichas} ${a.fichas === 1 ? "ficha" : "fichas"}` : "sin fichas"}
                </span>
              </Link>
              {esPlanificacion && <QuitarArea area={a} />}
            </li>
          ))}
        </ul>
      )}

      {esPlanificacion && <AgregarArea opciones={paraAgregar} />}
    </div>
  );
}

function QuitarArea({ area }: { area: { id: string; nombre: string; fichas: number } }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pendiente, startTransition] = useTransition();
  const quitar = () => {
    const aviso =
      area.fichas > 0
        ? `\n\nSus ${area.fichas === 1 ? "ficha queda guardada" : `${area.fichas} fichas quedan guardadas`} pero deja${area.fichas === 1 ? "" : "n"} de verse. Si se vuelve a agregar el área, aparece${area.fichas === 1 ? "" : "n"} de nuevo.`
        : "";
    if (!confirm(`¿Quitar ${area.nombre} de proyectos prioritarios?${aviso}`)) return;
    setError(null);
    startTransition(async () => {
      const r = await quitarAreaPrioritaria(area.id);
      if (!r.success) {
        setError(r.error ?? "No se pudo quitar");
        return;
      }
      router.refresh();
    });
  };
  return (
    <span className="flex flex-col justify-center">
      <button
        onClick={quitar}
        disabled={pendiente}
        title={`Quitar ${area.nombre} de proyectos prioritarios`}
        className="h-full text-[11px] text-danger border border-danger/30 rounded-xl px-2.5 hover:bg-danger/10 disabled:opacity-50"
      >
        {pendiente ? "…" : "Quitar"}
      </button>
      {error && <span className="text-[11px] text-danger">{error}</span>}
    </span>
  );
}

function AgregarArea({ opciones }: { opciones: { id: string; nombre: string; tipo: string }[] }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [filtro, setFiltro] = useState("");
  const [elegida, setElegida] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendiente, startTransition] = useTransition();

  if (!abierto) {
    return (
      <button
        onClick={() => setAbierto(true)}
        className="text-sm bg-primary/10 text-primary border border-primary/30 rounded-lg px-4 py-2 hover:bg-primary/20"
      >
        + Agregar un área
      </button>
    );
  }

  const q = sinTildes(filtro.trim());
  const filtradas = opciones.filter((o) => !q || sinTildes(o.nombre).includes(q));
  const grupos = [...new Set(filtradas.map((o) => o.tipo))].sort(
    (a, b) => Object.keys(TIPOS).indexOf(a) - Object.keys(TIPOS).indexOf(b)
  );

  const agregar = () => {
    if (!elegida) return;
    setError(null);
    startTransition(async () => {
      const r = await agregarAreaPrioritaria(elegida);
      if (!r.success) {
        setError(r.error ?? "No se pudo agregar");
        return;
      }
      setElegida("");
      setFiltro("");
      setAbierto(false);
      router.refresh();
    });
  };

  return (
    <div className="rounded-xl border border-primary/30 bg-surface p-4 space-y-3">
      <p className="text-sm font-semibold text-foreground">Agregar un área a proyectos prioritarios</p>
      <p className="text-xs text-muted">
        El área elegida va a tener el botón de Proyectos prioritarios en su POA 2027, y sus fichas
        van a aparecer en el tablero.
      </p>
      <input
        type="search"
        value={filtro}
        onChange={(e) => setFiltro(e.target.value)}
        placeholder="Filtrar por nombre..."
        aria-label="Filtrar áreas para agregar"
        autoFocus
        className="w-full text-sm bg-background border border-border rounded px-3 py-1.5"
      />
      <select
        value={elegida}
        onChange={(e) => setElegida(e.target.value)}
        size={8}
        aria-label="Área para agregar"
        className="w-full text-sm bg-background border border-border rounded px-2 py-1"
      >
        {grupos.map((t) => (
          <optgroup key={t} label={TIPOS[t] ?? "Otras"}>
            {filtradas
              .filter((o) => o.tipo === t)
              .map((o) => (
                <option key={o.id} value={o.id}>
                  {o.nombre}
                </option>
              ))}
          </optgroup>
        ))}
      </select>
      {filtradas.length === 0 && <p className="text-xs text-muted">Ningún área coincide con “{filtro.trim()}”.</p>}
      <div className="flex items-center gap-2">
        <button
          onClick={agregar}
          disabled={pendiente || !elegida}
          className="text-sm bg-primary text-white rounded-lg px-4 py-2 hover:opacity-90 disabled:opacity-50"
        >
          {pendiente ? "Agregando…" : "Agregar"}
        </button>
        <button
          onClick={() => setAbierto(false)}
          disabled={pendiente}
          className="text-sm border border-border rounded-lg px-4 py-2 hover:bg-surface-hover"
        >
          Cancelar
        </button>
      </div>
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}

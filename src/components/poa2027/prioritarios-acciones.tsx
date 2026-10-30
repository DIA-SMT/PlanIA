"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  crearProyectoPrioritario,
  editarCampoPrioritario,
  editarHistorialPrioritario,
  borrarProyectoPrioritario,
} from "@/lib/actions-proyectos-prioritarios";

/**
 * Proyectos prioritarios — corrección del 28.10.
 *
 * La ficha se edita como las del POA 2027 (CampoEditable): se ve como texto, al
 * hacer clic se abre el cuadro y guarda al salir. Va aparte de CampoEditable
 * porque acá hay números, años, un enlace y listas, y aquel trabaja con texto
 * corrido (renglones, viñetas, mayúsculas) que a un número le haría mal.
 */

type Guardar = (texto: string) => Promise<{ success: boolean; error?: string }>;

function useGuardar(guardar: Guardar, alTerminar: () => void) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pendiente, startTransition] = useTransition();
  const correr = (texto: string) => {
    setError(null);
    startTransition(async () => {
      const r = await guardar(texto);
      if (!r.success) {
        setError(r.error ?? "No se pudo guardar");
        return;
      }
      alTerminar();
      router.refresh();
    });
  };
  return { correr, error, pendiente };
}

/**
 * Un campo de la ficha. `mostrar` es como se ve guardado ("3.000 calles");
 * `valor` es lo que se edita ("3000").
 */
export function CampoPrioritario({
  id,
  campo,
  valor,
  mostrar,
  editable,
  largo = false,
  placeholder = "Completar por el director",
  className = "",
}: {
  id: string;
  campo: string;
  valor: string;
  mostrar?: React.ReactNode;
  editable: boolean;
  largo?: boolean;
  placeholder?: string;
  className?: string;
}) {
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState(valor);
  const { correr, error, pendiente } = useGuardar(
    (t) => editarCampoPrioritario(id, campo, t),
    () => setEditando(false)
  );

  const vacio = !valor.trim();
  const visible = vacio ? placeholder : mostrar ?? valor;

  if (!editable) {
    return <span className={`${className} ${vacio ? "text-muted/60 italic" : ""}`}>{vacio ? "—" : visible}</span>;
  }

  if (!editando) {
    return (
      <span
        role="button"
        tabIndex={0}
        onClick={() => {
          setTexto(valor);
          setEditando(true);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setTexto(valor);
            setEditando(true);
          }
        }}
        title="Hacé clic para editar"
        className={`${className} cursor-text rounded px-0.5 -mx-0.5 hover:bg-primary/10 ${
          vacio ? "text-muted/60 italic" : ""
        } ${largo ? "block whitespace-pre-wrap" : ""}`}
      >
        {visible}
      </span>
    );
  }

  const guardar = () => (texto.trim() === valor.trim() ? setEditando(false) : correr(texto));
  const teclas = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") setEditando(false);
    if (e.key === "Enter" && (!largo || e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      guardar();
    }
  };
  const estilo = "w-full bg-background border border-primary/40 rounded px-2 py-1 text-sm disabled:opacity-50";

  return (
    <span className="block">
      {largo ? (
        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onBlur={guardar}
          onKeyDown={teclas}
          disabled={pendiente}
          autoFocus
          rows={3}
          className={`${estilo} resize-y`}
        />
      ) : (
        <input
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onBlur={guardar}
          onKeyDown={teclas}
          disabled={pendiente}
          autoFocus
          className={estilo}
        />
      )}
      <span className="block text-[10px] text-muted/70 mt-0.5">
        {pendiente ? "Guardando…" : "Se guarda al salir del campo · Escape para cancelar"}
      </span>
      {error && <span className="block text-[11px] text-danger">{error}</span>}
    </span>
  );
}

/** Un campo que se elige de una lista (el proyecto del 2026, la periodicidad). Guarda al elegir. */
export function SelectorPrioritario({
  id,
  campo,
  valor,
  opciones,
  mostrar,
  editable,
  vacio,
}: {
  id: string;
  campo: string;
  valor: string;
  opciones: { valor: string; rotulo: string }[];
  mostrar: string | null;
  editable: boolean;
  vacio: string;
}) {
  const { correr, error, pendiente } = useGuardar((t) => editarCampoPrioritario(id, campo, t), () => {});

  if (!editable) {
    return <span className={mostrar ? "" : "text-muted/60 italic"}>{mostrar ?? "—"}</span>;
  }
  return (
    <span className="block">
      <select
        value={valor}
        onChange={(e) => correr(e.target.value)}
        disabled={pendiente}
        className="w-full bg-background border border-border rounded px-2 py-1 text-sm disabled:opacity-50"
      >
        <option value="">{vacio}</option>
        {opciones.map((o) => (
          <option key={o.valor} value={o.valor}>
            {o.rotulo}
          </option>
        ))}
      </select>
      {error && <span className="block text-[11px] text-danger">{error}</span>}
    </span>
  );
}

/** Lo ejecutado en un año del historial. */
export function CeldaHistorial({
  id,
  anio,
  valor,
  editable,
}: {
  id: string;
  anio: number;
  valor: number | null;
  editable: boolean;
}) {
  const [editando, setEditando] = useState(false);
  const inicial = valor === null ? "" : String(valor);
  const [texto, setTexto] = useState(inicial);
  const { correr, error, pendiente } = useGuardar(
    (t) => editarHistorialPrioritario(id, anio, t),
    () => setEditando(false)
  );
  const mostrar =
    valor === null ? (
      <span className="text-muted/60 italic">sin datos disponibles</span>
    ) : (
      valor.toLocaleString("es-AR", { maximumFractionDigits: 2 })
    );

  if (!editable) return <>{mostrar}</>;
  if (!editando) {
    return (
      <button
        onClick={() => {
          setTexto(inicial);
          setEditando(true);
        }}
        title="Hacé clic para editar"
        className="rounded px-0.5 hover:bg-primary/10"
      >
        {mostrar}
      </button>
    );
  }
  const guardar = () => (texto.trim() === inicial ? setEditando(false) : correr(texto));
  return (
    <span className="inline-block">
      <input
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        onBlur={guardar}
        onKeyDown={(e) => {
          if (e.key === "Escape") setEditando(false);
          if (e.key === "Enter") guardar();
        }}
        disabled={pendiente}
        autoFocus
        placeholder="vacío = sin datos"
        className="w-28 bg-background border border-primary/40 rounded px-2 py-0.5 text-sm text-right disabled:opacity-50"
      />
      {error && <span className="block text-[11px] text-danger">{error}</span>}
    </span>
  );
}

/** "Generar proyecto prioritario": nombre y, si corresponde, el proyecto del 2026. */
export function NuevoPrioritario({
  unidadId,
  proyectos,
}: {
  unidadId: string;
  proyectos: { id: string; nombre: string }[];
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [nombre, setNombre] = useState("");
  const [proyectoId, setProyectoId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendiente, startTransition] = useTransition();

  if (!abierto) {
    return (
      <button
        onClick={() => setAbierto(true)}
        className="text-sm bg-primary/10 text-primary border border-primary/30 rounded-lg px-4 py-2 hover:bg-primary/20"
      >
        + Generar proyecto prioritario
      </button>
    );
  }

  const crear = () => {
    setError(null);
    startTransition(async () => {
      const r = await crearProyectoPrioritario(unidadId, nombre, proyectoId || null);
      if (!r.success || !r.id) {
        setError(r.error ?? "No se pudo crear");
        return;
      }
      router.push(`/poa-2027/prioritarios/${r.id}`);
    });
  };

  return (
    <div className="rounded-xl border border-primary/30 bg-surface p-4 space-y-3">
      <div>
        <label className="text-[11px] text-muted uppercase tracking-wider">Nombre del proyecto</label>
        <input
          value={nombre}
          onChange={(e) => {
            setNombre(e.target.value);
          }}
          autoFocus
          placeholder="Ej.: Plan Integral de Pavimentación de Calles"
          className="mt-1 w-full bg-background border border-border rounded px-3 py-2 text-sm"
        />
      </div>
      {proyectos.length > 0 && (
        <div>
          <label className="text-[11px] text-muted uppercase tracking-wider">
            Proyecto del POA 2026 al que corresponde (opcional)
          </label>
          <select
            value={proyectoId}
            onChange={(e) => {
              setProyectoId(e.target.value);
              // Si todavía no escribió el nombre, se propone el del proyecto.
              const py = proyectos.find((p) => p.id === e.target.value);
              if (py && !nombre.trim()) setNombre(py.nombre);
            }}
            className="mt-1 w-full bg-background border border-border rounded px-3 py-2 text-sm"
          >
            <option value="">Ninguno</option>
            {proyectos.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </select>
          <p className="text-[11px] text-muted mt-1">
            De ahí sale el eje del Plan Rector de la ficha.
          </p>
        </div>
      )}
      <div className="flex items-center gap-2">
        <button
          onClick={crear}
          disabled={pendiente || !nombre.trim()}
          className="text-sm bg-primary text-white rounded-lg px-4 py-2 hover:opacity-90 disabled:opacity-50"
        >
          {pendiente ? "Generando…" : "Generar ficha"}
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

export function BorrarPrioritario({ id, volverA }: { id: string; volverA: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pendiente, startTransition] = useTransition();
  const borrar = () => {
    if (!confirm("¿Borrar esta ficha de proyecto prioritario?")) return;
    setError(null);
    startTransition(async () => {
      const r = await borrarProyectoPrioritario(id);
      if (!r.success) {
        setError(r.error ?? "No se pudo borrar");
        return;
      }
      router.push(volverA);
    });
  };
  return (
    <span>
      <button
        onClick={borrar}
        disabled={pendiente}
        className="text-xs text-danger border border-danger/30 rounded-lg px-3 py-1.5 hover:bg-danger/10 disabled:opacity-50"
      >
        {pendiente ? "Borrando…" : "Borrar ficha"}
      </button>
      {error && <span className="block text-[11px] text-danger">{error}</span>}
    </span>
  );
}

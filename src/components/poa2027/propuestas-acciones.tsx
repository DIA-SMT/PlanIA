"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  traerProyectosDe2026,
  aceptarFicha,
  volverAPropuesta,
  crearFichaNueva,
} from "@/lib/actions-propuestas-poa";

/**
 * Traer los proyectos del 2026 y aceptar las propuestas — 28.09.
 */

export function TraerDe2026({ unidadId, hayPropuestas }: { unidadId: string; hayPropuestas: boolean }) {
  const router = useRouter();
  const [pendiente, startTransition] = useTransition();
  const [aviso, setAviso] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const traer = () => {
    setAviso(null);
    setError(null);
    startTransition(async () => {
      const r = await traerProyectosDe2026(unidadId);
      if (!r.success) {
        setError(r.error ?? "No se pudo");
        return;
      }
      setAviso(
        r.creadas
          ? `Se trajeron ${r.creadas} proyectos. Completalos y aceptá los que vayan al POA 2027.`
          : "Ya estaban todos traídos."
      );
      router.refresh();
    });
  };

  return (
    <div className="space-y-1.5">
      <button
        onClick={traer}
        disabled={pendiente}
        className="text-sm border border-border rounded-lg px-4 py-2 hover:bg-surface-hover disabled:opacity-50"
      >
        {pendiente ? "Trayendo…" : hayPropuestas ? "Traer los que falten del POA 2026" : "Traer mis proyectos del POA 2026"}
      </button>
      {aviso && <p className="text-xs text-success">{aviso}</p>}
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}

/** "Va al POA 2027" / "Sacar del POA". */
export function AceptarFicha({ id, aceptada }: { id: string; aceptada: boolean }) {
  const router = useRouter();
  const [pendiente, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const correr = (fn: () => Promise<{ success: boolean; error?: string }>) => {
    setError(null);
    startTransition(async () => {
      const r = await fn();
      if (!r.success) setError(r.error ?? "No se pudo");
      else router.refresh();
    });
  };

  return (
    <div className="shrink-0 text-right">
      {aceptada ? (
        <button
          onClick={() => correr(() => volverAPropuesta(id))}
          disabled={pendiente}
          title="Sale del documento hasta que la vuelvas a aceptar"
          className="text-[11px] text-muted hover:text-foreground underline disabled:opacity-50"
        >
          Sacar del POA
        </button>
      ) : (
        <button
          onClick={() => correr(() => aceptarFicha(id))}
          disabled={pendiente}
          className="text-xs bg-primary text-white rounded-lg px-3 py-1.5 hover:bg-primary/90 disabled:opacity-50"
        >
          {pendiente ? "…" : "Va al POA 2027"}
        </button>
      )}
      {error && <p className="text-[11px] text-danger mt-1">{error}</p>}
    </div>
  );
}

/**
 * "+ Cargar un proyecto nuevo" — 03.11. Pide solo el nombre: la ficha aparece
 * en "Para revisar" con el mismo formato que las demás y se completa ahí.
 */
export function NuevoProyectoPoa({ unidadId }: { unidadId: string }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [nombre, setNombre] = useState("");
  const [aviso, setAviso] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, startTransition] = useTransition();

  if (!abierto) {
    return (
      <div className="space-y-1.5">
        <button
          onClick={() => {
            setAbierto(true);
            setAviso(null);
          }}
          className="text-sm bg-primary/10 text-primary border border-primary/30 rounded-lg px-4 py-2 hover:bg-primary/20"
        >
          + Cargar un proyecto nuevo
        </button>
        {aviso && <p className="text-xs text-success">{aviso}</p>}
      </div>
    );
  }

  const crear = () => {
    setError(null);
    startTransition(async () => {
      const r = await crearFichaNueva(unidadId, nombre);
      if (!r.success) {
        setError(r.error ?? "No se pudo crear");
        return;
      }
      setAbierto(false);
      setNombre("");
      setAviso("Listo: está al final de \"Para revisar\". Completala y aceptala para que vaya al POA 2027.");
      router.refresh();
    });
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        value={nombre}
        onChange={(e) => setNombre(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && nombre.trim()) crear();
          if (e.key === "Escape") setAbierto(false);
        }}
        autoFocus
        placeholder="Nombre del proyecto"
        className="text-sm bg-background border border-border rounded-lg px-3 py-2 w-72"
      />
      <button
        onClick={crear}
        disabled={pendiente || !nombre.trim()}
        className="text-sm bg-primary text-white rounded-lg px-4 py-2 hover:opacity-90 disabled:opacity-50"
      >
        {pendiente ? "Creando…" : "Crear"}
      </button>
      <button
        onClick={() => setAbierto(false)}
        disabled={pendiente}
        className="text-sm border border-border rounded-lg px-4 py-2 hover:bg-surface-hover"
      >
        Cancelar
      </button>
      {error && <p className="w-full text-xs text-danger">{error}</p>}
    </div>
  );
}

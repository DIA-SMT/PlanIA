"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { traerProyectosDe2026ParaTodas } from "@/lib/actions-propuestas-poa";

/**
 * Traer los proyectos 2026 de todas las áreas — 05.10, para Planificación.
 *
 * "La idea es que ustedes carguen y nosotros editamos." Escribe cientos de
 * fichas de una vez, así que antes de hacerlo dice qué va a hacer y qué no. Lo
 * que no se explica antes, después se pregunta.
 */
export function TraerTodasBoton({
  sinTraer,
  areasSinTraer,
}: {
  sinTraer: number;
  areasSinTraer: number;
}) {
  const router = useRouter();
  const [pendiente, empezar] = useTransition();
  const [abierto, setAbierto] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const traer = () => {
    setError(null);
    setOk(null);
    empezar(async () => {
      const r = await traerProyectosDe2026ParaTodas();
      if (!r.success) {
        setError(r.error ?? "No se pudo traer");
        if (r.creadas) router.refresh();
        return;
      }
      setOk(
        r.creadas === 0
          ? "No había nada para traer: todas las áreas ya tenían sus proyectos."
          : `Listo: ${r.creadas} fichas propuestas en ${r.areas} ${r.areas === 1 ? "área" : "áreas"}. Cada área las ve en “Editar mi POA” para revisarlas y aceptarlas.`
      );
      setAbierto(false);
      router.refresh();
    });
  };

  if (sinTraer === 0 && !ok) {
    return (
      <p className="text-xs text-success">
        Todas las áreas ya tienen sus proyectos del 2026 traídos al POA 2027.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {!abierto ? (
        sinTraer > 0 && (
          <button
            onClick={() => {
              setAbierto(true);
              setOk(null);
              setError(null);
            }}
            className="text-sm bg-primary text-white rounded-lg px-4 py-2 hover:bg-primary/90"
          >
            Traer los proyectos 2026 de todas las áreas
          </button>
        )
      ) : (
        <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 space-y-3">
          <p className="text-sm text-foreground">
            Se van a crear <strong>{sinTraer} fichas propuestas</strong> en{" "}
            <strong>
              {areasSinTraer} {areasSinTraer === 1 ? "área" : "áreas"}
            </strong>
            , una por cada proyecto del POA 2026 que todavía no está en el 2027.
          </p>
          <ul className="text-xs text-muted space-y-1 list-disc pl-5 leading-relaxed">
            <li>
              Cada ficha queda en el área de su proyecto, precargada con el nombre, la
              descripción, la meta y la línea de base que trajo el libro del POA.
            </li>
            <li>
              <strong className="text-foreground/80">No se acepta ninguna.</strong> Son
              propuestas: no entran en el documento de ningún área hasta que alguien las revise
              y las acepte. El POA de cada área queda como está.
            </li>
            <li>No se toca nada de lo que ya existe, ni lo traído antes ni lo cargado a mano.</li>
            <li>Apretarlo de nuevo no duplica nada.</li>
            <li>
              El texto se copia tal como vino del libro. Si un proyecto tenía la descripción
              equivocada en el 2026, la va a tener también acá.
            </li>
          </ul>
          <div className="flex gap-3">
            <button
              onClick={traer}
              disabled={pendiente}
              className="text-sm bg-primary text-white rounded-lg px-4 py-2 hover:bg-primary/90 disabled:opacity-50"
            >
              {pendiente ? "Trayendo…" : "Traer"}
            </button>
            <button
              onClick={() => setAbierto(false)}
              disabled={pendiente}
              className="text-sm text-muted hover:text-foreground"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {ok && (
        <p className="text-xs text-success border border-success/30 bg-success/5 rounded-lg px-3 py-2">
          {ok}
        </p>
      )}
      {error && (
        <p className="text-xs text-danger border border-danger/30 bg-danger/5 rounded-lg px-3 py-2">
          {error}
        </p>
      )}
    </div>
  );
}

"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { marcarAlertaLeida } from "@/lib/actions";
import type { AlertaConLectura } from "@/types/database";

/**
 * Cartel arriba de la pantalla para las alertas marcadas como IMPORTANTES y
 * todavía sin leer (26.08). Es el canal para avisos que no se pueden perder,
 * tipo "presentación de informes de grado de avance: 01 de octubre".
 *
 * Cerrarlo marca la alerta como leída: es un acuse de recibo, no un "recordame
 * después". Lo cerrado sigue estando en la campanita.
 */
export function CartelAlertas({ alertas }: { alertas: AlertaConLectura[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const visibles = alertas.filter((a) => a.importante && !a.leida_at);
  if (visibles.length === 0) return null;

  const cerrar = (id: string) => {
    startTransition(async () => {
      await marcarAlertaLeida(id);
      router.refresh();
    });
  };

  return (
    <div className="no-imprimir space-y-2 mb-4">
      {visibles.map((a) => (
        <div
          key={a.id}
          role="status"
          className="rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 flex items-start gap-3"
        >
          <span className="text-base leading-none mt-0.5">⚠️</span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-foreground">{a.titulo}</p>
            <p className="text-xs text-muted mt-1 whitespace-pre-line break-words">
              {a.cuerpo}
            </p>
          </div>
          <button
            onClick={() => cerrar(a.id)}
            disabled={isPending}
            title="Entendido, no volver a mostrar"
            className="text-muted hover:text-foreground text-sm disabled:opacity-50 shrink-0"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}

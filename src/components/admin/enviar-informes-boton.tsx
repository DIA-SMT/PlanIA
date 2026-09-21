"use client";

import { useState, useTransition } from "react";
import { enviarInformesPorCorreo } from "@/lib/actions-informe";

/**
 * Manda el informe de avance por correo a los responsables — 18.09, párrafo 1033.
 *
 * Pide confirmación antes: son 68 correos a secretarios, subsecretarios y
 * directores, y no hay forma de deshacerlo. Primero se ofrece el ensayo, que
 * cuenta a cuántos les llegaría sin mandar nada.
 */
export function EnviarInformesBoton({ corteId, etiqueta }: { corteId?: string; etiqueta: string }) {
  const [pendiente, startTransition] = useTransition();
  const [aviso, setAviso] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState(false);

  const correr = (ensayo: boolean) => {
    setAviso(null);
    setError(null);
    startTransition(async () => {
      const r = await enviarInformesPorCorreo({ corteId, ensayo });
      setConfirmando(false);
      if (!r.success) {
        setError(r.error ?? "No se pudo enviar");
        return;
      }
      const extras = [
        r.sinCorreo ? `${r.sinCorreo} sin correo cargado` : null,
        r.areasSinResponsable ? `${r.areasSinResponsable} áreas sin responsable` : null,
        r.detalle ? `Primer error: ${r.detalle}` : null,
      ].filter(Boolean);
      setAviso(
        (ensayo
          ? `Ensayo: le llegaría a ${r.enviados} personas.`
          : `Informe enviado a ${r.enviados} personas.`) +
          (extras.length ? ` (${extras.join(" · ")})` : "")
      );
    });
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => correr(true)}
          disabled={pendiente}
          className="text-xs border border-border rounded-lg px-3 py-1.5 hover:bg-surface-hover disabled:opacity-50"
        >
          {pendiente ? "…" : "Probar sin enviar"}
        </button>
        {confirmando ? (
          <>
            <button
              onClick={() => correr(false)}
              disabled={pendiente}
              className="text-xs bg-danger text-white rounded-lg px-3 py-1.5 hover:bg-danger/90 disabled:opacity-50"
            >
              Sí, enviar ahora
            </button>
            <button
              onClick={() => setConfirmando(false)}
              className="text-xs text-muted hover:text-foreground underline"
            >
              Cancelar
            </button>
          </>
        ) : (
          <button
            onClick={() => setConfirmando(true)}
            disabled={pendiente}
            className="text-xs bg-primary text-white rounded-lg px-3 py-1.5 hover:bg-primary/90 disabled:opacity-50"
          >
            Enviar el informe por correo
          </button>
        )}
      </div>

      {confirmando && (
        <p className="text-[11px] text-warning">
          Le va a llegar a cada secretario, subsecretario y director el informe de su área
          ({etiqueta}). No se puede deshacer.
        </p>
      )}
      {aviso && (
        <p className="text-[11px] text-success border border-success/30 bg-success/5 rounded px-2 py-1.5">
          {aviso}
        </p>
      )}
      {error && (
        <p className="text-[11px] text-danger border border-danger/30 bg-danger/5 rounded px-2 py-1.5">
          {error}
        </p>
      )}
    </div>
  );
}

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { tomarCorteAhora } from "@/lib/actions-corte";

/**
 * Botón para tomar la foto del corte a mano.
 *
 * El camino normal es el proceso programado, que la toma sola el último día de
 * cada trimestre. Esto es la red por si ese día falla, o para cerrar el
 * trimestre unos días después.
 */
export function TomarCorteBoton({ finDeTrimestre }: { finDeTrimestre: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [abierto, setAbierto] = useState(false);
  const [fecha, setFecha] = useState("");

  const tomar = () => {
    setError(null);
    setOk(null);
    startTransition(async () => {
      const r = await tomarCorteAhora(fecha ? { fecha_corte: fecha } : undefined);
      if (r.success) {
        const x = r.resultado;
        setOk(
          `${x.reemplazo ? "Foto reemplazada" : "Foto tomada"}: ${x.proyectos} proyectos ` +
            `(${x.finalizados} finalizados, ${x.en_ejecucion} en ejecución, ` +
            `${x.no_iniciados} no iniciados, ${x.sin_datos} sin datos)` +
            `${x.pct_promedio != null ? ` · avance promedio ${x.pct_promedio}%` : ""}`
        );
        setAbierto(false);
        setFecha("");
        router.refresh();
      } else {
        setError(r.error);
      }
    });
  };

  return (
    <div className="space-y-2">
      {!abierto ? (
        <button
          onClick={() => { setAbierto(true); setOk(null); setError(null); }}
          className="text-sm bg-primary text-white rounded-lg px-4 py-2 hover:bg-primary/90"
        >
          Tomar la foto ahora
        </button>
      ) : (
        <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 space-y-3">
          <p className="text-sm text-foreground">
            Guarda cómo está el POA hoy. Se usa para el reporte del trimestre.
          </p>
          <div>
            <label className="text-[10px] text-muted uppercase tracking-wider">
              Fecha del corte (vacío = hoy)
            </label>
            <input
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              className="w-full text-sm bg-background border border-border rounded px-3 py-2 mt-0.5"
            />
            <p className="text-[11px] text-muted mt-1">
              El cierre del trimestre en curso es el <strong>{finDeTrimestre}</strong>. Si ese
              día ya pasó y el proceso automático no la tomó, fechala ahí.
            </p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={tomar}
              disabled={isPending}
              className="text-sm bg-primary text-white rounded-lg px-4 py-2 hover:bg-primary/90 disabled:opacity-50"
            >
              {isPending ? "Tomando…" : "Tomar"}
            </button>
            <button
              onClick={() => { setAbierto(false); setError(null); }}
              disabled={isPending}
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

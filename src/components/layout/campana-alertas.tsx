"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { marcarAlertaLeida, marcarTodasLasAlertasLeidas } from "@/lib/actions";
import { formatFecha } from "@/lib/utils";
import type { AlertaConLectura, IndicadorPorVencer } from "@/types/database";

interface Props {
  /** Mensajes manuales vigentes que le llegaron al usuario. */
  alertas: AlertaConLectura[];
  /**
   * Indicadores del ámbito del usuario que están por vencer. No son filas de
   * ninguna tabla: se calculan al leer, así que no se marcan como leídas —
   * desaparecen cuando el indicador se carga. (26.08)
   */
  porVencer: IndicadorPorVencer[];
}

export function CampanaAlertas({ alertas, porVencer }: Props) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [verLeidos, setVerLeidos] = useState(false);
  const [isPending, startTransition] = useTransition();

  const sinLeer = alertas.filter((a) => !a.leida_at);
  const leidos = alertas.filter((a) => a.leida_at);
  const total = sinLeer.length + porVencer.length;

  // 09.09, párrafo 765: al marcar un aviso como leído tiene que DESAPARECER.
  // Antes se mostraban todos y los leídos quedaban en la lista con opacidad
  // reducida, así que el usuario tocaba el tilde y el aviso seguía ahí. Los
  // leídos no se borran: se guardan detrás de "Ver leídos".
  const visibles = verLeidos ? alertas : sinLeer;

  const marcarUna = (id: string) => {
    startTransition(async () => {
      await marcarAlertaLeida(id);
      router.refresh();
    });
  };

  const marcarTodas = () => {
    startTransition(async () => {
      await marcarTodasLasAlertasLeidas();
      router.refresh();
    });
  };

  return (
    <div className="relative">
      <button
        onClick={() => setAbierto((v) => !v)}
        title={total > 0 ? `${total} ${total === 1 ? "aviso" : "avisos"}` : "Sin avisos"}
        aria-label={total > 0 ? `${total} avisos sin leer` : "Sin avisos"}
        className="relative h-8 w-8 rounded-lg border border-border flex items-center justify-center text-muted hover:text-foreground hover:border-primary/30 transition-colors"
      >
        <span className="text-sm">◔</span>
        {total > 0 && (
          <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-1 rounded-full bg-danger text-white text-[9px] font-bold flex items-center justify-center">
            {total > 9 ? "9+" : total}
          </span>
        )}
      </button>

      {abierto && (
        <>
          {/* Capa para cerrar tocando afuera. */}
          <div className="fixed inset-0 z-40" onClick={() => setAbierto(false)} />

          <div className="absolute right-0 mt-2 w-[min(92vw,22rem)] max-h-[70vh] overflow-y-auto z-50 rounded-xl border border-border bg-surface shadow-xl">
            <div className="sticky top-0 flex items-center justify-between gap-2 px-4 py-3 border-b border-border bg-surface">
              <p className="text-xs font-semibold text-foreground uppercase tracking-wider">
                Avisos
              </p>
              {sinLeer.length > 0 && (
                <button
                  onClick={marcarTodas}
                  disabled={isPending}
                  className="text-[10px] text-primary hover:text-primary-light disabled:opacity-50"
                >
                  Marcar todo como leído
                </button>
              )}
            </div>

            {visibles.length === 0 && porVencer.length === 0 && (
              <p className="px-4 py-6 text-xs text-muted text-center">
                {leidos.length > 0 && !verLeidos
                  ? "Estás al día. No te queda ningún aviso sin leer."
                  : "No tenés avisos."}
              </p>
            )}

            {/* Mensajes */}
            {visibles.map((a) => (
              <div
                key={a.id}
                className={`px-4 py-3 border-b border-border last:border-0 ${
                  a.leida_at ? "opacity-60" : ""
                }`}
              >
                <div className="flex items-start gap-2">
                  {!a.leida_at && (
                    <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-foreground">
                      {a.importante && <span className="text-warning mr-1">⚠️</span>}
                      {a.titulo}
                    </p>
                    <p className="text-xs text-muted mt-1 whitespace-pre-line break-words">
                      {a.cuerpo}
                    </p>
                    <p className="text-[10px] text-muted/70 mt-1.5">
                      {formatFecha(a.created_at)}
                      {a.creado_por_nombre ? ` · ${a.creado_por_nombre}` : ""}
                    </p>
                  </div>
                  {!a.leida_at && (
                    <button
                      onClick={() => marcarUna(a.id)}
                      disabled={isPending}
                      title="Marcar como leído"
                      className="text-muted hover:text-foreground text-xs disabled:opacity-50 shrink-0"
                    >
                      ✓
                    </button>
                  )}
                </div>
              </div>
            ))}

            {/* Indicadores por vencer */}
            {porVencer.length > 0 && (
              <>
                <p className="px-4 pt-3 pb-1 text-[10px] font-semibold text-muted uppercase tracking-wider">
                  Indicadores por vencer
                </p>
                {porVencer.map((i) => (
                  <Link
                    key={i.indicador_id}
                    href={`/indicadores/${i.indicador_id}`}
                    onClick={() => setAbierto(false)}
                    className="block px-4 py-3 border-b border-border last:border-0 hover:bg-surface-hover"
                  >
                    <p className="text-xs font-semibold text-foreground">
                      <span className="mr-1">⏳</span>
                      {i.indicador_nombre}
                    </p>
                    <p className="text-[10px] text-muted mt-1">
                      {i.proyecto_nombre}
                      {i.unidad_nombre ? ` · ${i.unidad_nombre}` : ""}
                    </p>
                    <p className="text-[10px] mt-1">
                      <span className={i.dias_restantes <= 3 ? "text-danger" : "text-warning"}>
                        {i.dias_restantes === 0
                          ? "Vence hoy"
                          : i.dias_restantes === 1
                          ? "Vence mañana"
                          : `Vence en ${i.dias_restantes} días`}
                      </span>
                      <span className="text-muted">
                        {" "}· {i.avance != null ? `${Math.round(i.avance)}% cargado` : "sin datos"}
                      </span>
                    </p>
                  </Link>
                ))}
              </>
            )}

            {leidos.length > 0 && (
              <button
                onClick={() => setVerLeidos((v) => !v)}
                className="w-full px-4 py-2.5 border-t border-border text-[10px] text-muted hover:text-foreground hover:bg-surface-hover transition-colors text-center"
              >
                {verLeidos
                  ? "Ocultar los leídos"
                  : `Ver leídos (${leidos.length})`}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

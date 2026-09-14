"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { confirmarImputacionesEnLote, rechazarImputacion } from "@/lib/actions-plan-rector";
import { colorAmbito, type PropuestaPendiente } from "@/lib/plan-rector-comun";

interface Grupo {
  eje_id: string;
  eje_nombre: string;
  eje_codigo: string | null;
  ambito_codigo: string | null;
  ambito_nombre: string;
  propuestas: PropuestaPendiente[];
}

/**
 * Revisión en lote de las imputaciones propuestas.
 *
 * Agrupado por eje y no por proyecto a propósito: leer 441 proyectos sueltos es
 * imposible, pero mirar "estos 23 van al eje de arbolado, ¿sí o no?" se resuelve
 * de un vistazo. El trabajo pasa de 441 decisiones a 17 revisiones.
 *
 * Cada fila se puede destildar antes de confirmar el grupo: la propuesta es
 * eso, una propuesta, y la persona que confirma es la que sabe.
 */
export function RevisionLote({ grupos }: { grupos: Grupo[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [excluidos, setExcluidos] = useState<Set<string>>(new Set());
  const [abierto, setAbierto] = useState<string | null>(grupos[0]?.eje_id ?? null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const alternar = (id: string) =>
    setExcluidos((prev) => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id);
      else s.add(id);
      return s;
    });

  const confirmarGrupo = (g: Grupo) => {
    const ids = g.propuestas.map((p) => p.vinculo_id).filter((id) => !excluidos.has(id));
    if (ids.length === 0) {
      setError("No queda ninguna tildada en este eje.");
      return;
    }
    setError(null);
    setAviso(null);
    startTransition(async () => {
      const r = await confirmarImputacionesEnLote({ vinculo_ids: ids });
      if (!r.success) {
        setError(r.error ?? "No se pudo confirmar");
        return;
      }
      setAviso(
        `Listo: ${r.confirmados} ${r.confirmados === 1 ? "proyecto asociado" : "proyectos asociados"} al eje ${g.eje_codigo ?? ""}.` +
          (r.fallidos.length > 0 ? ` ${r.fallidos.length} no se pudieron y quedan acá.` : "")
      );
      router.refresh();
    });
  };

  const descartar = (p: PropuestaPendiente) => {
    setError(null);
    setAviso(null);
    startTransition(async () => {
      const r = await rechazarImputacion({
        vinculo_id: p.vinculo_id,
        motivo: "Descartada en la revisión por lote",
      });
      if (!r.success) setError(r.error ?? "No se pudo descartar");
      else router.refresh();
    });
  };

  if (grupos.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-surface p-8 text-center">
        <p className="text-sm text-muted">
          No hay propuestas esperando revisión.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {aviso && (
        <p className="text-xs text-success border border-success/30 bg-success/5 rounded-lg px-3 py-2">
          {aviso}
        </p>
      )}
      {error && (
        <p className="text-xs text-danger border border-danger/30 bg-danger/5 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      {grupos.map((g) => {
        const color = colorAmbito(g.ambito_codigo);
        const tildadas = g.propuestas.filter((p) => !excluidos.has(p.vinculo_id)).length;
        const esteAbierto = abierto === g.eje_id;

        return (
          <section key={g.eje_id} className="rounded-xl border border-border bg-surface overflow-hidden">
            <button
              onClick={() => setAbierto(esteAbierto ? null : g.eje_id)}
              className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-surface-hover transition-colors"
            >
              <span className="text-muted text-[10px] w-2.5 shrink-0">{esteAbierto ? "▾" : "▸"}</span>
              <span
                className="text-[11px] font-bold rounded px-1.5 py-0.5 shrink-0 text-white"
                style={{ backgroundColor: color ?? undefined }}
                title={g.ambito_nombre}
              >
                {g.ambito_codigo}
              </span>
              <span className="text-[11px] font-bold shrink-0 tabular-nums" style={{ color: color ?? undefined }}>
                {g.eje_codigo}.
              </span>
              <span className="flex-1 min-w-0 text-sm text-foreground line-clamp-1">{g.eje_nombre}</span>
              <span className="text-xs text-muted shrink-0 tabular-nums">
                {g.propuestas.length} {g.propuestas.length === 1 ? "proyecto" : "proyectos"}
              </span>
            </button>

            {esteAbierto && (
              <div className="border-t border-border">
                <ul className="divide-y divide-border/60">
                  {g.propuestas.map((p) => {
                    const excluido = excluidos.has(p.vinculo_id);
                    return (
                      <li
                        key={p.vinculo_id}
                        className={`flex items-start gap-3 px-4 py-2.5 ${excluido ? "opacity-45" : ""}`}
                      >
                        <input
                          type="checkbox"
                          checked={!excluido}
                          onChange={() => alternar(p.vinculo_id)}
                          className="mt-1 shrink-0"
                          aria-label={`Asociar ${p.proyecto_nombre} a este eje`}
                        />
                        <div className="min-w-0 flex-1">
                          <Link
                            href={`/proyectos/${p.proyecto_id}`}
                            target="_blank"
                            className="text-sm text-foreground hover:text-primary"
                          >
                            {p.proyecto_nombre}
                          </Link>
                          <p className="text-[11px] text-muted mt-0.5">
                            {p.area ?? "—"}
                            {p.justificacion ? ` · ${p.justificacion}` : ""}
                          </p>
                        </div>
                        <button
                          onClick={() => descartar(p)}
                          disabled={isPending}
                          title="Este proyecto no va al Plan Rector"
                          className="text-[10px] text-muted hover:text-danger shrink-0 disabled:opacity-50"
                        >
                          descartar
                        </button>
                      </li>
                    );
                  })}
                </ul>

                <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-border bg-border/10">
                  <p className="text-[11px] text-muted">
                    Destildá las que no correspondan antes de confirmar.
                  </p>
                  <button
                    onClick={() => confirmarGrupo(g)}
                    disabled={isPending || tildadas === 0}
                    className="text-sm bg-primary text-white rounded-lg px-4 py-2 hover:bg-primary/90 disabled:opacity-50 shrink-0"
                  >
                    {isPending
                      ? "Asociando…"
                      : `Asociar ${tildadas} ${tildadas === 1 ? "proyecto" : "proyectos"} a este eje`}
                  </button>
                </div>
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { TextoPoa, TipoTextoPoa } from "@/lib/poa-2027";
import { agregarTextoPoa, borrarTextoPoa, moverTextoPoa } from "@/lib/actions-poa-texto";
import { CampoEditable } from "./campo-editable";

/**
 * Las introducciones o el banco de ideas de un área, dentro del documento —
 * 08.10.
 *
 * "Algunas POAs tienen introducciones porque son necesarias antes de los
 * proyectos [...] los bancos de ideas que van al final de cada dirección. Eso
 * tiene casi el mismo formato que los proyectos pero deberíamos poder
 * editarlas."
 *
 * Se ven como en el libro: la introducción con su título y su texto, y cada
 * idea como "Proyecto: título" bajo el rótulo "Banco de ideas". Se editan igual
 * que las fichas, con un clic sobre el texto. Los botones de agregar, mover y
 * quitar no se imprimen.
 *
 * Una introducción o una idea vacía no aparece en la versión de solo lectura
 * ni en el Word: es una que alguien agregó y todavía no escribió.
 */
export function TextosDelArea({
  unidadId,
  tipo,
  textos,
  editable,
  conRotulo = true,
}: {
  unidadId: string;
  tipo: TipoTextoPoa;
  textos: TextoPoa[];
  editable: boolean;
  /** El rótulo "Banco de ideas" del documento. Fuera si la pantalla ya lo tiene. */
  conRotulo?: boolean;
}) {
  const router = useRouter();
  const [pendiente, empezar] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [aQuitar, setAQuitar] = useState<string | null>(null);

  const visibles = editable ? textos : textos.filter((t) => t.titulo?.trim() || t.texto?.trim());
  if (!editable && visibles.length === 0) return null;

  const correr = (accion: () => Promise<{ success: boolean; error?: string }>) => {
    setError(null);
    empezar(async () => {
      const r = await accion();
      if (!r.success) setError(r.error ?? "No se pudo guardar");
      setAQuitar(null);
      router.refresh();
    });
  };

  const esIdea = tipo === "idea";

  return (
    <div className="space-y-4">
      {esIdea && conRotulo && visibles.length > 0 && (
        <h3 className="text-sm font-bold text-foreground pt-2">Banco de ideas</h3>
      )}

      {visibles.map((t, i) => (
        <div key={t.id} className="space-y-1.5 group">
          <div className="flex items-start gap-2">
            <h4 className="text-sm font-bold text-foreground flex-1 min-w-0">
              {esIdea && "Proyecto: "}
              <CampoEditable
                id={t.id}
                de="texto"
                campo="titulo"
                valor={t.titulo}
                editable={editable}
                placeholder={esIdea ? "Nombre de la idea" : "Título (si lleva)"}
                className="font-bold"
              />
            </h4>
            {editable && (
              <span className="no-imprimir flex items-center gap-1 shrink-0 text-[11px] text-muted">
                {aQuitar === t.id ? (
                  <>
                    <span>¿Quitar{esIdea ? " esta idea" : " esta introducción"}?</span>
                    <button
                      onClick={() => correr(() => borrarTextoPoa(t.id))}
                      disabled={pendiente}
                      className="text-danger hover:underline disabled:opacity-50"
                    >
                      Sí
                    </button>
                    <button onClick={() => setAQuitar(null)} className="hover:text-foreground">
                      No
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => correr(() => moverTextoPoa(t.id, "arriba"))}
                      disabled={pendiente || i === 0}
                      aria-label="Subir"
                      title="Subir"
                      className="px-1 hover:text-foreground disabled:opacity-30"
                    >
                      ↑
                    </button>
                    <button
                      onClick={() => correr(() => moverTextoPoa(t.id, "abajo"))}
                      disabled={pendiente || i === visibles.length - 1}
                      aria-label="Bajar"
                      title="Bajar"
                      className="px-1 hover:text-foreground disabled:opacity-30"
                    >
                      ↓
                    </button>
                    <button
                      onClick={() => setAQuitar(t.id)}
                      disabled={pendiente}
                      className="px-1 hover:text-danger"
                    >
                      Quitar
                    </button>
                  </>
                )}
              </span>
            )}
          </div>
          <p className="text-sm text-foreground/90 leading-relaxed">
            <CampoEditable
              id={t.id}
              de="texto"
              campo="texto"
              valor={t.texto}
              editable={editable}
              placeholder="Hacé clic para escribir"
              className="whitespace-pre-wrap"
            />
          </p>
        </div>
      ))}

      {editable && (
        <div className="no-imprimir">
          <button
            onClick={() => correr(() => agregarTextoPoa(unidadId, tipo))}
            disabled={pendiente}
            className="text-xs text-primary border border-dashed border-primary/40 rounded-lg px-3 py-1.5 hover:bg-primary/5 disabled:opacity-50"
          >
            {pendiente
              ? "Guardando…"
              : esIdea
                ? "+ Agregar una idea al banco de ideas"
                : "+ Agregar una introducción"}
          </button>
          {error && <p className="text-[11px] text-danger mt-1">{error}</p>}
        </div>
      )}
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";

/**
 * Botón "Instructivo" — 16.11: "En POA 2027 y en Proyectos Prioritarios
 * agregaremos un botón que diga instructivo, que se vea antes de comenzar la
 * carga."
 *
 * Los pasos son los de las guías rápidas de carga de Planificación
 * Estratégica, con los nombres de los botones tal como están en PlanIA (la
 * guía del POA dice "Va a la POA 2027" y el botón dice "Va al POA 2027").
 */

type Paso = { titulo: string; texto: string; opcional?: boolean; nota?: string };

const GUIAS: Record<"poa" | "prioritarios", { titulo: string; pasos: Paso[] }> = {
  poa: {
    titulo: "POA 2027 · Guía rápida de carga",
    pasos: [
      { titulo: "Ingresá al módulo POA 2027", texto: "Desde la barra general de la izquierda." },
      {
        titulo: "Releé tus proyectos 2026",
        texto:
          "En “Editar mi POA”, tocá “Traer mis proyectos del POA 2026”. Si continúan en 2027, editalos; si no, descartalos según corresponda.",
      },
      {
        titulo: "Presioná “Va al POA 2027”",
        texto: "En cada proyecto que sigue, para que quede incluido en el plan.",
      },
      {
        titulo: "Cargá un proyecto nuevo",
        texto: "Si hace falta, con “+ Cargar un proyecto nuevo”.",
        opcional: true,
      },
      {
        titulo: "Finalizá la carga",
        texto: "El documento completo de tu área se ve en POA 2027, la pantalla principal del módulo.",
      },
    ],
  },
  prioritarios: {
    titulo: "Proyectos prioritarios · Guía rápida de carga",
    pasos: [
      {
        titulo: "Ingresá al módulo Proyectos prioritarios",
        texto: "Desde la barra general de la izquierda, o con el botón “Proyectos prioritarios” dentro de POA 2027.",
      },
      {
        titulo: "Verificá si hay proyectos cargados",
        texto: "Y, si hace falta, corregilos o tocá “+ Generar proyecto prioritario”.",
      },
      {
        titulo: "Completá la ficha",
        texto: "Con la información solicitada. Cada dato se guarda al salir del campo.",
        nota: "Si el historial 2024–2026 está habilitado, no se debe completar: lo carga de forma automática la Gerencia de Datos.",
      },
      {
        titulo: "Finalizá la carga",
        texto:
          "Con “Finalizar carga” al pie de la ficha, o con “Ver ficha” arriba a la derecha, ves la ficha completa.",
      },
    ],
  },
};

export function BotonInstructivo({ guia }: { guia: "poa" | "prioritarios" }) {
  const [abierto, setAbierto] = useState(false);
  const { titulo, pasos } = GUIAS[guia];

  useEffect(() => {
    if (!abierto) return;
    const teclas = (e: KeyboardEvent) => e.key === "Escape" && setAbierto(false);
    window.addEventListener("keydown", teclas);
    return () => window.removeEventListener("keydown", teclas);
  }, [abierto]);

  let numero = 0;
  return (
    <>
      <button
        onClick={() => setAbierto(true)}
        className="no-imprimir shrink-0 text-sm border border-primary/30 text-primary rounded-lg px-4 py-2 hover:bg-primary/10"
      >
        Instructivo
      </button>
      {abierto && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setAbierto(false)}
          role="dialog"
          aria-modal="true"
          aria-label={titulo}
        >
          <div
            className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl border border-border bg-surface shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 flex items-start justify-between gap-3 border-b border-border bg-surface px-5 py-4">
              <div>
                <p className="text-[11px] text-primary uppercase tracking-wider">PlanIA</p>
                <h2 className="text-base font-bold text-foreground">{titulo}</h2>
              </div>
              <button
                onClick={() => setAbierto(false)}
                aria-label="Cerrar el instructivo"
                className="h-8 w-8 shrink-0 rounded-lg border border-border text-muted hover:text-foreground"
              >
                ✕
              </button>
            </div>
            <ol className="space-y-3 px-5 py-4">
              {pasos.map((p) => {
                if (!p.opcional) numero++;
                return (
                  <li key={p.titulo} className="flex gap-3 rounded-xl border border-border bg-background/50 p-3">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-white">
                      {p.opcional ? "+" : numero}
                    </span>
                    <div className="min-w-0 space-y-1">
                      <p className="text-sm font-semibold text-foreground">
                        {p.opcional && <span className="font-normal text-muted">(Opcional) </span>}
                        {p.titulo}
                      </p>
                      <p className="text-xs text-muted">{p.texto}</p>
                      {p.nota && (
                        <p className="rounded-lg border border-primary/30 bg-primary/5 px-2.5 py-1.5 text-[11px] text-foreground/90">
                          ⓘ {p.nota}
                        </p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
            <p className="border-t border-border px-5 py-3 text-[11px] text-muted">
              Ante cualquier consulta, comunicate con la Dirección de Planificación Estratégica por los canales
              habituales.
            </p>
          </div>
        </div>
      )}
    </>
  );
}

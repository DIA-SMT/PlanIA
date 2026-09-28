"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { editarCampoFicha } from "@/lib/actions-ficha";

/**
 * Un campo del documento que se edita en el lugar — 28.09.
 *
 * Se ve como texto del documento. Al hacer clic se convierte en un cuadro de
 * texto, y al salir guarda. Sin botón de "editar" y sin botón de "guardar":
 * cualquiera de los dos convierte el previsualizador en un formulario, que es
 * justamente lo que no se quería.
 *
 * Guarda al salir del campo y no mientras se escribe: escribir una frase son
 * cuarenta pulsaciones y no hacen falta cuarenta guardados. Con Escape se
 * cancela y con Ctrl+Enter se guarda sin tener que salir.
 */
export function CampoEditable({
  fichaId,
  campo,
  valor,
  editable,
  placeholder = "—",
  className = "",
}: {
  fichaId: string;
  campo: string;
  valor: string | null;
  /** false para las fichas de otras áreas: se muestran y no se tocan. */
  editable: boolean;
  placeholder?: string;
  className?: string;
}) {
  const router = useRouter();
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState(valor ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pendiente, startTransition] = useTransition();
  const ref = useRef<HTMLTextAreaElement>(null);

  // El valor puede cambiar desde el servidor —otra persona editó, o se refrescó
  // la página— y el estado local tiene que seguirlo cuando no se está editando.
  //
  // Se ajusta durante el render y no en un efecto: hacerlo en un efecto pinta
  // una vez con el valor viejo y otra con el nuevo, y React avisa por eso.
  const [valorVisto, setValorVisto] = useState(valor);
  if (!editando && valor !== valorVisto) {
    setValorVisto(valor);
    setTexto(valor ?? "");
  }

  // El cuadro crece con el texto: un campo de descripción de diez renglones no
  // se lee dentro de una sola línea.
  useEffect(() => {
    if (editando && ref.current) {
      ref.current.style.height = "auto";
      ref.current.style.height = `${ref.current.scrollHeight}px`;
    }
  }, [editando, texto]);

  const guardar = () => {
    if (texto === (valor ?? "")) {
      setEditando(false);
      return;
    }
    setError(null);
    startTransition(async () => {
      const r = await editarCampoFicha(fichaId, campo, texto);
      if (!r.success) {
        setError(r.error ?? "No se pudo guardar");
        return;
      }
      setEditando(false);
      router.refresh();
    });
  };

  if (!editable) {
    return <span className={className}>{valor?.trim() || placeholder}</span>;
  }

  if (!editando) {
    return (
      <span
        role="button"
        tabIndex={0}
        onClick={() => setEditando(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setEditando(true);
          }
        }}
        title="Hacé clic para editar"
        className={`${className} cursor-text rounded px-0.5 -mx-0.5 hover:bg-primary/10 ${
          valor?.trim() ? "" : "text-muted/60 italic"
        }`}
      >
        {valor?.trim() || placeholder}
      </span>
    );
  }

  return (
    <span className="block">
      <textarea
        ref={ref}
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        onBlur={guardar}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setTexto(valor ?? "");
            setEditando(false);
          }
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) guardar();
        }}
        disabled={pendiente}
        autoFocus
        rows={1}
        className={`${className} w-full bg-background border border-primary/40 rounded px-2 py-1 resize-none disabled:opacity-50`}
      />
      <span className="block text-[10px] text-muted/70 mt-0.5">
        {pendiente ? "Guardando…" : "Se guarda al salir del campo · Escape para cancelar"}
      </span>
      {error && <span className="block text-[11px] text-danger">{error}</span>}
    </span>
  );
}

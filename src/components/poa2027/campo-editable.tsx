"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { editarCampoFicha } from "@/lib/actions-ficha";
import { editarCampoTextoPoa } from "@/lib/actions-poa-texto";
import { partirEnItems, conRenglones, conMayusculas } from "@/lib/items-texto";
import { TextoConItems } from "@/components/ui/texto-con-items";

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
 *
 * Sirve para las fichas y, desde el 08.10, para las introducciones y el banco
 * de ideas del área (`de="texto"`): se editan igual, en el documento mismo.
 */
export function CampoEditable({
  id,
  de = "ficha",
  campo,
  valor,
  editable,
  placeholder = "—",
  className = "",
}: {
  id: string;
  /** De qué tabla es el campo: una ficha o un texto del POA (introducción o idea). */
  de?: "ficha" | "texto";
  campo: string;
  valor: string | null;
  /** false para las fichas de otras áreas: se muestran y no se tocan. */
  editable: boolean;
  placeholder?: string;
  className?: string;
}) {
  const router = useRouter();
  const [editando, setEditando] = useState(false);
  // 05.10: al editar, cada ítem va en su renglón —el texto vino de los libros con
  // las viñetas en el medio del párrafo—. Es lo que abre el cuadro, y también
  // contra lo que se compara para saber si hubo cambios: si se comparara contra
  // el original, con solo hacer clic y salir se reescribiría la ficha.
  const inicial = conMayusculas(conRenglones(valor ?? ""));
  const [texto, setTexto] = useState(inicial);
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
    setTexto(conMayusculas(conRenglones(valor ?? "")));
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
    if (texto === inicial) {
      setEditando(false);
      return;
    }
    setError(null);
    startTransition(async () => {
      const r =
        de === "texto"
          ? await editarCampoTextoPoa(id, campo, texto)
          : await editarCampoFicha(id, campo, texto);
      if (!r.success) {
        setError(r.error ?? "No se pudo guardar");
        return;
      }
      setEditando(false);
      router.refresh();
    });
  };

  const bloque = partirEnItems(valor) ? "block" : "";

  if (!editable) {
    return (
      <span className={`${className} ${bloque}`}>
        <TextoConItems texto={valor} placeholder={placeholder} />
      </span>
    );
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
        className={`${className} ${bloque} cursor-text rounded px-0.5 -mx-0.5 hover:bg-primary/10 ${
          valor?.trim() ? "" : "text-muted/60 italic"
        }`}
      >
        <TextoConItems texto={valor} placeholder={placeholder} />
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
            setTexto(inicial);
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

import { partirEnItems, conMayusculas } from "@/lib/items-texto";

/**
 * Un texto del POA con sus ítems uno debajo del otro — 05.10.
 *
 * Si el texto no trae al menos dos viñetas, se muestra tal cual. Si las trae, la
 * introducción va arriba y cada ítem en su renglón, con su viñeta.
 *
 * Todo con `span` y no con `ul`/`li`: lo usa el campo editable, que es un
 * `span` clickeable dentro de una línea de texto, y una lista dentro de un
 * `span` no es HTML válido. Los ítems se ven como lista igual.
 */
export function TextoConItems({
  texto,
  placeholder = "—",
}: {
  texto: string | null | undefined;
  placeholder?: string;
}) {
  // 05.10: "todo debe estar iniciado con Mayúscula". Se corrige al mostrar, el
  // campo y cada ítem; lo guardado no se toca.
  const corregido = texto ? conMayusculas(texto) : texto;
  const p = partirEnItems(corregido);
  if (!p) return <>{corregido?.trim() || placeholder}</>;
  return (
    <>
      {p.intro && <span className="block">{p.intro}</span>}
      {p.items.map((item, i) => (
        <span key={i} className={`flex gap-2 ${p.intro || i > 0 ? "mt-1.5" : ""}`}>
          <span aria-hidden="true" className="shrink-0 select-none">
            ●
          </span>
          <span className="min-w-0">{item}</span>
        </span>
      ))}
    </>
  );
}

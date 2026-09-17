/**
 * La ficha del proyecto tal como está escrita en el libro del POA.
 *
 * 17.09: "el POA es un libro que cada secretaría tiene […] dentro de cada libro
 * están las planificaciones de direcciones". Los libros traen, por proyecto, una
 * descripción larga, la línea de base, la meta anual, el hito y a veces el
 * responsable. El sistema tenía los nombres y los números; esto es el porqué.
 *
 * Se guardan en `proyecto.metadata.libro_poa` y no en columnas nuevas: son el
 * texto del documento, no datos que el sistema calcule o actualice. La
 * descripción y las fechas sí van a sus columnas, porque el sistema las usa.
 *
 * Si el proyecto no tiene ficha cargada, este bloque no aparece.
 */

export interface FichaDelLibro {
  linea_base?: string | null;
  meta?: string | null;
  hito?: string | null;
  responsable?: string | null;
  periodo?: string | null;
  direccion?: string | null;
  libro?: string | null;
}

/** Saca la ficha de la metadata del proyecto, si está. */
export function fichaDelLibro(metadata: unknown): FichaDelLibro | null {
  if (!metadata || typeof metadata !== "object") return null;
  const f = (metadata as Record<string, unknown>).libro_poa;
  if (!f || typeof f !== "object") return null;
  const ficha = f as FichaDelLibro;
  const hayTexto = [ficha.linea_base, ficha.meta, ficha.hito, ficha.responsable].some(
    (v) => typeof v === "string" && v.trim() !== ""
  );
  return hayTexto ? ficha : null;
}

export function FichaDelLibroPOA({
  ficha,
  descripcion,
}: {
  ficha: FichaDelLibro;
  descripcion: string | null;
}) {
  const filas = [
    { rotulo: "Línea de base", valor: ficha.linea_base },
    { rotulo: "Meta anual", valor: ficha.meta },
    { rotulo: "Hito", valor: ficha.hito },
    { rotulo: "Responsable", valor: ficha.responsable },
  ].filter((f) => typeof f.valor === "string" && f.valor.trim() !== "");

  return (
    <section className="rounded-xl border border-border bg-surface p-6 space-y-4">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <h2 className="text-base font-semibold text-foreground">Ficha del POA</h2>
        <p className="text-[10px] text-muted/70 uppercase tracking-wider">
          Del libro de la secretaría
        </p>
      </div>

      {descripcion && (
        <div className="space-y-1">
          <p className="text-[11px] text-muted uppercase tracking-wider">Descripción y objetivo</p>
          <p className="text-sm text-foreground/90 leading-relaxed">{descripcion}</p>
        </div>
      )}

      {filas.map((f) => (
        <div key={f.rotulo} className="space-y-1">
          <p className="text-[11px] text-muted uppercase tracking-wider">{f.rotulo}</p>
          <p className="text-sm text-foreground/90 leading-relaxed">{f.valor}</p>
        </div>
      ))}

      {(ficha.periodo || ficha.direccion) && (
        <p className="text-[10px] text-muted/70 border-t border-border pt-3">
          {ficha.direccion ? `${ficha.direccion}. ` : ""}
          {ficha.periodo ? `Período de trabajo: ${ficha.periodo}` : ""}
        </p>
      )}
    </section>
  );
}

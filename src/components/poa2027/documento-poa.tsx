import type { AreaDelPoa } from "@/lib/poa-2027";
import type { Observacion } from "@/lib/poa-2027";
import { CampoEditable } from "./campo-editable";
import { ObservarFicha, ResolverObservacion } from "./circuito-acciones";

/**
 * El POA 2027 como se va a ver el documento — 28.09.
 *
 * "Sería piola que se vea el pdf que se va a mandar y poder editar ahí en el
 * previsualizador."
 *
 * Es el documento, no un formulario: se lee de corrido, con la tabla PRISMA de
 * cada ficha agrupada por área. Los campos de las fichas PROPIAS se editan
 * haciendo clic encima; las de otras áreas se muestran y no se tocan, porque
 * "la secretaría no puede corregir, pero puede hacer observaciones" (25.09).
 *
 * Las filas son las seis letras de PRISMA. La S de "Secretaría" no se edita
 * acá: sale del organigrama, que es de donde tiene que salir.
 */

/**
 * Los párrafos de cada proyecto, con los nombres del POA real.
 *
 * 28.09: "fijate que el formato en el que aparecen los proyectos no son fichas,
 * están como redactados". Medido sobre los 366 proyectos de los ocho libros de
 * 2026, cada uno se lee así: título, descripción y objetivo, período de trabajo,
 * línea de base y meta. Las letras de PRISMA quedaron atrás — son la misma
 * información con otro nombre.
 */
const PARRAFOS = [
  { rotulo: "Descripción y objetivo", campo: "relevancia" as const },
  { rotulo: "Período de trabajo", campo: "periodo" as const },
  { rotulo: "Hito", campo: "hito" as const },
  { rotulo: "Línea de base", campo: "ancla" as const },
  { rotulo: "Meta", campo: "meta_anual" as const },
  { rotulo: "Indicador", campo: "indicador" as const },
];

export function DocumentoPoa({
  propia,
  recibidas,
  anio,
  observaciones = [],
  puedeObservar = false,
}: {
  propia: AreaDelPoa;
  recibidas: AreaDelPoa[];
  anio: number;
  observaciones?: Observacion[];
  /** Deja observar las fichas de las areas de abajo. No las propias. */
  puedeObservar?: boolean;
}) {
  // El área propia primero y después las de abajo, que es el orden del
  // documento: la secretaría abre con lo suyo.
  const bloques = [
    { area: propia, editable: true },
    ...recibidas.map((a) => ({ area: a, editable: false })),
  ].filter((b) => b.area.fichas.length > 0);

  const total = bloques.reduce((a, b) => a + b.area.fichas.length, 0);

  if (total === 0) {
    return (
      <div className="hoja rounded-xl border border-border bg-surface p-8 text-center">
        <p className="text-sm text-muted">
          Todavía no hay ninguna ficha cargada, ni tuya ni de las áreas que dependen de{" "}
          {propia.nombre}.
        </p>
      </div>
    );
  }

  return (
    <article className="hoja space-y-8">
      <header className="space-y-1 border-b border-border pb-4">
        <h1 className="text-xl font-bold text-foreground uppercase">
          Plan Operativo Anual {anio}
        </h1>
        <p className="text-sm font-semibold text-primary">{propia.nombre}</p>
        <p className="text-[11px] text-muted">
          Municipalidad de San Miguel de Tucumán · {total}{" "}
          {total === 1 ? "ficha" : "fichas"} en {bloques.length}{" "}
          {bloques.length === 1 ? "área" : "áreas"}
        </p>
      </header>

      {bloques.map(({ area, editable }) => (
        <section key={area.id} className="space-y-4">
          <div className="flex items-baseline justify-between gap-3 flex-wrap border-b border-border pb-1">
            <h2 className="text-base font-bold text-foreground">{area.nombre}</h2>
            {!editable && (
              <span className="text-[10px] text-muted uppercase tracking-wider no-imprimir">
                {area.enviado ? "enviado" : "sin enviar"} · solo lectura
              </span>
            )}
          </div>

          {area.fichas.map((f, i) => (
            <div key={f.id} className="space-y-2">
              <h3 className="text-sm font-bold text-foreground">
                Proyecto {i + 1}:{" "}
                <CampoEditable
                  fichaId={f.id}
                  campo="programa"
                  valor={f.programa}
                  editable={editable}
                  placeholder="Nombre del proyecto"
                  className="font-bold"
                />
              </h3>

              {PARRAFOS.map((parrafo) => {
                const valor = f[parrafo.campo] ?? null;
                // Un párrafo vacío no se dibuja, salvo que se pueda completar:
                // en el POA de 2026 solo 1 de cada 6 proyectos tiene hito, y
                // poner "Hito: —" en los otros cinco ensucia el documento.
                if (!valor?.trim() && !editable) return null;
                return (
                  <p key={parrafo.campo} className="text-sm text-foreground/90 leading-relaxed">
                    <span className="font-semibold">{parrafo.rotulo}:</span>{" "}
                    <CampoEditable
                      fichaId={f.id}
                      campo={parrafo.campo}
                      valor={valor}
                      editable={editable}
                      placeholder="Hacé clic para completar"
                      className="whitespace-pre-wrap"
                    />
                  </p>
                );
              })}
              {/* Las observaciones cuelgan de la ficha, en el documento mismo:
                  quien revisa no tiene que irse a otra pantalla para decir que
                  algo hay que mirarlo. No se imprimen: son de trabajo interno,
                  el documento que se manda no las lleva. */}
              <Observaciones
                fichaId={f.id}
                observaciones={observaciones.filter((o) => o.ficha_id === f.id && !o.resuelta_at)}
                puedeObservar={puedeObservar && !editable}
              />
            </div>
          ))}
        </section>
      ))}
    </article>
  );
}

/**
 * Las observaciones de una ficha, dentro del documento.
 *
 * Solo se puede observar una ficha AJENA: sobre la propia no tiene sentido
 * —se corrige y listo— y ademas el area duena es la que las tiene que leer.
 */
function Observaciones({
  fichaId,
  observaciones,
  puedeObservar,
}: {
  fichaId: string;
  observaciones: Observacion[];
  puedeObservar: boolean;
}) {
  if (observaciones.length === 0 && !puedeObservar) return null;
  return (
    <div className="no-imprimir space-y-1 pl-3 border-l-2 border-warning/30">
      {observaciones.map((o) => (
        <div key={o.id} className="flex items-start gap-2">
          <p className="text-[11px] text-foreground/80 flex-1">
            {o.texto}
            <span className="text-muted/70">
              {" "}
              — {o.autor_email ?? "alguien"}, {new Date(o.created_at).toLocaleDateString("es-AR")}
            </span>
          </p>
          <ResolverObservacion id={o.id} />
        </div>
      ))}
      {puedeObservar && <ObservarFicha fichaId={fichaId} cuantas={observaciones.length} />}
    </div>
  );
}

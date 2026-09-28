import Link from "next/link";
import { redirect } from "next/navigation";
import { getPerfilActual } from "@/lib/auth";
import { getMisFichas, ANIO_POA } from "@/lib/poa-2027";
import { CampoEditable } from "@/components/poa2027/campo-editable";
import { TraerDe2026, AceptarFicha } from "@/components/poa2027/propuestas-acciones";
import { BackButton } from "@/components/layout/back-button";

export const revalidate = 0;

/**
 * Editar mi POA — 28.09.
 *
 * Antes esta pantalla era "Mis fichas" y listaba las fichas PRISMA cargadas a
 * mano. Ahora es donde el área arma su parte del POA: trae sus proyectos del
 * 2026, los completa y acepta los que van al 2027.
 *
 * "No podemos hacer que se reconozcan automáticamente mis proyectos y en la
 * parte mis fichas yo lo termine de completar con la info y acepte para que vaya
 * a mi poa?"
 *
 * Los campos llevan los nombres del POA y no las letras de PRISMA, que es lo que
 * el director ya conoce de redactarlo en Word y lo que después va a leer en el
 * documento.
 */

const CAMPOS = [
  { rotulo: "Descripción y objetivo", campo: "relevancia" as const, largo: true },
  { rotulo: "Período de trabajo", campo: "periodo" as const, largo: false },
  { rotulo: "Línea de base", campo: "ancla" as const, largo: true },
  { rotulo: "Meta", campo: "meta_anual" as const, largo: true },
  { rotulo: "Indicador", campo: "indicador" as const, largo: false },
  { rotulo: "Hito", campo: "hito" as const, largo: false },
];

export default async function EditarMiPoaPage() {
  const perfil = await getPerfilActual();
  if (!perfil) redirect("/login");

  if (!perfil.unidad_id) {
    return (
      <div className="space-y-6 max-w-3xl">
        <BackButton fallback="/poa-2027" />
        <p className="text-sm text-muted">
          Tu perfil no tiene un área asignada, así que no hay un POA que editar.
        </p>
      </div>
    );
  }

  let fichas: Awaited<ReturnType<typeof getMisFichas>> = [];
  let error: string | null = null;
  try {
    fichas = await getMisFichas(perfil.unidad_id);
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  const propuestas = fichas.filter((f) => f.estado === "propuesta");
  const aceptadas = fichas.filter((f) => f.estado === "aceptada");

  return (
    <div className="space-y-6 max-w-4xl">
      <BackButton fallback="/poa-2027" />

      <div>
        <h1 className="text-2xl font-bold text-foreground">Editar mi POA {ANIO_POA}</h1>
        <p className="text-sm text-muted mt-1">
          Acá armás tu parte. Lo que aceptes es lo que va a aparecer en el documento de tu
          secretaría.
        </p>
      </div>

      {error ? (
        <div className="rounded-xl border border-danger/30 bg-danger/5 p-4">
          <p className="text-sm font-semibold text-danger">No se pudieron leer tus fichas</p>
          <p className="text-xs text-muted mt-1 font-mono break-all">{error}</p>
          <p className="text-xs text-muted mt-2">
            Si habla de una columna que no existe, falta aplicar la migración 054.
          </p>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-start gap-3">
            <TraerDe2026 unidadId={perfil.unidad_id} hayPropuestas={propuestas.length > 0} />
            <Link
              href="/poa-2027/cargar"
              className="text-sm bg-primary/10 text-primary border border-primary/30 rounded-lg px-4 py-2 hover:bg-primary/20"
            >
              + Cargar un proyecto nuevo
            </Link>
          </div>

          {fichas.length === 0 && (
            <div className="rounded-xl border border-border bg-surface p-6 text-center space-y-1">
              <p className="text-sm text-foreground">Todavía no armaste tu POA {ANIO_POA}.</p>
              <p className="text-xs text-muted">
                Traé tus proyectos del POA 2026 con el botón de arriba: vienen con lo que ya
                sabemos de cada uno y los completás desde acá. O cargá uno nuevo de cero.
              </p>
            </div>
          )}

          {propuestas.length > 0 && (
            <section className="space-y-3">
              <div>
                <h2 className="text-sm font-bold text-foreground">
                  Para revisar ({propuestas.length})
                </h2>
                <p className="text-xs text-muted mt-0.5">
                  Salieron de tus proyectos del POA 2026. Completá lo que falte y aceptá los que
                  siguen el año que viene. Los que no acepten, no entran.
                </p>
              </div>
              {propuestas.map((f) => (
                <Ficha key={f.id} ficha={f} />
              ))}
            </section>
          )}

          {aceptadas.length > 0 && (
            <section className="space-y-3">
              <div>
                <h2 className="text-sm font-bold text-foreground">
                  En mi POA {ANIO_POA} ({aceptadas.length})
                </h2>
                <p className="text-xs text-muted mt-0.5">
                  Estos son los que aparecen en el documento. Se pueden seguir editando.
                </p>
              </div>
              {aceptadas.map((f) => (
                <Ficha key={f.id} ficha={f} />
              ))}
            </section>
          )}
        </>
      )}
    </div>
  );
}

function Ficha({ ficha }: { ficha: Awaited<ReturnType<typeof getMisFichas>>[number] }) {
  const aceptada = ficha.estado === "aceptada";
  // Lo que falta completar, para poder decirlo sin que haya que leer todo.
  const vacios = CAMPOS.filter((c) => !ficha[c.campo]?.trim()).length;

  return (
    <article
      className={`rounded-xl border bg-surface p-4 space-y-2 ${
        aceptada ? "border-border" : "border-warning/30"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-foreground">
            <CampoEditable
              fichaId={ficha.id}
              campo="programa"
              valor={ficha.programa}
              editable
              placeholder="Nombre del proyecto"
              className="font-bold"
            />
          </h3>
          <p className="text-[11px] text-muted mt-0.5">
            {ficha.proyecto_origen_id ? "Viene del POA 2026" : "Cargado a mano"}
            {vacios > 0 && ` · le faltan ${vacios} ${vacios === 1 ? "dato" : "datos"}`}
          </p>
        </div>
        <AceptarFicha id={ficha.id} aceptada={aceptada} />
      </div>

      <dl className="space-y-1.5">
        {CAMPOS.map((c) => (
          <div key={c.campo}>
            <dt className="text-[11px] text-muted uppercase tracking-wider">{c.rotulo}</dt>
            <dd className="text-sm text-foreground/90">
              <CampoEditable
                fichaId={ficha.id}
                campo={c.campo}
                valor={ficha[c.campo] ?? null}
                editable
                placeholder="Hacé clic para completar"
                className="whitespace-pre-wrap"
              />
            </dd>
          </div>
        ))}
      </dl>
    </article>
  );
}

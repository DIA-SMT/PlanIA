import Link from "next/link";
import { redirect } from "next/navigation";
import { getPerfilActual, puedeCargarArea } from "@/lib/auth";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getMisFichas, getTextosPoa, ANIO_POA } from "@/lib/poa-2027";
import { CampoEditable } from "@/components/poa2027/campo-editable";
import { TextosDelArea } from "@/components/poa2027/textos-del-area";
import { TraerDe2026, AceptarFicha, NuevoProyectoPoa } from "@/components/poa2027/propuestas-acciones";
import { BackButton } from "@/components/layout/back-button";
import { getAreaPrioritarios } from "@/lib/proyectos-prioritarios";

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

export default async function EditarMiPoaPage({
  searchParams,
}: {
  searchParams: Promise<{ unidad?: string }>;
}) {
  const perfil = await getPerfilActual();
  if (!perfil) redirect("/login");
  const params = await searchParams;

  // 05.10: "la idea es que ustedes carguen y nosotros editamos". Planificación
  // Estratégica no tiene área propia, así que edita la que elija desde la tabla
  // de todas las áreas del POA 2027.
  //
  // 03.11: "los secretarios (de todas las direcciones) y la dirección de
  // planificación deben poder cargar proyectos en la POA 2027 [...], ahora solo
  // pueden los directores de cada área". Ahora cualquiera que pueda cargar un
  // área (puedeCargarArea: Planificación todas, una secretaría su árbol) la
  // abre por parámetro. Si no puede, el parámetro se ignora y manda su área:
  // si no, cualquiera abriría el POA de otra área escribiendo la URL.
  const esPlanificacion = perfil.rol === "admin_funcional";
  const otraArea =
    params.unidad && params.unidad !== perfil.unidad_id && (await puedeCargarArea(perfil, params.unidad))
      ? params.unidad
      : null;
  const unidadId = otraArea ?? (esPlanificacion ? null : perfil.unidad_id);

  let nombreArea: string | null = null;
  if (otraArea) {
    const sb = await getSupabaseServer();
    const { data } = await sb
      .from("unidad_organizacional")
      .select("nombre, nombre_corto")
      .eq("id", otraArea)
      .single();
    nombreArea = (data as { nombre: string } | null)?.nombre ?? null;
  }

  if (esPlanificacion && !nombreArea) {
    return (
      <div className="space-y-6 max-w-3xl">
        <BackButton fallback="/poa-2027" />
        <p className="text-sm text-muted">
          Elegí un área desde la tabla de{" "}
          <Link href="/poa-2027" className="text-primary hover:underline">
            todas las áreas del POA {ANIO_POA}
          </Link>{" "}
          para ver y editar sus fichas.
        </p>
      </div>
    );
  }

  if (!unidadId) {
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
    fichas = await getMisFichas(unidadId);
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }
  // 08.10: lo que el POA del área lleva además de los proyectos.
  const textos = await getTextosPoa([unidadId]);
  const introducciones = textos.filter((t) => t.tipo === "introduccion");
  const ideas = textos.filter((t) => t.tipo === "idea");

  const conPrioritarios = (await getAreaPrioritarios(unidadId))?.habilitada ?? false;

  const propuestas = fichas.filter((f) => f.estado === "propuesta");
  const aceptadas = fichas.filter((f) => f.estado === "aceptada");

  return (
    <div className="space-y-6 max-w-4xl">
      <BackButton fallback="/poa-2027" />

      <div>
        <h1 className="text-2xl font-bold text-foreground">
          {otraArea ? `POA ${ANIO_POA} · ${nombreArea}` : `Editar mi POA ${ANIO_POA}`}
        </h1>
        <p className="text-sm text-muted mt-1">
          {otraArea
            ? "Lo que aceptes acá es lo que va a aparecer en el documento de esta área."
            : "Acá armás tu parte. Lo que aceptes es lo que va a aparecer en el documento de tu secretaría."}
        </p>
        {otraArea && (
          <p className="text-[11px] text-primary border border-primary/30 bg-primary/5 rounded-lg px-3 py-2 mt-3">
            {esPlanificacion
              ? "Estás editando el POA de esta área como Planificación Estratégica."
              : "Estás editando el POA de un área a tu cargo."}{" "}
            Lo que cambies o aceptes lo ve el área, igual que si lo hubiera hecho ella.
          </p>
        )}
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
            <TraerDe2026 unidadId={unidadId} hayPropuestas={propuestas.length > 0} />
            {/* 03.11: "esa ficha ya no se utiliza". Cargar un proyecto nuevo ya no
                abre el formulario PRISMA: agrega una ficha vacía con el formato de
                las de abajo, en el área que se está editando (también desde
                Planificación o desde la secretaría). */}
            <NuevoProyectoPoa unidadId={unidadId} />
            {/* Planificación no tiene área propia, así que el Word del POA 2027
                no tenía cómo bajar el de un área: ahora sale de acá (08.10). */}
            {esPlanificacion && (
              <a
                href={`/api/poa-2027/exportar?unidad=${unidadId}`}
                className="text-sm border border-border rounded-lg px-4 py-2 hover:bg-surface-hover"
              >
                Descargar Word de esta área
              </a>
            )}
            {/* 28.10: solo las áreas de la lista tienen proyectos prioritarios. */}
            {conPrioritarios && (
              <Link
                href={`/poa-2027/prioritarios?unidad=${unidadId}`}
                className="text-sm font-semibold bg-primary/10 text-primary border border-primary/30 rounded-lg px-4 py-2 hover:bg-primary/20"
              >
                Proyectos prioritarios
              </Link>
            )}
          </div>

          <section className="rounded-xl border border-border bg-surface p-4 space-y-3">
            <div>
              <h2 className="text-sm font-bold text-foreground">Introducción</h2>
              <p className="text-xs text-muted mt-0.5">
                Lo que va en el documento antes de los proyectos: el marco general del área, notas
                metodológicas, la descripción de un programa. Cada una con su título.
              </p>
            </div>
            <TextosDelArea
              unidadId={unidadId}
              tipo="introduccion"
              textos={introducciones}
              editable
            />
          </section>

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

          <section className="rounded-xl border border-border bg-surface p-4 space-y-3">
            <div>
              <h2 className="text-sm font-bold text-foreground">Banco de ideas</h2>
              <p className="text-xs text-muted mt-0.5">
                Va al final del documento del área: iniciativas sujetas a aprobación que no son
                proyectos de este POA.
              </p>
            </div>
            <TextosDelArea unidadId={unidadId} tipo="idea" textos={ideas} editable conRotulo={false} />
          </section>
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
              id={ficha.id}
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
                id={ficha.id}
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

import Link from "next/link";
import { redirect } from "next/navigation";
import { getPerfilActual, getScopeUnidades } from "@/lib/auth";
import { ANIO_POA } from "@/lib/poa-2027";
import {
  getAreaPrioritarios,
  getPrioritariosDelArea,
  getResumenPrioritarios,
  getAreasParaAgregar,
  getAreasPrioritariosACargo,
  puedeEditarPrioritarios,
  getProyectosDelArea,
} from "@/lib/proyectos-prioritarios";
import { numeroArg } from "@/lib/proyectos-prioritarios-comun";
import { NuevoPrioritario } from "@/components/poa2027/prioritarios-acciones";
import { AreasPrioritarias } from "@/components/poa2027/areas-prioritarias";
import { BackButton } from "@/components/layout/back-button";
import { BotonInstructivo } from "@/components/poa2027/instructivo";

export const revalidate = 0;

/**
 * Proyectos prioritarios del área — corrección del 28.10.
 *
 * "Las direcciones que sí están en la lista deben tener la ficha poa 2027 tal
 * cual está ahora y además el botón nuevo para generar los proyectos
 * prioritarios y poder visualizarlos." El botón está en Editar mi POA; acá se
 * listan las fichas del área y se genera una nueva.
 *
 * El área se elige igual que en Editar mi POA: por parámetro, entre las que el
 * perfil puede cargar (03.11); sin parámetro, la suya.
 */
export default async function ProyectosPrioritariosPage({
  searchParams,
}: {
  searchParams: Promise<{ unidad?: string }>;
}) {
  const perfil = await getPerfilActual();
  if (!perfil) redirect("/login");
  const params = await searchParams;

  const esPlanificacion = perfil.rol === "admin_funcional";
  // 03.11: además de Planificación, una secretaría (o subsecretaría, o
  // coordinación) carga los prioritarios de sus direcciones de la lista. Puede
  // entrar a cualquiera de ellas por parámetro; sin parámetro, si tiene más de
  // una, las ve juntas.
  const aCargo = await getAreasPrioritariosACargo(perfil);
  let unidadId: string | null = params.unidad ?? null;
  if (unidadId && !aCargo.includes(unidadId) && !(await getScopeUnidades(perfil)).includes(unidadId)) {
    unidadId = null;
  }
  const verTodas =
    !unidadId && (esPlanificacion || aCargo.length > 1 || (aCargo.length === 1 && aCargo[0] !== perfil.unidad_id));
  if (!unidadId && !verTodas) unidadId = perfil.unidad_id;

  // 30.10: Planificación no tiene área, así que sin una elegida no veía nada
  // ("no puedo ver los prioritarios desde nuestro usuario"). Ve todas las
  // áreas juntas, con cuántas fichas cargó cada una, y entra a la que quiera.
  if (verTodas) {
    const areas = (await getResumenPrioritarios()).filter((a) => aCargo.includes(a.id));
    const total = areas.reduce((s, a) => s + a.fichas, 0);
    // 11.11: Planificación agrega y quita áreas de la lista desde acá.
    const paraAgregar = esPlanificacion ? await getAreasParaAgregar() : [];
    return (
      <div className="space-y-6 max-w-4xl">
        <div className="flex items-center justify-between gap-3">
          <BackButton fallback="/poa-2027" />
          {/* 16.11: el instructivo, antes de comenzar la carga. */}
          <BotonInstructivo guia="prioritarios" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Proyectos prioritarios · POA {ANIO_POA}</h1>
          <p className="text-sm text-muted mt-1">
            {esPlanificacion
              ? `Las ${areas.length} áreas con proyectos prioritarios.`
              : `Las áreas a tu cargo con proyectos prioritarios (${areas.length}).`}{" "}
            {total === 0
              ? "Todavía ninguna cargó una ficha."
              : `Hay ${total} ${total === 1 ? "ficha cargada" : "fichas cargadas"}.`}{" "}
            Entrá a un área para ver sus fichas o generar una.
          </p>
        </div>
        <AreasPrioritarias
          areas={areas.map(({ id, nombre, fichas }) => ({ id, nombre, fichas }))}
          esPlanificacion={esPlanificacion}
          paraAgregar={paraAgregar}
        />
      </div>
    );
  }

  const area = unidadId ? await getAreaPrioritarios(unidadId) : null;
  const volver =
    esPlanificacion || aCargo.length > 1 || (area && area.id !== perfil.unidad_id)
      ? "/poa-2027/prioritarios"
      : "/poa-2027/mis-fichas";

  if (!area || !area.habilitada) {
    return (
      <div className="space-y-6 max-w-3xl">
        <BackButton fallback={volver} />
        <p className="text-sm text-muted">
          {area
            ? `${area.nombre} no tiene proyectos prioritarios: su POA ${ANIO_POA} sigue con la ficha de siempre.`
            : "No hay un área elegida."}
        </p>
      </div>
    );
  }

  const editable = await puedeEditarPrioritarios(perfil, area.id);

  let fichas: Awaited<ReturnType<typeof getPrioritariosDelArea>> = [];
  let error: string | null = null;
  try {
    fichas = await getPrioritariosDelArea(area.id);
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }
  const proyectos = editable && !error ? await getProyectosDelArea(area.id) : [];

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between gap-3">
        <BackButton fallback={volver} />
        <BotonInstructivo guia="prioritarios" />
      </div>

      <div>
        <h1 className="text-2xl font-bold text-foreground">Proyectos prioritarios · {area.nombre}</h1>
        <p className="text-sm text-muted mt-1">
          POA {ANIO_POA}. Cada proyecto prioritario lleva su ficha de formulación y seguimiento,
          además de la ficha de la POA {ANIO_POA} del área.
        </p>
      </div>

      {error ? (
        <div className="rounded-xl border border-danger/30 bg-danger/5 p-4">
          <p className="text-sm font-semibold text-danger">No se pudieron leer los proyectos prioritarios</p>
          <p className="text-xs text-muted mt-1 font-mono break-all">{error}</p>
          <p className="text-xs text-muted mt-2">
            Si dice que no existe la tabla, falta aplicar la migración 059.
          </p>
        </div>
      ) : (
        <>
          {editable && <NuevoPrioritario unidadId={area.id} proyectos={proyectos} />}

          {fichas.length === 0 ? (
            <div className="rounded-xl border border-border bg-surface p-6 text-center">
              <p className="text-sm text-muted">
                {editable
                  ? "Todavía no hay proyectos prioritarios. Generá el primero con el botón de arriba."
                  : "Esta área todavía no cargó proyectos prioritarios."}
              </p>
            </div>
          ) : (
            <ul className="space-y-2">
              {fichas.map((f) => (
                <li key={f.id}>
                  <Link
                    href={`/poa-2027/prioritarios/${f.id}`}
                    className="block rounded-xl border border-border bg-surface p-4 hover:bg-surface-hover"
                  >
                    <p className="text-sm font-bold text-foreground">{f.nombre}</p>
                    <p className="text-[11px] text-muted mt-0.5">
                      {f.meta_anual !== null
                        ? `Meta ${ANIO_POA}: ${numeroArg(f.meta_anual)} ${f.unidad_medida ?? ""}`
                        : `Sin meta ${ANIO_POA} todavía`}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

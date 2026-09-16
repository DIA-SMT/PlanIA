import { getPeriodoActivo } from "@/lib/queries";
import { getPerfilActual } from "@/lib/auth";
import { getPlanRectorArbol, getCoberturaPlanRector } from "@/lib/plan-rector";
import { NodoRector } from "@/components/plan-rector/nodo-rector";
import { BackButton } from "@/components/layout/back-button";
import { EmptyState } from "@/components/ui/empty-state";
import Link from "next/link";

export const revalidate = 0;

/**
 * Quién entra al Plan Rector — 09.09, párrafo 715: "solo para Intendenta,
 * Secretarios y Subsecretarios".
 *
 * Va acá y no solo en el menú: esconder un link no es un permiso, la URL sigue
 * andando. Los dos roles de administración entran porque son los que mantienen
 * la herramienta (Planificación es la que imputa los proyectos al plan); el
 * pedido apuntaba al menú del director.
 */
const ROLES_PLAN_RECTOR = [
  "intendenta",
  "secretario",
  "subsecretario",
  "admin_funcional",
  "admin_tecnico",
];

/**
 * Plan Rector — etapa 2: el árbol, en solo lectura.
 *
 * Todavía NO muestra porcentajes de cumplimiento. No es un olvido: el cálculo
 * espera tres definiciones del cliente (si un proyecto puede colgar de varios
 * ejes, si "sin vínculo" es una respuesta válida, y a qué nivel del plan hace
 * falta el vínculo). Mostrar un número antes de eso sería mostrar un número que
 * después cambia. Ver PLAN_RECTOR.md.
 *
 * Lo que sí se muestra es la COBERTURA: cuántos proyectos del POA ya están
 * imputados. Es el dato que importa mientras se clasifica.
 */
export default async function PlanRectorPage() {
  const perfil = await getPerfilActual();
  if (!perfil || !ROLES_PLAN_RECTOR.includes(perfil.rol)) {
    return (
      <div className="space-y-6 max-w-3xl">
        <BackButton fallback="/dashboard" />
        <EmptyState
          title="El Plan Rector no está disponible para tu perfil"
          description="Lo consultan la Intendenta, las Secretarías y las Subsecretarías. Si necesitás ver el avance de tu área, usá Avance por Dirección o el Reporte trimestral."
          icon="◇"
        />
      </div>
    );
  }

  const periodo = await getPeriodoActivo();
  const [{ arbol, totalNodos }, cobertura] = await Promise.all([
    getPlanRectorArbol(),
    getCoberturaPlanRector(periodo.id),
  ]);

  if (totalNodos === 0) {
    return (
      <div className="space-y-6 max-w-5xl">
        <BackButton fallback="/dashboard" />
        <div>
          <h1 className="text-2xl font-bold text-foreground">Plan Rector</h1>
        </div>
        <EmptyState
          title="La jerarquía del Plan Rector no está cargada"
          description="Se carga con: npx tsx supabase/import/500_import_plan_rector.ts"
          icon="◈"
        />
      </div>
    );
  }

  const esPlanificacion = perfil.rol === "admin_funcional" || perfil.rol === "admin_tecnico";
  const anioPeriodo = periodo.anio ?? new Date(periodo.fecha_inicio).getUTCFullYear();

  /**
   * 15.09, párrafo 1018: "no tiene sentido que esté el A1 si ellos hoy no tienen
   * nada en el A1. La propuesta es que el sistema muestre los ámbitos donde hay
   * proyectos nada más."
   *
   * La pantalla ya se acota por usuario —lo hace la RLS sobre `proyecto`, por eso
   * una secretaría ve su propio total— pero igual listaba los cinco ámbitos, con
   * "sin imputar" en los que no le tocan.
   *
   * A Planificación se le siguen mostrando todos: es la única que puede detectar
   * un ámbito del plan sin ningún proyecto que lo ejecute, y esconderlo le
   * taparía justo el dato que necesita.
   */
  const arbolVisible = esPlanificacion
    ? arbol
    : arbol.filter((a) => a.imputadosSubarbol > 0);

  const ejes = arbolVisible.reduce((a, x) => a + x.hijos.length, 0);
  const lineas = arbolVisible.reduce(
    (a, x) => a + x.hijos.reduce((b, e) => b + e.hijos.reduce((c, o) => c + o.hijos.length, 0), 0),
    0
  );

  return (
    <div className="space-y-6 max-w-5xl">
      <BackButton fallback="/dashboard" />

      {/* 15.09, párrafo 1013: "el Plan Rector es hasta el 2030 [...] Nosotros
          estamos evaluando únicamente el avance del PR en relación a la POA
          2026." El año va en el título, que se lee antes que cualquier número. */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">
          Plan Rector — avance del POA {anioPeriodo}
        </h1>
        <p className="text-sm text-muted mt-1">
          Ámbitos de intervención → ejes estratégicos → objetivos → líneas ·{" "}
          {arbolVisible.length} {arbolVisible.length === 1 ? "ámbito" : "ámbitos"}, {ejes} ejes,{" "}
          {lineas} líneas
        </p>
      </div>

      {/* 15.09, párrafo 1015: "este panel que contiene los 339/441 debería verlo
          únicamente planificación [...] y el resto de las dependencias leer un
          texto [...] y nosotros ver ambas infos". Planificación ve el panel Y el
          texto de abajo; el resto, solo el texto. */}
      {esPlanificacion && (
      <section className="rounded-xl border border-border bg-surface p-4 space-y-3">
        <div className="flex items-baseline justify-between gap-3 flex-wrap">
          <div>
            <p className="text-[10px] text-muted uppercase tracking-wider">
              Proyectos del POA imputados al Plan Rector
            </p>
            <p className="text-2xl font-bold text-foreground tabular-nums">
              {cobertura.imputados + cobertura.excluidos}
              <span className="text-base text-muted font-normal"> / {cobertura.activos}</span>
            </p>
          </div>
          <p className="text-lg font-bold text-foreground tabular-nums">{cobertura.pct}%</p>
        </div>

        <div className="h-2 rounded-full bg-border/30 overflow-hidden">
          <div
            className="h-full bg-primary transition-all"
            style={{ width: `${Math.max(cobertura.pct, cobertura.pct > 0 ? 2 : 0)}%` }}
          />
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted">
          <span>{cobertura.imputados} imputados</span>
          <span>{cobertura.excluidos} declarados fuera del plan</span>
          <span className="font-medium text-foreground">{cobertura.pendientes} sin clasificar</span>
          {/* 11.09: la pantalla de revisión en lote. Solo Planificación confirma,
              así que solo ella la ve ofrecida — la página lo valida igual. */}
          {perfil.rol === "admin_funcional" && cobertura.pendientes > 0 && (
            <Link
              href="/plan-rector/imputar"
              className="text-primary hover:underline font-medium"
            >
              Asociar proyectos →
            </Link>
          )}
        </div>

      </section>
      )}

      {/* La aclaración metodológica la ven TODOS, sea o no Planificación
          (15.09, párrafo 1015: "el resto de las dependencias leer un texto que
          hable sobre lo que escribí en el punto anterior"). El punto anterior es
          el 1013: que lo que se mide es el avance del POA, no el del Plan Rector
          hasta 2030. */}
      <section className="rounded-xl border border-border bg-surface p-4">
        <p className="text-xs text-muted/80 leading-relaxed">
          <strong className="text-foreground">Cómo leer estos números.</strong> El Plan
          Rector se extiende hasta <strong>2030</strong>, y lo que se mide acá es otra cosa:
          cuánto avanzaron durante <strong>{anioPeriodo}</strong> los proyectos del POA que
          fueron imputados a cada ámbito. Un ámbito al 60 % no quiere decir que el Plan
          Rector esté al 60 % de acá a 2030, sino que los proyectos que este año trabajan
          sobre ese ámbito van por ahí.
          {" "}El promedio se calcula igual que en el Panel Ejecutivo, así que las dos
          pantallas dicen lo mismo. Los proyectos sin datos cargados no cuentan como cero:
          quedan afuera del promedio. Las líneas estratégicas se muestran completas pero no
          se miden por separado.
          {esPlanificacion && cobertura.pct < 60 && (
            <>
              {" "}
              <strong className="text-warning">
                Ojo con la cobertura: hoy está imputado el {cobertura.pct} % del POA
              </strong>
              , así que estos promedios hablan de esa fracción y no de todo el plan.
            </>
          )}
        </p>
      </section>

      {/* El árbol */}
      <div className="rounded-xl border border-border bg-surface overflow-hidden">
        <ul>
          {arbolVisible.map((a) => (
            <NodoRector key={a.id} nodo={a} />
          ))}
        </ul>
      </div>

      <p className="text-[11px] text-muted/70 leading-relaxed">
        El texto de cada nodo es el del documento oficial del Plan Rector, sin
        correcciones. Los ODS figuran a nivel de eje porque así vienen en el documento.
        Para imputar un proyecto, entrá a{" "}
        <Link href="/proyectos" className="text-primary hover:underline">
          Proyectos
        </Link>{" "}
        y abrí su ficha.
      </p>
    </div>
  );
}

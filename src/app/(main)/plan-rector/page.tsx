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

  const ejes = arbol.reduce((a, x) => a + x.hijos.length, 0);
  const lineas = arbol.reduce(
    (a, x) => a + x.hijos.reduce((b, e) => b + e.hijos.reduce((c, o) => c + o.hijos.length, 0), 0),
    0
  );

  return (
    <div className="space-y-6 max-w-5xl">
      <BackButton fallback="/dashboard" />

      <div>
        <h1 className="text-2xl font-bold text-foreground">Plan Rector</h1>
        <p className="text-sm text-muted mt-1">
          Ámbitos de intervención → ejes estratégicos → objetivos → líneas · {arbol.length} ámbitos,{" "}
          {ejes} ejes, {lineas} líneas
        </p>
      </div>

      {/* Cobertura: el número que importa mientras se clasifica. */}
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

        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted">
          <span>{cobertura.imputados} imputados</span>
          <span>{cobertura.excluidos} declarados fuera del plan</span>
          <span className="font-medium text-foreground">{cobertura.pendientes} sin clasificar</span>
        </div>

        {/* 09.09, párrafo 703: la aclaración metodológica de que se trabaja con
            información de 2026. Va en la pantalla y no solo en el reporte,
            porque es acá donde se leen los porcentajes. */}
        <p className="text-xs text-muted/80 leading-relaxed border-t border-border pt-3">
          <strong className="text-foreground">Cómo leer estos números.</strong> El avance de
          cada ámbito es el promedio de los proyectos del <strong>POA 2026</strong> que le
          fueron imputados — la misma cuenta que usa el Panel Ejecutivo, así que los dos
          dicen lo mismo. Los proyectos sin datos cargados no cuentan como cero: quedan
          afuera del promedio. Las líneas estratégicas se muestran completas pero no se
          miden por separado.
          {cobertura.pct < 60 && (
            <>
              {" "}
              <strong className="text-warning">
                Ojo con la cobertura: hoy está imputado el {cobertura.pct} % del POA
              </strong>
              , así que estos promedios hablan de esa fracción y no de todo el plan. La
              imputación se carga desde la ficha de cada proyecto.
            </>
          )}
        </p>
      </section>

      {/* El árbol */}
      <div className="rounded-xl border border-border bg-surface overflow-hidden">
        <ul>
          {arbol.map((a) => (
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

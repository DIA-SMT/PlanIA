import Link from "next/link";
import { getPerfilActual } from "@/lib/auth";
import { getPropuestasPendientes, getCoberturaPlanRector } from "@/lib/plan-rector";
import { getPeriodoActivo } from "@/lib/queries";
import { RevisionLote } from "@/components/plan-rector/revision-lote";
import { BackButton } from "@/components/layout/back-button";
import { EmptyState } from "@/components/ui/empty-state";

export const revalidate = 0;

/**
 * Revisión en lote de las imputaciones al Plan Rector.
 *
 * 11.09, Planificación: "faltaría asociar los proyectos a los ejes del plan
 * rector. Los que se pueda. El resto lo hacemos a mano".
 *
 * Hasta acá la única forma de imputar era la ficha de cada proyecto, de a uno.
 * Con 441 proyectos eso no lo hace nadie, y por eso el Plan Rector mostraba
 * "sin datos" en los cinco ámbitos: 0 imputaciones confirmadas.
 *
 * Solo Planificación: es la que confirma, y así queda en `confirmarImputacion`.
 * Los directores siguen proponiendo desde la ficha de su proyecto.
 */
export default async function ImputarPage() {
  const perfil = await getPerfilActual();
  if (!perfil || perfil.rol !== "admin_funcional") {
    return (
      <div className="space-y-6 max-w-3xl">
        <BackButton fallback="/plan-rector" />
        <EmptyState
          title="Esta pantalla es de Planificación Estratégica"
          description="La confirmación de las imputaciones al Plan Rector la hace Planificación. Desde la ficha de tu proyecto podés proponer a qué eje corresponde."
          icon="◇"
        />
      </div>
    );
  }

  const periodo = await getPeriodoActivo();
  const [{ porEje, total, sinPropuesta }, cobertura] = await Promise.all([
    getPropuestasPendientes(),
    getCoberturaPlanRector(periodo.id),
  ]);

  return (
    <div className="space-y-6 max-w-5xl">
      <BackButton fallback="/plan-rector" />

      <div>
        <h1 className="text-2xl font-bold text-foreground">Asociar proyectos al Plan Rector</h1>
        <p className="text-sm text-muted mt-1">
          Revisá por eje y confirmá de a grupos. Cada proyecto confirmado empieza a contar en
          el porcentaje de su ámbito.
        </p>
      </div>

      <section className="rounded-xl border border-border bg-surface p-4">
        <div className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
          <div>
            <p className="text-[10px] text-muted uppercase tracking-wider">Ya asociados</p>
            <p className="text-xl font-bold text-foreground tabular-nums">
              {cobertura.imputados}
              <span className="text-sm text-muted font-normal"> / {cobertura.activos}</span>
            </p>
          </div>
          <div>
            <p className="text-[10px] text-muted uppercase tracking-wider">Esperando tu revisión</p>
            <p className="text-xl font-bold text-primary tabular-nums">{total}</p>
          </div>
          <div>
            <p className="text-[10px] text-muted uppercase tracking-wider">Sin propuesta</p>
            <p className="text-xl font-bold text-muted tabular-nums">{sinPropuesta}</p>
          </div>
        </div>
        {sinPropuesta > 0 && (
          <p className="text-[11px] text-muted/80 mt-3 border-t border-border pt-3 leading-relaxed">
            Los {sinPropuesta} sin propuesta son los que el sistema no pudo ubicar con
            confianza: nombres que no dicen qué hacen, o trabajo interno que puede no
            pertenecer al plan. Esos se resuelven desde la ficha de cada proyecto, que es donde
            se ve todo el detalle.
          </p>
        )}
      </section>

      <RevisionLote grupos={porEje} />

      <p className="text-[11px] text-muted/70">
        El árbol completo, con el avance de cada ámbito, está en{" "}
        <Link href="/plan-rector" className="text-primary hover:underline">
          Plan Rector
        </Link>
        .
      </p>
    </div>
  );
}

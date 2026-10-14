import { getPeriodoActivo } from "@/lib/queries";
import { getPerfilActual } from "@/lib/auth";
import { getPlanRectorArbol, getCoberturaPlanRector } from "@/lib/plan-rector";
import { aportesPorAmbito, type NodoRectorArbol, type ProyectoImputado } from "@/lib/plan-rector-comun";
import { NodoRector } from "@/components/plan-rector/nodo-rector";
import { TortaAportes } from "@/components/plan-rector/torta-aportes";
import { GaugeCumplimiento } from "@/components/ui/gauge-cumplimiento";
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
 * Plan Rector: el árbol con el avance de cada ámbito (desde el 09.09), la
 * cobertura de la imputación para Planificación y, desde el 13.10, el medidor
 * del Plan Rector con lo que aporta cada ámbito. La cuenta es avancePlanRector:
 * los sin datos y los no iniciados no entran en el promedio.
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

  // El medidor y la torta (13.10): cada proyecto una sola vez, con su ámbito.
  const delSubarbol = (n: NodoRectorArbol): ProyectoImputado[] => [
    ...n.proyectos,
    ...n.hijos.flatMap(delSubarbol),
  ];
  const contados = new Set<string>();
  const pr = aportesPorAmbito(
    arbolVisible.flatMap((a) =>
      delSubarbol(a)
        .filter((p) => !contados.has(p.id) && contados.add(p.id))
        .map((p) => ({ pct: p.pct, ambito: { codigo: a.codigo_cliente, nombre: a.nombre_corto ?? a.nombre } }))
    )
  );

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

      {/* 13.10: el medidor del Plan Rector, como el del Panel, y al lado cuánto
          aporta cada ámbito. "Vamos cumpliendo un 80 % y cada ámbito aporta x.
          Y nada más. No haría ningún tipo de desglose por ahora. Sí pondría el
          cómo se calcula." Lo ve todo el que entra, sobre los proyectos que ve:
          una secretaría, los suyos. */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 rounded-2xl border border-border bg-surface p-6 space-y-4">
          <div>
            <p className="text-sm font-semibold text-foreground uppercase tracking-wider">
              Cumplimiento del Plan Rector
            </p>
            <p className="text-xs text-muted mt-1">
              Avance registrado durante {anioPeriodo} por los proyectos del POA imputados al Plan
              Rector.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
            <GaugeCumplimiento value={pr.total.pct} label={`Avance ${anioPeriodo}`} />
            <div className="space-y-2">
              <p className="text-[11px] font-semibold text-muted uppercase tracking-wider">
                Aporte de cada ámbito
              </p>
              <TortaAportes ambitos={pr.ambitos} total={pr.total.pct} />
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-success/25 bg-surface p-5 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-success">
            ¿Cómo se calcula?
          </p>
          <p className="text-xs text-muted leading-relaxed">
            El medidor es el promedio del avance de los proyectos del POA imputados al Plan
            Rector que tienen avance registrado: hoy son{" "}
            <strong className="text-foreground tabular-nums">{pr.total.evaluables}</strong> de{" "}
            <span className="tabular-nums">{pr.total.total}</span>. Los{" "}
            <span className="tabular-nums">{pr.total.sinDatos}</span> sin datos cargados y los{" "}
            <span className="tabular-nums">{pr.total.noIniciados}</span> no iniciados no se
            contabilizan.
          </p>
          <p className="text-xs text-muted leading-relaxed">
            El aporte de cada ámbito es la parte de ese promedio que ponen sus proyectos: la suma
            de su avance dividida por los {pr.total.evaluables} proyectos que entran en la cuenta.
            Por eso los aportes suman el número del medidor.
          </p>
          <p className="text-xs text-muted/70 leading-relaxed">
            Puede no coincidir con el Panel Ejecutivo: el Panel mide todos los proyectos del POA,
            no solo los imputados, y cuenta los no iniciados como 0 %.
          </p>
        </div>
      </div>

      {/* 13.10: "La leyenda [...] por favor reemplazarla por la que escribiré en
          azul". Es el texto de Planificación, tal cual. La ven todos, sea o no
          Planificación (15.09, párrafo 1015). */}
      <section className="rounded-xl border border-border bg-surface p-4 space-y-2 text-xs text-muted leading-relaxed">
        <p className="font-semibold text-foreground">Alcance del indicador</p>
        <p>
          El Plan Rector establece una planificación estratégica con horizonte al{" "}
          <strong className="text-foreground">2030</strong>. El indicador que se presenta refleja
          exclusivamente el{" "}
          <strong className="text-foreground">
            grado de avance registrado durante {anioPeriodo} en los proyectos de la POA
            vinculados a cada ámbito estratégico
          </strong>
          .
        </p>
        <p>
          Por lo tanto, el porcentaje expresado para cada ámbito{" "}
          <strong className="text-foreground">
            no representa el grado de avance del Plan Rector hacia 2030
          </strong>
          , sino el nivel de avance alcanzado durante {anioPeriodo} por los proyectos que se
          desarrollan en ese ámbito.
        </p>
        <p>
          Para el cálculo del indicador se consideran únicamente los proyectos que cuentan con
          información de avance registrada. Los proyectos sin datos cargados y los no iniciados no
          se contabilizan en el promedio.
        </p>
        {esPlanificacion && cobertura.pct < 60 && (
          <p>
            <strong className="text-warning">
              Ojo con la cobertura: hoy está imputado el {cobertura.pct} % del POA
            </strong>
            , así que estos promedios hablan de esa fracción y no de todo el plan.
          </p>
        )}
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

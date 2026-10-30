import Link from "next/link";
import {
  HORIZONTE_PLAN_RECTOR,
  INICIO_GESTION,
  numeroArg,
  porcentajeArg,
  type ProyeccionPrioritario,
} from "@/lib/proyectos-prioritarios-comun";

/**
 * "Ver avance del proyecto" — corrección del 28.10, punto 3 del documento
 * "Plan Rector + POA 2027 - P. Prioritarios".
 *
 * "Junto a cada proyecto incorporar una opción «Ver avance del proyecto», que
 * despliega los tres puntos siguientes que deben ser calculados automáticamente
 * por PlanIA en función de la nueva ficha POA 2027". En el modelo son cuatro
 * cuadros numerados del 4 al 7, y "los números de cada ítem no se deben
 * considerar [...] la información que contiene sí la necesitamos": van sin
 * número. Las cuentas están en proyeccionPrioritario.
 */
export function AvancePrioritario({ p }: { p: ProyeccionPrioritario }) {
  const anio = p.anio;
  const u = (n: number | null) => (n === null ? null : `${numeroArg(n)}${p.unidad ? ` ${p.unidad}` : ""}`);
  const anios = `${anio - INICIO_GESTION + 1} de los ${HORIZONTE_PLAN_RECTOR - INICIO_GESTION} años del plan`;

  if (p.objetivo === null || p.objetivo === 0) {
    return (
      <Marco p={p}>
        <p className="text-xs text-muted">
          Falta la línea de base pendiente en la ficha del proyecto prioritario: es el objetivo al{" "}
          {HORIZONTE_PLAN_RECTOR} y sin ella no hay nada que proyectar.
        </p>
      </Marco>
    );
  }

  const pctCapacidad = p.capacidad === null ? null : (p.capacidad / p.objetivo) * 100;
  const alcanza = p.brecha !== null && p.brecha <= 0;

  return (
    <Marco p={p}>
      <Cuadro titulo="Proyección estratégica del Plan Rector">
        <p className="text-[11px] text-muted">Objetivo al horizonte {HORIZONTE_PLAN_RECTOR}</p>
        <p className="text-lg font-bold text-foreground">{u(p.objetivo)}</p>
        <p className="text-[11px] text-muted">Resolver la brecha identificada en la línea de base.</p>
        <div className="grid grid-cols-2 gap-3 pt-2">
          <Cifra rotulo={`Ejecutadas al cierre de ${anio - 1}`} valor={u(p.ejecutado)} />
          <Cifra rotulo="Pendientes" valor={u(p.pendientes)} />
        </div>
      </Cuadro>

      <Cuadro titulo={`Cumplimiento esperado del Plan Rector al cierre de ${anio}`}>
        <p className="text-[11px] text-muted">
          Distribución del objetivo total del Plan Rector entre la gestión y lo que queda hasta{" "}
          {HORIZONTE_PLAN_RECTOR}.
        </p>
        <div className="flex flex-col sm:flex-row items-center gap-5 pt-1">
          <Anillo fraccion={p.fraccion} />
          <div className="grid grid-cols-2 gap-4 flex-1 w-full">
            <Cifra
              rotulo={`Correspondería alcanzar hasta ${anio}`}
              valor={porcentajeArg(p.fraccion, 1)}
              detalle={`${numeroArg(p.objetivo2027)} de ${u(p.objetivo)}`}
              marca="bg-primary"
            />
            <Cifra
              rotulo={`Saldo posterior hasta ${HORIZONTE_PLAN_RECTOR}`}
              valor={porcentajeArg(1 - p.fraccion, 1)}
              detalle={`${numeroArg(p.saldo2030)} de ${u(p.objetivo)}`}
              marca="bg-primary/25"
            />
          </div>
        </div>
        <p className="text-[10px] text-muted/70 pt-1">
          Cálculo proporcional: {anios} ({INICIO_GESTION} a {HORIZONTE_PLAN_RECTOR}). Si el Plan
          Rector fija hitos específicos, se reemplaza por su cronograma.
        </p>
      </Cuadro>

      <Cuadro titulo="Comparación con la capacidad operativa">
        {p.capacidad === null || pctCapacidad === null ? (
          <p className="text-xs text-muted">
            {p.ejecutado === null
              ? `Sin datos disponibles: al historial de ejecución de la ficha le falta algún año entre ${INICIO_GESTION} y ${anio - 1}.`
              : `Falta la meta ${anio} en la ficha del proyecto prioritario.`}
          </p>
        ) : (
          <>
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[10px] text-muted uppercase tracking-wider border-b border-border">
                  <th className="text-left font-normal py-1">Concepto</th>
                  <th className="text-right font-normal py-1 capitalize">{p.unidad || "Cantidad"}</th>
                  <th className="text-right font-normal py-1">Porcentaje</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                <tr className="border-b border-border/50">
                  <td className="py-1.5">Objetivo de referencia al cierre de {anio}</td>
                  <td className="py-1.5 text-right">{numeroArg(p.objetivo2027)}</td>
                  <td className="py-1.5 text-right">{porcentajeArg(p.fraccion, 1)}</td>
                </tr>
                <tr className="border-b border-border/50">
                  <td className="py-1.5">Capacidad operativa estimada</td>
                  <td className="py-1.5 text-right">{numeroArg(p.capacidad)}</td>
                  <td className="py-1.5 text-right">{porcentajeArg(p.capacidad, p.objetivo)}</td>
                </tr>
                <tr>
                  <td className="py-1.5">Brecha entre ambos</td>
                  <td className="py-1.5 text-right">{numeroArg(Math.max(p.brecha ?? 0, 0))}</td>
                  <td className="py-1.5 text-right">
                    {Math.max(p.fraccion * 100 - pctCapacidad, 0).toLocaleString("es-AR", {
                      minimumFractionDigits: 1,
                      maximumFractionDigits: 1,
                    })}{" "}
                    puntos
                  </td>
                </tr>
              </tbody>
            </table>
            <p className="text-[10px] text-muted/70">
              Capacidad operativa: lo ejecutado de {INICIO_GESTION} a {anio - 1} más la meta {anio}.
            </p>
            <div
              className={`rounded-lg border p-3 space-y-1 ${
                alcanza ? "border-success/30 bg-success/5" : "border-warning/30 bg-warning/5"
              }`}
            >
              <p className="text-xs font-semibold text-foreground">Evaluación de factibilidad</p>
              {alcanza ? (
                <p className="text-xs text-muted">
                  La capacidad operativa estimada alcanza el objetivo de referencia del Plan Rector
                  al cierre de {anio}.
                </p>
              ) : (
                <p className="text-xs text-muted">
                  La capacidad operativa estimada no alcanzaría el objetivo de referencia del Plan
                  Rector. El área deberá fundamentar las limitaciones, los recursos adicionales
                  necesarios y la meta que puede comprometer al cierre de la gestión.
                </p>
              )}
            </div>
          </>
        )}
      </Cuadro>

      <Cuadro titulo={`Meta de gestión al cierre de ${anio}`}>
        <div className="grid grid-cols-2 gap-3">
          <Cifra
            rotulo="Meta acumulada de gestión"
            valor={u(p.capacidad)}
            detalle={`Desde ${INICIO_GESTION}`}
          />
          <Cifra
            rotulo="Brecha pendiente"
            valor={u(p.brechaPendiente)}
            detalle={`Al cierre de ${anio}`}
          />
        </div>
      </Cuadro>
    </Marco>
  );
}

function Marco({ p, children }: { p: ProyeccionPrioritario; children: React.ReactNode }) {
  return (
    <div className="mt-2 mb-3 rounded-xl border border-border bg-background/40 p-3 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[10px] font-semibold text-primary uppercase tracking-wider">
          Calculado por PlanIA con la ficha del proyecto prioritario
        </p>
        <Link href={`/poa-2027/prioritarios/${p.id}`} className="text-[11px] text-primary hover:underline shrink-0">
          Ver ficha →
        </Link>
      </div>
      {children}
    </div>
  );
}

function Cuadro({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-border bg-surface p-3 space-y-1.5">
      <h4 className="text-xs font-bold text-foreground">{titulo}</h4>
      {children}
    </section>
  );
}

function Cifra({
  rotulo,
  valor,
  detalle,
  marca,
}: {
  rotulo: string;
  valor: string | null;
  detalle?: string;
  marca?: string;
}) {
  return (
    <div>
      <p className="text-[11px] text-muted flex items-center gap-1.5">
        {marca && <span className={`h-2 w-2 rounded-full shrink-0 ${marca}`} />}
        {rotulo}
      </p>
      {valor === null ? (
        <p className="text-xs text-muted/70 italic">sin datos disponibles</p>
      ) : (
        <p className="text-lg font-bold text-foreground tabular-nums">{valor}</p>
      )}
      {detalle && valor !== null && <p className="text-[11px] text-muted">{detalle}</p>}
    </div>
  );
}

/** El anillo del modelo: la parte de la gestión y el saldo hasta el horizonte. */
function Anillo({ fraccion }: { fraccion: number }) {
  const tam = 120;
  const grosor = 22;
  const r = (tam - grosor) / 2;
  const c = 2 * Math.PI * r;
  return (
    <svg
      viewBox={`0 0 ${tam} ${tam}`}
      className="w-28 h-28 shrink-0"
      role="img"
      aria-label={`Objetivo hasta la gestión: ${porcentajeArg(fraccion, 1)} del total`}
    >
      <g transform={`rotate(-90 ${tam / 2} ${tam / 2})`}>
        <circle cx={tam / 2} cy={tam / 2} r={r} fill="none" strokeWidth={grosor} className="stroke-primary/25" />
        <circle
          cx={tam / 2}
          cy={tam / 2}
          r={r}
          fill="none"
          strokeWidth={grosor}
          className="stroke-primary"
          strokeDasharray={`${c * fraccion} ${c}`}
        />
      </g>
    </svg>
  );
}

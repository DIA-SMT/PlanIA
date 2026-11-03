import Link from "next/link";
import { redirect } from "next/navigation";
import { getPerfilActual } from "@/lib/auth";
import { getPeriodoActivo } from "@/lib/queries";
import { getAvancePorProyecto } from "@/lib/avance-proyectos";
import { getTodosLosPrioritarios } from "@/lib/proyectos-prioritarios";
import { numeroArg } from "@/lib/proyectos-prioritarios-comun";
import { promedioDeProyectos, type DistribucionEstados } from "@/lib/utils";
import { GaugeCumplimiento } from "@/components/ui/gauge-cumplimiento";
import { EstadoProyectos } from "@/components/dashboard/estado-proyectos";
import { StatusBadge } from "@/components/ui/status-badge";
import { ProgressBar } from "@/components/ui/progress-bar";
import { EmptyState } from "@/components/ui/empty-state";

export const revalidate = 0;

/**
 * Proyectos prioritarios 2027 — corrección del 30.10, puntos 1 y 2:
 * "generar una vista única de los proyectos prioritarios abajo de la opción
 * proyectos" y "generar una rueda de cumplimiento de esos proyectos en esa
 * misma vista".
 *
 * Todas las fichas que el usuario puede ver (la RLS acota: cada área las
 * suyas, Planificación todas), agrupadas por área. La ficha se carga y se
 * edita en POA 2027; acá se mira.
 *
 * La rueda mide lo mismo que el Panel con el "grado de avance": el promedio
 * del avance de los proyectos del POA vinculados a una ficha, sin los que no
 * tienen datos. Una ficha sin proyecto vinculado no tiene avance que medir.
 */
export default async function ProyectosPrioritariosVistaPage() {
  const perfil = await getPerfilActual();
  if (!perfil) redirect("/login");

  const periodo = await getPeriodoActivo();
  const anio = periodo.anio ?? new Date(periodo.fecha_inicio).getUTCFullYear();

  let fichas: Awaited<ReturnType<typeof getTodosLosPrioritarios>> = [];
  let error: string | null = null;
  try {
    fichas = await getTodosLosPrioritarios();
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }
  const { proyectos, avance } = await getAvancePorProyecto(periodo.id);

  // Cada proyecto del POA cuenta una vez, aunque tenga dos fichas.
  const vinculados = [...new Set(fichas.map((f) => f.proyecto_id).filter((id): id is string => !!id))].filter(
    (id) => proyectos.has(id)
  );
  const pcts = vinculados.map((id) => avance.get(id)?.pct ?? null);
  const rueda = promedioDeProyectos(pcts);

  const dist: DistribucionEstados = { verde: 0, amarillo: 0, rojo: 0, sin_datos: 0 };
  for (const id of vinculados) {
    const av = avance.get(id);
    dist[!av || av.conDatos === 0 ? "sin_datos" : (av.estado as keyof DistribucionEstados)]++;
  }
  const sinVincular = fichas.filter((f) => !f.proyecto_id || !proyectos.has(f.proyecto_id)).length;

  const porArea = new Map<string, typeof fichas>();
  for (const f of fichas) {
    if (!porArea.has(f.unidad_nombre)) porArea.set(f.unidad_nombre, []);
    porArea.get(f.unidad_nombre)!.push(f);
  }
  const areas = [...porArea.entries()].sort((a, b) => a[0].localeCompare(b[0], "es"));

  return (
    <div className="space-y-8 max-w-7xl">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Proyectos prioritarios 2027</h1>
          <p className="text-sm text-muted mt-1">
            {fichas.length} {fichas.length === 1 ? "proyecto prioritario" : "proyectos prioritarios"}
            {areas.length > 0 && ` de ${areas.length} ${areas.length === 1 ? "área" : "áreas"}`}.
          </p>
        </div>
        {perfil.rol === "admin_funcional" && (
          <Link
            href="/poa-2027/prioritarios"
            className="text-sm border border-border rounded-lg px-4 py-2 hover:bg-surface-hover self-start"
          >
            Cargar o editar por área
          </Link>
        )}
      </div>

      {error ? (
        <div className="rounded-xl border border-danger/30 bg-danger/5 p-4">
          <p className="text-sm font-semibold text-danger">No se pudieron leer los proyectos prioritarios</p>
          <p className="text-xs text-muted mt-1 font-mono break-all">{error}</p>
          <p className="text-xs text-muted mt-2">
            Si habla de una columna o tabla que no existe, falta aplicar la migración 059 o la 060.
          </p>
        </div>
      ) : fichas.length === 0 ? (
        <EmptyState
          title="Todavía no hay proyectos prioritarios"
          description="Las áreas de la lista los generan desde POA 2027 → Proyectos prioritarios."
          icon="★"
        />
      ) : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2 rounded-2xl border border-border bg-surface p-6">
              <p className="text-sm font-semibold text-foreground uppercase tracking-wider">
                Cumplimiento de los proyectos prioritarios
              </p>
              <p className="text-xs text-muted mt-1">
                Grado de avance {anio} de los proyectos del POA vinculados
              </p>
              <div className="mt-4">
                <GaugeCumplimiento value={rueda.pct} label={`Avance ${anio}`} />
              </div>
              {rueda.pct === null && (
                <p className="text-sm text-muted/70 text-center">
                  {vinculados.length === 0
                    ? "Ningún proyecto prioritario está vinculado a un proyecto del POA"
                    : "Aguardando primer reporte"}
                </p>
              )}
            </div>
            <div className="rounded-2xl border border-success/25 bg-surface p-5 space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-success">¿Cómo se calcula?</p>
              <p className="text-xs text-muted leading-relaxed">
                Cada proyecto prioritario está vinculado a un proyecto del POA {anio}, y su avance es
                el de ese proyecto. La rueda es el promedio del avance de esos proyectos, como el grado
                de avance del Panel Ejecutivo: hoy entran{" "}
                <strong className="text-foreground tabular-nums">{rueda.conDatos}</strong> de{" "}
                <span className="tabular-nums">{vinculados.length}</span>. Los que no tienen datos
                cargados no se cuentan.
              </p>
              {sinVincular > 0 && (
                <p className="text-xs text-muted leading-relaxed">
                  {sinVincular === 1
                    ? "1 ficha no está vinculada a un proyecto del POA, así que no entra en la rueda."
                    : `${sinVincular} fichas no están vinculadas a un proyecto del POA, así que no entran en la rueda.`}
                </p>
              )}
            </div>
          </div>

          {vinculados.length > 0 && (
            <div>
              <p className="text-sm font-semibold text-foreground uppercase tracking-wider mb-4">
                Estado de los proyectos prioritarios
              </p>
              <EstadoProyectos distribucion={dist} />
            </div>
          )}

          <div className="space-y-8">
            {areas.map(([area, suyas]) => (
              <section key={area}>
                <h2 className="text-sm font-semibold text-foreground mb-3">
                  {area} <span className="text-xs text-muted font-normal">— {suyas.length}</span>
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                  {suyas.map((f) => {
                    const py = f.proyecto_id ? proyectos.get(f.proyecto_id) : undefined;
                    const av = f.proyecto_id ? avance.get(f.proyecto_id) : undefined;
                    const conDatos = !!av && av.conDatos > 0;
                    return (
                      <Link
                        key={f.id}
                        href={`/poa-2027/prioritarios/${f.id}`}
                        className="block rounded-xl border border-border bg-surface p-4 hover:bg-surface-hover hover:border-primary/30 transition-all group"
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-[10px] font-semibold text-primary bg-primary/10 border border-primary/30 rounded px-1.5 py-0.5">
                            ★ Prioritario
                          </span>
                          {py && <StatusBadge estado={conDatos ? av!.estado : "sin_datos"} />}
                        </div>
                        <h3 className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors line-clamp-2">
                          {f.nombre}
                        </h3>
                        <p className="text-xs text-muted mt-0.5 line-clamp-1">
                          {py ? `POA ${anio}: ${py.nombre}` : "Sin proyecto del POA vinculado"}
                        </p>
                        <div className="mt-2">
                          {conDatos ? (
                            <ProgressBar value={av!.pct ?? 0} estado={av!.estado} size="sm" />
                          ) : (
                            <div className="h-2 rounded-full bg-border/30" />
                          )}
                        </div>
                        <div className="flex items-center justify-between mt-2 text-xs text-muted">
                          <span>
                            {f.meta_anual !== null
                              ? `Meta 2027: ${numeroArg(f.meta_anual)} ${f.unidad_medida ?? ""}`
                              : "Sin meta 2027"}
                          </span>
                          <span className="tabular-nums">{conDatos ? `${av!.pct}%` : "Sin seguimiento"}</span>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

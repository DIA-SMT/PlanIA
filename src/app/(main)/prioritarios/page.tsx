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
import { EmptyState } from "@/components/ui/empty-state";
import { ListaPrioritarios, type AreaPrioritarios } from "@/components/dashboard/lista-prioritarios";
import { BotonInstructivo } from "@/components/poa2027/instructivo";

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
  const listado: AreaPrioritarios[] = areas.map(([area, suyas]) => ({
    id: area,
    nombre: area,
    fichas: suyas.map((f) => {
      const py = f.proyecto_id ? proyectos.get(f.proyecto_id) : undefined;
      const av = f.proyecto_id ? avance.get(f.proyecto_id) : undefined;
      const conDatos = !!py && !!av && av.conDatos > 0;
      return {
        id: f.id,
        nombre: f.nombre,
        proyecto: py?.nombre ?? null,
        estado: conDatos ? av!.estado : "sin_datos",
        pct: conDatos ? (av!.pct ?? 0) : null,
        meta:
          f.meta_anual !== null
            ? `Meta 2027: ${numeroArg(f.meta_anual)} ${f.unidad_medida ?? ""}`.trim()
            : "Sin meta 2027",
      };
    }),
  }));

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
        <div className="flex flex-wrap items-center gap-2 self-start">
          {/* 16.11: el instructivo, antes de comenzar la carga. */}
          <BotonInstructivo guia="prioritarios" />
          {perfil.rol === "admin_funcional" && (
            <Link
              href="/poa-2027/prioritarios"
              className="text-sm border border-border rounded-lg px-4 py-2 hover:bg-surface-hover"
            >
              Cargar o editar por área
            </Link>
          )}
        </div>
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

          {/* 27.11: como el POA Operativo, con buscador, filtros y una fila plegada por área. */}
          <ListaPrioritarios areas={listado} anio={anio} />
        </>
      )}
    </div>
  );
}

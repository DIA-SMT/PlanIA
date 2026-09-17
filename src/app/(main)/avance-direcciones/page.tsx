import {
  getPeriodoActivo,
  getProyectos,
  getUnidades,
  getIndicadoresAvance,
  getMetasDelPeriodo,
  type IndicadorAvance,
} from "@/lib/queries";
import { BackButton } from "@/components/layout/back-button";
import { EmptyState } from "@/components/ui/empty-state";
import { getPerfilActual } from "@/lib/auth";
import {
  avanceMetaEnPlazo,
  avanceAgregado,
  promedioDeProyectos,
  calcularPorcentajeMeta,
  estadoDeAvance,
} from "@/lib/utils";
import Link from "next/link";
import type { Meta, UnidadOrganizacional } from "@/types/database";

export const revalidate = 0;

interface ResumenDireccion {
  unidad: UnidadOrganizacional;
  secretaria: UnidadOrganizacional | null;
  totalProyectos: number;
  conDatos: number;
  promedioPct: number | null; // 0-100 (cascada), null si sin datos
  semaforo: { verde: number; amarillo: number; rojo: number; sin_datos: number };
}

/**
 * Quién entra a Avance por Dirección — 15.09, párrafo 797: "solamente debe
 * visualizarse para los usuarios Subsecretarios, Secretarios e Intendente".
 *
 * El control va en la página y no solo en el menú: esconder un link no es un
 * permiso, la URL sigue andando. Los dos roles de administración entran porque
 * Planificación necesita ver el avance de todas las direcciones.
 */
const ROLES_AVANCE_DIRECCIONES = [
  "intendenta",
  "secretario",
  "subsecretario",
  "admin_funcional",
  "admin_tecnico",
];

export default async function AvanceDireccionesPage() {
  const perfil = await getPerfilActual();
  if (!perfil || !ROLES_AVANCE_DIRECCIONES.includes(perfil.rol)) {
    return (
      <div className="space-y-6 max-w-3xl">
        <BackButton fallback="/dashboard" />
        <EmptyState
          title="Avance por Dirección no está disponible para tu perfil"
          description="Lo consultan la Intendenta, las Secretarías y las Subsecretarías. El avance de tu área lo tenés en el Panel Ejecutivo y en el Reporte trimestral."
          icon="📊"
        />
      </div>
    );
  }

  const periodo = await getPeriodoActivo();
  const [proyectos, unidades, indicadores, metas] = await Promise.all([
    getProyectos(periodo.id),
    getUnidades(),
    getIndicadoresAvance(periodo.id),
    getMetasDelPeriodo(periodo.id),
  ]);

  const unidadById = new Map(unidades.map((u) => [u.id, u]));

  // Encontrar ancestro Secretaría
  const findSecretaria = (unidadId: string): UnidadOrganizacional | null => {
    let cur: UnidadOrganizacional | null = unidadById.get(unidadId) ?? null;
    while (cur && cur.parent_id) cur = unidadById.get(cur.parent_id) ?? null;
    return cur;
  };

  // Indicadores por meta y metas por proyecto (para la cascada)
  const indByMeta = new Map<string, IndicadorAvance[]>();
  for (const i of indicadores) {
    if (i.meta_id) (indByMeta.get(i.meta_id) ?? indByMeta.set(i.meta_id, []).get(i.meta_id)!).push(i);
  }
  const metasByProyecto = new Map<string, Meta[]>();
  for (const m of metas) {
    (metasByProyecto.get(m.proyecto_id) ?? metasByProyecto.set(m.proyecto_id, []).get(m.proyecto_id)!).push(m);
  }

  const hoy = new Date().toISOString().slice(0, 10);
  // Avance de cada proyecto por cascada (meta → proyecto), considerando el plazo.
  const avancePorProyecto = new Map<string, number | null>();
  for (const py of proyectos) {
    const metasPy = metasByProyecto.get(py.id) ?? [];
    const pcts = metasPy.map(
      (m) =>
        avanceMetaEnPlazo(
          indByMeta.get(m.id) ?? [],
          calcularPorcentajeMeta(m),
          { fecha_inicio: m.fecha_inicio, fecha_limite: m.fecha_limite },
          hoy
        ).pct
    );
    avancePorProyecto.set(py.id, avanceAgregado(pcts).pct);
  }

  // Agrupar proyectos por dirección (unidad)
  const proyectosPorUnidad = new Map<string, typeof proyectos>();
  for (const py of proyectos) {
    (proyectosPorUnidad.get(py.unidad_id) ?? proyectosPorUnidad.set(py.unidad_id, []).get(py.unidad_id)!).push(py);
  }

  // Resumen por dirección: promedio de sus proyectos, con la misma regla que el
  // Plan Rector y los informes — los que no tienen dato quedan afuera en vez de
  // contar como cero. Hasta el 16.09 esta pantalla los contaba como cero y por
  // eso 15 de las 49 direcciones mostraban acá un número y en el reporte otro.
  const resumenes: ResumenDireccion[] = [];
  for (const [unidadId, pys] of proyectosPorUnidad.entries()) {
    const unidad = unidadById.get(unidadId);
    if (!unidad) continue;
    const pcts = pys.map((p) => avancePorProyecto.get(p.id) ?? null);
    const agg = promedioDeProyectos(pcts);
    const semaforo = { verde: 0, amarillo: 0, rojo: 0, sin_datos: 0 };
    for (const p of pcts) semaforo[estadoDeAvance(p) as keyof typeof semaforo]++;
    resumenes.push({
      unidad,
      secretaria: findSecretaria(unidadId),
      totalProyectos: pys.length,
      conDatos: agg.conDatos,
      promedioPct: agg.pct,
      semaforo,
    });
  }

  // Agrupar por Secretaría
  const porSecretaria = new Map<string, ResumenDireccion[]>();
  for (const r of resumenes) {
    if (!r.secretaria) continue;
    (porSecretaria.get(r.secretaria.id) ?? porSecretaria.set(r.secretaria.id, []).get(r.secretaria.id)!).push(r);
  }

  // Avance por secretaría = promedio de los proyectos de todas sus direcciones
  const promedioPorSec = new Map<string, number | null>();
  for (const [secId, lista] of porSecretaria.entries()) {
    const pysSec = lista.flatMap((l) => (proyectosPorUnidad.get(l.unidad.id) ?? []));
    const pcts = pysSec.map((p) => avancePorProyecto.get(p.id) ?? null);
    promedioPorSec.set(secId, promedioDeProyectos(pcts).pct);
  }

  const secretarias = Array.from(porSecretaria.keys())
    .map((id) => unidadById.get(id))
    .filter((u): u is UnidadOrganizacional => !!u)
    .sort((a, b) => (a.nombre_corto ?? a.nombre).localeCompare(b.nombre_corto ?? b.nombre));

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center justify-between gap-3">
        <BackButton fallback="/dashboard" />
      </div>

      <div>
        <h1 className="text-2xl font-bold text-foreground">Avance por Dirección</h1>
        <p className="text-sm text-muted mt-1">
          Avance de la POA de cada dirección: indicadores → metas → proyectos · {periodo.nombre}
        </p>
        {/* La misma aclaración que el Plan Rector, para que nadie tenga que
            deducir por qué un área con la mitad sin cargar no aparece en cero. */}
        <p className="text-xs text-muted/80 mt-2 leading-relaxed">
          El promedio toma los proyectos que tienen datos cargados; los que no tienen
          quedan afuera en vez de contar como cero, y se muestran aparte. Los{" "}
          <strong>no iniciados sí cuentan</strong>: tienen carga y su avance da 0. Es la
          misma cuenta que el Plan Rector y el reporte trimestral.
        </p>
      </div>

      {resumenes.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface p-8 text-center">
          <p className="text-sm text-muted">Sin proyectos cargados todavía</p>
        </div>
      ) : (
        <div className="space-y-8">
          {secretarias.map((sec) => {
            const lista = porSecretaria.get(sec.id) ?? [];
            const promSec = promedioPorSec.get(sec.id);
            return (
              <section key={sec.id}>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-md bg-primary/20 flex items-center justify-center text-xs font-bold text-primary">
                      {sec.nombre_corto?.[0] ?? sec.nombre[0]}
                    </div>
                    <h2 className="text-sm font-bold text-foreground">{sec.nombre}</h2>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] text-muted uppercase tracking-wider">Avance promedio</p>
                    <p className="text-lg font-bold text-foreground">{promSec != null ? `${promSec}%` : "—"}</p>
                  </div>
                </div>

                <div className="space-y-2">
                  {lista
                    .sort((a, b) => (b.promedioPct ?? -1) - (a.promedioPct ?? -1))
                    .map((r) => (
                      <DireccionRow key={r.unidad.id} resumen={r} />
                    ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

function DireccionRow({ resumen }: { resumen: ResumenDireccion }) {
  const pct = resumen.promedioPct;
  const barColor =
    pct == null ? "bg-muted/30" : pct >= 100 ? "bg-success" : pct > 0 ? "bg-warning" : "bg-info";

  return (
    <div className="rounded-lg border border-border bg-surface p-3">
      <div className="flex items-center justify-between gap-3 mb-2">
        <Link
          href={`/proyectos?dir=${resumen.unidad.id}`}
          className="text-sm font-semibold text-foreground hover:text-primary line-clamp-1 flex-1 min-w-0"
        >
          {resumen.unidad.nombre_corto ?? resumen.unidad.nombre}
        </Link>
        <span className="text-xs text-muted shrink-0">
          {resumen.conDatos}/{resumen.totalProyectos} proyectos con datos
        </span>
        <span className="text-lg font-bold text-foreground shrink-0 w-12 text-right">
          {pct != null ? `${pct}%` : "—"}
        </span>
      </div>
      <div className="h-2 rounded-full bg-border/30 overflow-hidden">
        <div
          className={`h-full ${barColor} transition-all`}
          style={{ width: `${Math.max(2, pct ?? 0)}%` }}
        />
      </div>
      <div className="flex items-center gap-3 mt-2 text-[10px] text-muted">
        {resumen.semaforo.verde > 0 && (
          <span className="flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-success" /> {resumen.semaforo.verde} finalizados
          </span>
        )}
        {resumen.semaforo.amarillo > 0 && (
          <span className="flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-warning" /> {resumen.semaforo.amarillo} en ejecución
          </span>
        )}
        {resumen.semaforo.rojo > 0 && (
          <span className="flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-info" /> {resumen.semaforo.rojo} no iniciados
          </span>
        )}
        {resumen.semaforo.sin_datos > 0 && (
          <span className="flex items-center gap-1 opacity-60">
            <span className="h-1.5 w-1.5 rounded-full bg-muted/50" /> {resumen.semaforo.sin_datos} sin datos
          </span>
        )}
      </div>
    </div>
  );
}

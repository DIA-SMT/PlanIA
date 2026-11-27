import { getUnidades, getPeriodoActivo, getProyectos, getMetasDelPeriodo } from "@/lib/queries";
import { getPerfilActual } from "@/lib/auth";
import { perfilVeTodo, unidadesDelPerfil } from "@/lib/utils";
import type { EstadoSemaforo } from "@/types/database";
import { UnidadNode } from "@/components/estructura/unidad-node";

export const revalidate = 0;

export default async function EstructuraPage() {
  const [unidades, periodo, perfil] = await Promise.all([
    getUnidades(),
    getPeriodoActivo(),
    getPerfilActual(),
  ]);
  const proyectos = await getProyectos(periodo.id);

  const todasMetas = await getMetasDelPeriodo(periodo.id);

  const pyPorUnidad: Record<string, { id: string; nombre: string; codigo: string | null }[]> = {};
  for (const py of proyectos) {
    (pyPorUnidad[py.unidad_id] ??= []).push({ id: py.id, nombre: py.nombre, codigo: py.codigo });
  }

  const metasPorPy = new Map<string, { estado_semaforo: EstadoSemaforo }[]>();
  for (const m of todasMetas ?? []) {
    const arr = metasPorPy.get(m.proyecto_id) ?? [];
    arr.push(m as { estado_semaforo: EstadoSemaforo });
    metasPorPy.set(m.proyecto_id, arr);
  }

  const sortByName = (a: typeof unidades[number], b: typeof unidades[number]) =>
    (a.nombre_corto ?? a.nombre).localeCompare(b.nombre_corto ?? b.nombre);

  const childrenByParent: Record<string, typeof unidades> = {};
  for (const u of unidades) {
    if (u.parent_id) (childrenByParent[u.parent_id] ??= []).push(u);
  }
  // Ordenar alfabéticamente cada nivel
  for (const k of Object.keys(childrenByParent)) {
    childrenByParent[k].sort(sortByName);
  }

  function contarSemaforos(unidadId: string): Record<EstadoSemaforo, number> {
    const counts: Record<EstadoSemaforo, number> = { verde: 0, amarillo: 0, rojo: 0, gris: 0, sin_datos: 0 };
    const pys = pyPorUnidad[unidadId] ?? [];
    for (const py of pys) {
      const metas = metasPorPy.get(py.id) ?? [];
      for (const m of metas) counts[m.estado_semaforo] = (counts[m.estado_semaforo] || 0) + 1;
    }
    for (const hijo of childrenByParent[unidadId] ?? []) {
      const hijoC = contarSemaforos(hijo.id);
      for (const k of Object.keys(counts) as EstadoSemaforo[]) counts[k] += hijoC[k];
    }
    return counts;
  }

  const semaforosByUnidad: Record<string, Record<EstadoSemaforo, number>> = {};
  for (const u of unidades) semaforosByUnidad[u.id] = contarSemaforos(u.id);

  // Raíz del árbol: para roles globales, las secretarías (nivel 0).
  // Para usuarios con área asignada, arranca en su propia unidad.
  // 27.11: o en cada una de sus áreas, si tiene más de una.
  const mias = unidadesDelPerfil(perfil);
  const raiz =
    !perfilVeTodo(perfil) && mias.length > 0
      ? unidades.filter((u) => mias.includes(u.id))
      : unidades.filter((u) => u.parent_id === null).sort(sortByName);

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Estructura Organizacional</h1>
        <p className="text-sm text-muted mt-1">{unidades.length} unidades organizacionales</p>
      </div>

      <div className="space-y-2">
        {raiz.map((unidad) => (
          <UnidadNode
            key={unidad.id}
            unidad={unidad}
            hijos={childrenByParent[unidad.id] ?? []}
            proyectos={pyPorUnidad[unidad.id] ?? []}
            semaforos={semaforosByUnidad[unidad.id]}
            childrenByParent={childrenByParent}
            proyectosByUnidad={pyPorUnidad}
            semaforosByUnidad={semaforosByUnidad}
            depth={0}
          />
        ))}
      </div>
    </div>
  );
}

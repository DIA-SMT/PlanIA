import { getResumenDashboard, getIndicadoresAvance, type IndicadorAvance } from "./queries";
import { avanceMetaEnPlazo, calcularPorcentajeMeta, avanceAgregado, type AvanceNivel } from "./utils";
import type { Proyecto } from "@/types/database";

/**
 * El avance de cada proyecto activo del período, con la misma cascada que el
 * Panel Ejecutivo: cada meta sale de sus indicadores (con el plazo) y el
 * proyecto es el promedio de sus metas.
 *
 * Es la cuenta de dashboard/page.tsx, que la sigue haciendo en el lugar. Está
 * acá para la vista de Proyectos prioritarios (30.10): la rueda de esos
 * proyectos tiene que dar lo mismo que el Panel para los mismos proyectos, así
 * que usa las mismas lecturas (paginadas) y las mismas funciones de utils.
 */
export async function getAvancePorProyecto(periodoId: string): Promise<{
  proyectos: Map<string, Proyecto>;
  avance: Map<string, AvanceNivel>;
}> {
  const [resumen, indicadores] = await Promise.all([
    getResumenDashboard(periodoId),
    getIndicadoresAvance(periodoId),
  ]);

  const indByMeta = new Map<string, IndicadorAvance[]>();
  for (const i of indicadores) {
    if (i.meta_id) (indByMeta.get(i.meta_id) ?? indByMeta.set(i.meta_id, []).get(i.meta_id)!).push(i);
  }

  const hoy = new Date().toISOString().slice(0, 10);
  const proyectos = new Map<string, Proyecto>();
  const avance = new Map<string, AvanceNivel>();
  for (const py of resumen.proyectos) {
    if (py.estado !== "activo") continue;
    proyectos.set(py.id, py);
    const metaPcts = (resumen.metasPorProyecto.get(py.id) ?? []).map(
      (m) =>
        avanceMetaEnPlazo(
          indByMeta.get(m.id) ?? [],
          calcularPorcentajeMeta(m),
          { fecha_inicio: m.fecha_inicio, fecha_limite: m.fecha_limite },
          hoy
        ).pct
    );
    avance.set(py.id, avanceAgregado(metaPcts));
  }
  return { proyectos, avance };
}

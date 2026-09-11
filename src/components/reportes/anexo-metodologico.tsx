/**
 * Anexo técnico del reporte trimestral.
 *
 * El texto es el de la plantilla que mandó Planificación, transcripto tal cual
 * —incluida la nota de salvedad—, y con la aclaración del propio documento:
 * "(Esto es lo mismo para todas las secretarías, subsecretarías y direcciones)".
 *
 * Un detalle que vale registrar: la definición que ellos escribieron para
 * "Finalizados" —"metas físicas planificadas para el trimestre concluidas al
 * 100%"— coincide con la cascada que usa este reporte (verde a 100), y NO con
 * la fórmula de la pantalla /proyectos (verde a 70). Así que el criterio del
 * reporte es el que el cliente ya definió por escrito.
 */

import { FASES } from "@/lib/reporte-trimestral";

// Las definiciones viven en `reporte-trimestral.ts` desde el 09.09: el pie del
// bloque 2 muestra la de la fase que le tocó al área, y si hubiera dos copias
// se desincronizarían.
const FASES_ANEXO = FASES.map((f) => ({
  icono: f.icono,
  titulo: `${f.nombre} (${f.rango})`,
  texto: f.texto,
}));

const ESTADOS = [
  {
    icono: "🟢",
    titulo: "Finalizados",
    texto:
      "Proyectos cuyas metas físicas planificadas para el trimestre fueron concluidas al 100 % en la plataforma.",
  },
  {
    icono: "🟡",
    titulo: "En Ejecución",
    texto:
      "Proyectos activos en territorio que se encuentran documentando tareas y avances físicos dentro de los plazos vigentes.",
  },
  {
    icono: "🔴",
    titulo: "No Iniciados",
    texto:
      "Acciones contempladas en la planificación anual del área, pero cuya fecha operativa de inicio está prevista para meses o trimestres posteriores.",
  },
  {
    icono: "⚪",
    titulo: "Sin Datos",
    texto:
      "Registros que presentan ausencia de actualizaciones o reportes de estado físico en el sistema al momento del cierre del período.",
  },
];

export function AnexoMetodologico() {
  return (
    <section className="space-y-4 rompe-pagina">
      <div>
        <h2 className="text-lg font-bold text-foreground">
          Anexo técnico y marco metodológico — PlanIA
        </h2>
        <p className="text-sm text-muted mt-1">
          Este apartado detalla los parámetros de control, escalas y salvedades que rigen la
          elaboración de los indicadores de gestión del presente informe.
        </p>
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-bold text-foreground">
          I. Parámetros técnicos de clasificación de metas y áreas
        </h3>
        <p className="text-sm text-foreground/90">
          Para garantizar la homogeneidad en la lectura, los niveles de avance y estados del
          sistema se calculan bajo las siguientes referencias fijas:
        </p>

        <div className="space-y-2">
          <p className="text-sm font-semibold text-foreground">
            A. Niveles de avance institucional (para secretarías, subsecretarías y direcciones)
          </p>
          <ul className="space-y-2">
            {FASES_ANEXO.map((f) => (
              <li key={f.titulo} className="flex gap-2.5 text-sm">
                <span className="shrink-0" aria-hidden="true">
                  {f.icono}
                </span>
                <span className="text-foreground/90">
                  <strong className="text-foreground">{f.titulo}:</strong> {f.texto}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-semibold text-foreground">
            B. Estado de proyectos individuales (para la matriz interna de PlanIA)
          </p>
          <ul className="space-y-2">
            {ESTADOS.map((e) => (
              <li key={e.titulo} className="flex gap-2.5 text-sm">
                <span className="shrink-0" aria-hidden="true">
                  {e.icono}
                </span>
                <span className="text-foreground/90">
                  <strong className="text-foreground">{e.titulo}:</strong> {e.texto}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-bold text-foreground">
          II. Nota de salvedad metodológica (etapa de aprendizaje)
        </h3>
        <p className="text-sm text-foreground/90 leading-relaxed">
          El presente ciclo de reportes se encuentra enmarcado en la etapa de implementación
          progresiva y aprendizaje institucional de la plataforma municipal “PlanIA”. En tal
          sentido, los indicadores consolidados en todo el Municipio reflejan únicamente
          aquellas metas y proyectos que fueron efectivamente actualizados por los equipos
          técnicos hasta la fecha de corte establecida.
        </p>
        <p className="text-sm text-foreground/90 leading-relaxed">
          Aquellos registros municipales que permanezcan bajo la condición de “Sin Datos” no
          han sido penalizados ni computados para la determinación del porcentaje de
          cumplimiento interno de este trimestre, con el fin de acompañar el proceso de
          adopción del sistema. Por consiguiente, la progresiva regularización y completitud
          de la carga de datos por parte de las Direcciones modificará de manera directa los
          indicadores presentados en los próximos informes, permitiendo reflejar con mayor
          precisión el esfuerzo real de la gestión operativa de todo el gobierno local.
        </p>
      </div>
    </section>
  );
}

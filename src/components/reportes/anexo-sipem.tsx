/**
 * ANEXO I — CRITERIOS METODOLÓGICOS.
 *
 * El texto es el que escribió Planificación en los modelos del 15.09,
 * transcripto. Los dos modelos traen su propio anexo y comparten casi todo; lo
 * que cambia va por `modelo`, para no tener dos copias que se desincronicen a la
 * primera corrección.
 *
 * Reemplaza al anexo anterior, que describía el informe único que servía para
 * los tres niveles.
 */
export function AnexoSipem({ modelo }: { modelo: "secretaria" | "direccion" }) {
  return (
    <section className="space-y-4 rompe-pagina">
      <div>
        <h2 className="text-lg font-bold text-foreground">Anexo I — Criterios metodológicos</h2>
        <p className="text-sm text-muted mt-1">
          {modelo === "secretaria"
            ? "Parámetros que rigen la elaboración de los indicadores presentados en este informe."
            : "El presente informe se construye sobre la información disponible en SIPEM al momento de la fecha de corte."}
        </p>
      </div>

      {modelo === "secretaria" && (
        <Bloque titulo="Universo de análisis">
          El informe se construye a partir de los proyectos registrados en SIPEM
          correspondientes a la jurisdicción y disponibles al momento de la fecha de corte.
        </Bloque>
      )}

      <Bloque titulo={modelo === "secretaria" ? "Avance promedio" : "Avance de la Dirección"}>
        {modelo === "secretaria" ? (
          <>
            El avance promedio se obtiene mediante el promedio simple de los porcentajes de
            avance correspondientes a los proyectos que cuentan con información suficiente para
            su evaluación.
            <span className="block mt-1.5 font-mono text-[11px] text-foreground bg-border/30 rounded px-2 py-1">
              Avance promedio = Σ avance de proyectos evaluables / cantidad de proyectos
              evaluables
            </span>
            <span className="block mt-1.5">
              Los proyectos clasificados como Sin Datos no intervienen en este cálculo.
            </span>
          </>
        ) : (
          <>
            El porcentaje de avance constituye el promedio simple del avance registrado en los
            proyectos que cuentan con información suficiente para su evaluación.
          </>
        )}
      </Bloque>

      <Bloque titulo="Cobertura de información">
        {modelo === "secretaria" ? (
          <>
            <span className="block font-mono text-[11px] text-foreground bg-border/30 rounded px-2 py-1">
              Cobertura = proyectos con datos de avance / total de proyectos × 100
            </span>
            <span className="block mt-1.5">
              Este indicador permite interpretar el nivel de avance en relación con la
              proporción del universo que efectivamente puede ser evaluada.
            </span>
          </>
        ) : (
          <>
            Representa la proporción de proyectos con datos suficientes para determinar su
            avance respecto del total registrado.
          </>
        )}
      </Bloque>

      {modelo === "direccion" && (
        <Bloque titulo="Completitud">
          La completitud de metas e indicadores mide la proporción de componentes que cuentan
          con información registrada respecto del total definido.
        </Bloque>
      )}

      {modelo === "secretaria" && (
        <Bloque titulo="Aporte al consolidado municipal">
          El aporte de cada jurisdicción al consolidado municipal se determinará de acuerdo con
          la metodología de ponderación institucional definida por la Dirección de
          Planificación Estratégica.
          <span className="block mt-1.5">
            La participación porcentual sobre el total de proyectos no constituye, por sí
            misma, una medida de aporte al cumplimiento municipal.
          </span>
        </Bloque>
      )}

      {modelo === "secretaria" ? (
        <div className="space-y-2">
          <h3 className="text-sm font-bold text-foreground">Estados de los proyectos</h3>
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
      ) : (
        <Bloque titulo="Sin Datos">
          La condición «Sin Datos» indica que la plataforma no dispone de información
          suficiente para determinar el estado o avance del proyecto al momento del corte. Esta
          condición no permite inferir ausencia de ejecución.
        </Bloque>
      )}

      <p className="text-sm text-foreground/90 leading-relaxed border-t border-border pt-3">
        Los resultados corresponden exclusivamente al estado de la información registrada en
        SIPEM a la fecha de corte.
      </p>
    </section>
  );
}

const ESTADOS = [
  {
    icono: "🟢",
    titulo: "Finalizado",
    texto: "Registra un cumplimiento del 100 % de las metas previstas para el período correspondiente.",
  },
  {
    icono: "🟡",
    titulo: "En ejecución",
    texto: "Registra avance superior a 0 % e inferior a 100 %.",
  },
  {
    icono: "🔴",
    titulo: "No iniciado",
    texto: "No registra avance de ejecución al momento del corte.",
  },
  {
    icono: "⚪",
    titulo: "Sin datos",
    texto: "No cuenta con información suficiente para determinar su estado o nivel de avance.",
  },
];

function Bloque({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <h3 className="text-sm font-bold text-foreground">{titulo}</h3>
      <p className="text-sm text-foreground/90 leading-relaxed">{children}</p>
    </div>
  );
}

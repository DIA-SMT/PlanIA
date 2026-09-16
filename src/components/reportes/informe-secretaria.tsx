import { formatFecha } from "@/lib/utils";
import { finDeTrimestre } from "@/lib/corte-trimestral";
import type { ConteoEstados, ReporteUnidad } from "@/lib/reporte-trimestral";
import { AnexoSipem } from "./anexo-sipem";
import { AclaracionFecha, EstadoPunto, Pct, TablaEstados } from "./partes-informe";

const ORDINAL = ["", "Primer", "Segundo", "Tercer", "Cuarto"];

/**
 * INFORME EJECUTIVO DE SEGUIMIENTO Y DESEMPEÑO — modelo de Secretarías y
 * Subsecretarías (15.09, párrafos 806 a 908).
 *
 * El texto es el que escribió Planificación, con los valores calculados donde
 * su modelo dejó [X]. Las secciones y su orden son los de ellos.
 *
 * Reemplaza al informe único que servía para los tres niveles: desde el 15.09
 * hay dos modelos, "ya que tenemos dos tipos de perfiles: secretarios/
 * subsecretarios y directores. Cada tipo de perfil tendrá un modelo diferente de
 * reporte con las características propias de cada área".
 */
export function InformeSecretaria({
  reporte,
  trimestre,
  anio,
  emitidoEl,
  children,
}: {
  reporte: ReporteUnidad;
  trimestre: number;
  anio: number;
  emitidoEl: string;
  /** Las secciones 4 y 5, que las redacta Planificación. */
  children?: React.ReactNode;
}) {
  const t = reporte.totalUnidad;
  const mun = reporte.totalMunicipio;
  const nivel = reporte.unidad?.nivel ?? 0;
  const rotulo = nivel === 0 ? "Secretaría" : "Subsecretaría";
  const cierre = finDeTrimestre(`${anio}-${String(trimestre * 3).padStart(2, "0")}-01`);

  // "Se encuentra [por encima / por debajo / en línea] con el promedio general".
  const dif = t.pct != null && mun.pct != null ? t.pct - mun.pct : null;
  const posicion = dif == null ? null : dif > 2 ? "por encima" : dif < -2 ? "por debajo" : "en línea";

  const pctDe = (n: number) => (t.proyectos === 0 ? 0 : Math.round((n / t.proyectos) * 100));
  const enMarcha = pctDe(t.finalizados + t.en_ejecucion);

  return (
    <article className="hoja space-y-6">
      {/* ---------- Encabezado ---------- */}
      <header className="space-y-3 border-b border-border pb-4">
        <div>
          <h1 className="text-xl font-bold text-foreground leading-tight">
            Informe Ejecutivo de Seguimiento y Desempeño
          </h1>
          <p className="text-[11px] text-muted mt-0.5">
            Sistema de Planificación Estratégica y Monitoreo Municipal — SIPEM
          </p>
          <p className="text-sm font-semibold text-primary mt-1">
            {ORDINAL[trimestre] ?? ""} trimestre {anio}
          </p>
        </div>

        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-xs">
          <div className="flex gap-2">
            <dt className="text-muted shrink-0">Jurisdicción:</dt>
            <dd className="text-foreground font-medium">{reporte.unidad?.nombre ?? "—"}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-muted shrink-0">Fecha de corte:</dt>
            <dd className="text-foreground font-medium">
              {formatFecha(reporte.corte ? reporte.corte.fecha_corte : emitidoEl)}
            </dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-muted shrink-0">De:</dt>
            <dd className="text-foreground">Dirección de Planificación Estratégica</dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-muted shrink-0">Plataforma de origen:</dt>
            <dd className="text-foreground">SIPEM</dd>
          </div>
        </dl>

        <AclaracionFecha
          origen={reporte.origen}
          emitidoEl={emitidoEl}
          cierreDelTrimestre={cierre}
        />
      </header>

      {/* ---------- 1 ---------- */}
      <section className="space-y-2">
        <h2 className="text-base font-bold text-foreground">
          1. Desempeño de la {rotulo} en el contexto municipal
        </h2>
        <p className="text-xs text-foreground/90 leading-relaxed">
          De acuerdo con los registros disponibles en SIPEM al momento del corte, la{" "}
          {rotulo} presenta un avance promedio del <Pct v={t.pct} /> sobre los proyectos que
          cuentan con información suficiente para su evaluación
          {t.proyectos > 0 && (
            <>
              {" "}
              ({t.proyectos - t.sin_datos} de {t.proyectos})
            </>
          )}
          .
        </p>
        {posicion && (
          <p className="text-xs text-foreground/90 leading-relaxed">
            En relación con el conjunto municipal, la jurisdicción se encuentra{" "}
            <strong>{posicion}</strong> con el promedio general de <Pct v={mun.pct} />,
            registrando una diferencia de{" "}
            <strong className="tabular-nums">
              {dif! > 0 ? "+" : ""}
              {dif}
            </strong>{" "}
            puntos porcentuales.
          </p>
        )}

        {/* El aporte al consolidado sigue sin fórmula. El propio Anexo del
            cliente lo deja pendiente: "se determinará de acuerdo con la
            metodología de ponderación institucional definida por la Dirección de
            Planificación Estratégica". Se decidió el 15.09 dejarlo visible
            diciendo que falta la definición, en vez de sacarlo. */}
        <div className="rounded-lg border border-dashed border-warning/50 bg-warning/5 p-3 space-y-1.5">
          <p className="text-xs font-semibold text-warning">
            Aporte al consolidado municipal: falta la definición
          </p>
          <p className="text-[11px] text-foreground/90 leading-relaxed">
            El Anexo de este informe establece que el aporte de cada jurisdicción se determina
            «de acuerdo con la metodología de ponderación institucional definida por la
            Dirección de Planificación Estratégica». Esa metodología todavía no fue definida,
            así que el porcentaje de aporte no se puede calcular y este párrafo queda
            pendiente.
          </p>
          <p className="text-[11px] text-muted leading-relaxed">
            Lo que sí se puede afirmar: el municipio registra{" "}
            <strong className="text-foreground tabular-nums">{mun.proyectos}</strong> proyectos
            y esta jurisdicción{" "}
            <strong className="text-foreground tabular-nums">{t.proyectos}</strong>
            {mun.proyectos > 0 && (
              <> ({Math.round((t.proyectos / mun.proyectos) * 100)} % del total)</>
            )}
            . <em>La participación de la jurisdicción sobre el total de proyectos constituye un
            indicador de volumen y no debe interpretarse como aporte al cumplimiento
            municipal.</em>
          </p>
        </div>
      </section>

      {/* ---------- 2 ---------- */}
      <section className="space-y-2">
        <h2 className="text-base font-bold text-foreground">2. Estado general de los proyectos</h2>
        <p className="text-xs text-muted">
          La jurisdicción registra {t.proyectos} proyectos en SIPEM. Su distribución según
          estado es la siguiente:
        </p>

        <TablaEstados conteo={t} />

        <p className="text-xs text-foreground/90 leading-relaxed">
          Los proyectos finalizados o en ejecución representan el{" "}
          <strong className="tabular-nums">{enMarcha} %</strong> del total registrado, mientras
          que el <strong className="tabular-nums">{pctDe(t.no_iniciados)} %</strong> permanece
          no iniciado y el <strong className="tabular-nums">{pctDe(t.sin_datos)} %</strong> no
          cuenta con información suficiente para su evaluación al momento del corte.
        </p>
      </section>

      {/* ---------- 3 ---------- */}
      <section className="space-y-2">
        <h2 className="text-base font-bold text-foreground">3. Indicadores clave de gestión</h2>

        <div className="tabla-envoltorio">
          <table className="tabla-reporte">
            <thead>
              <tr>
                <th className="izq">Indicador</th>
                <th>Resultado</th>
              </tr>
            </thead>
            <tbody>
              <Indicador nombre="Avance promedio observado" valor={t.pct} />
              <Indicador nombre="Proyectos finalizados o en ejecución" valor={enMarcha} />
              <Indicador nombre="Proyectos no iniciados" valor={pctDe(t.no_iniciados)} />
              <Indicador nombre="Proyectos sin datos" valor={pctDe(t.sin_datos)} />
              <Indicador nombre="Cobertura de información" valor={t.indice_carga} />
              <Indicador nombre="Completitud de metas" valor={t.completitud_metas} />
              <Indicador nombre="Completitud de indicadores" valor={t.completitud_indicadores} />
            </tbody>
          </table>
        </div>

        <p className="text-xs text-foreground/90 leading-relaxed">
          La cobertura de información permite identificar qué proporción del universo cuenta
          con datos suficientes para evaluar el avance, mientras que la completitud de metas e
          indicadores permite observar el nivel de actualización de la planificación registrada
          en SIPEM.
        </p>
        <p className="text-xs text-muted leading-relaxed">
          Estos indicadores son complementarios al porcentaje de avance y no deben
          interpretarse como medidas equivalentes de cumplimiento.
        </p>
      </section>

      {/* ---------- 4 y 5: lo que redacta Planificación ---------- */}
      {children}

      {/* ---------- 6 ---------- */}
      <section className="space-y-2">
        <h2 className="text-base font-bold text-foreground">6. Detalle de proyectos</h2>
        {reporte.proyectos.length === 0 ? (
          <p className="text-sm text-muted border border-border rounded-lg px-3 py-4 text-center">
            Esta {rotulo} no tiene proyectos cargados en SIPEM al momento del corte.
          </p>
        ) : (
          <>
            <div className="tabla-envoltorio">
              <table className="tabla-reporte">
                <thead>
                  <tr>
                    <th className="izq">Proyecto</th>
                    <th className="izq">Dirección responsable</th>
                    <th>Estado</th>
                    <th>Avance</th>
                  </tr>
                </thead>
                <tbody>
                  {reporte.proyectos.map((p, i) => (
                    <tr key={`${p.codigo ?? p.nombre}-${i}`}>
                      <td className="izq">{p.nombre}</td>
                      <td className="izq">{p.unidad_nombre ?? "—"}</td>
                      <td>
                        <EstadoPunto estado={p.estado} />
                      </td>
                      <td className="num">{p.pct != null ? `${p.pct}%` : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-[11px] text-muted">
              Este cuadro constituye el detalle de respaldo de los indicadores consolidados
              presentados en el informe.
            </p>
          </>
        )}
      </section>

      <AnexoSipem modelo="secretaria" />

      <footer className="border-t border-border pt-3 text-[10px] text-muted">
        <p>
          Generado desde SIPEM
          {reporte.corte
            ? ` sobre la foto de corte del ${formatFecha(reporte.corte.fecha_corte)}`
            : " con los datos del día de la consulta"}
          . Dirección de Planificación Estratégica · Municipalidad de San Miguel de Tucumán.
        </p>
      </footer>
    </article>
  );
}

function Indicador({ nombre, valor }: { nombre: string; valor: number | null }) {
  return (
    <tr>
      <td className="izq">{nombre}</td>
      {/* Con espacio, igual que el resto del texto: son las mismas cifras. */}
      <td className="num">{valor != null ? `${valor} %` : "—"}</td>
    </tr>
  );
}

export type { ConteoEstados };

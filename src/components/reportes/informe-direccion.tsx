import { formatFecha } from "@/lib/utils";
import { finDeTrimestre } from "@/lib/corte-trimestral";
import type { FilaProyecto, ReporteUnidad } from "@/lib/reporte-trimestral";
import { AnexoSipem } from "./anexo-sipem";
import { AclaracionFecha, EstadoPunto, Pct, TablaEstados } from "./partes-informe";

const ORDINAL = ["", "Primer", "Segundo", "Tercer", "Cuarto"];

/**
 * INFORME DE SEGUIMIENTO DE GESTIÓN — modelo de Direcciones (15.09, párrafos
 * 909 a 1009).
 *
 * Se diferencia del de Secretarías en dos cosas, que son las que pidieron: acá
 * la comparación es contra la propia Secretaría y no contra el municipio, y hay
 * una sección de metas e indicadores que en el otro no está — al director le
 * sirve saber qué le falta cargar, al secretario no.
 */
export function InformeDireccion({
  reporte,
  trimestre,
  anio,
  emitidoEl,
  rutaArea,
  pctSuperior,
  nombreSuperior,
  children,
}: {
  reporte: ReporteUnidad;
  trimestre: number;
  anio: number;
  emitidoEl: string;
  /** "Secretaría · Subsecretaría", para el encabezado. */
  rutaArea: { secretaria: string | null; subsecretaria: string | null };
  /** Avance del área de la que depende, para la comparación del punto 1. */
  pctSuperior: number | null;
  nombreSuperior: string | null;
  /** Las secciones 5 y 6, que las redacta Planificación. */
  children?: React.ReactNode;
}) {
  const t = reporte.totalUnidad;
  // Los cuatro museos son nivel 3 y cuelgan de la Dirección de Museos: les toca
  // este mismo modelo, pero llamarlos "la Dirección" sería falso.
  const esDepto = (reporte.unidad?.nivel ?? 2) >= 3;
  const EL = esDepto ? "el área" : "la Dirección";
  const DEL = esDepto ? "del área" : "de la Dirección";
  const cierre = finDeTrimestre(`${anio}-${String(trimestre * 3).padStart(2, "0")}-01`);
  const evaluables = t.proyectos - t.sin_datos;

  const dif = t.pct != null && pctSuperior != null ? t.pct - pctSuperior : null;
  const pctDe = (n: number) => (t.proyectos === 0 ? 0 : Math.round((n / t.proyectos) * 100));

  // "Situación de seguimiento" del punto 3.
  const metasPendientes = t.metas - t.metas_con_datos;
  const indicadoresPendientes = t.indicadores - t.indicadores_con_datos;
  const proyectosIncompletos = reporte.proyectos.filter(
    (p) => p.metas_con_datos < p.metas || p.indicadores_con_datos < p.indicadores
  ).length;

  return (
    <article className="hoja space-y-6">
      {/* ---------- Encabezado ---------- */}
      <header className="space-y-3 border-b border-border pb-4">
        <div>
          <h1 className="text-xl font-bold text-foreground leading-tight">
            Informe de Seguimiento de Gestión
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
            <dt className="text-muted shrink-0">{esDepto ? "Área:" : "Dirección:"}</dt>
            <dd className="text-foreground font-medium">{reporte.unidad?.nombre ?? "—"}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-muted shrink-0">Secretaría:</dt>
            <dd className="text-foreground">{rutaArea.secretaria ?? "—"}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-muted shrink-0">Subsecretaría:</dt>
            <dd className="text-foreground">{rutaArea.subsecretaria ?? "—"}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-muted shrink-0">Fecha de corte:</dt>
            <dd className="text-foreground font-medium">
              {formatFecha(reporte.corte ? reporte.corte.fecha_corte : emitidoEl)}
            </dd>
          </div>
        </dl>

        <AclaracionFecha origen={reporte.origen} emitidoEl={emitidoEl} cierreDelTrimestre={cierre} />
      </header>

      {/* ---------- 1 ---------- */}
      <section className="space-y-2">
        <h2 className="text-base font-bold text-foreground">1. Desempeño {DEL}</h2>
        <p className="text-xs text-foreground/90 leading-relaxed">
          Al momento del corte, {EL} registra{" "}
          <strong className="tabular-nums">{t.proyectos}</strong> proyectos en SIPEM, de los
          cuales <strong className="tabular-nums">{evaluables}</strong> cuentan con información
          suficiente para determinar su nivel de avance. El avance promedio observado alcanza el{" "}
          <Pct v={t.pct} />.
        </p>
        {dif != null && nombreSuperior && (
          <p className="text-xs text-foreground/90 leading-relaxed">
            En comparación con el conjunto de su {nombreSuperior}, cuyo avance promedio alcanza
            el <Pct v={pctSuperior} />, {EL} presenta una diferencia de{" "}
            <strong className="tabular-nums">
              {dif > 0 ? "+" : ""}
              {dif}
            </strong>{" "}
            puntos porcentuales.
          </p>
        )}
      </section>

      {/* ---------- 2 ---------- */}
      <section className="space-y-2">
        <h2 className="text-base font-bold text-foreground">2. Estado de los proyectos</h2>
        <TablaEstados conteo={t} />
        <p className="text-xs text-foreground/90 leading-relaxed">
          Actualmente, <strong className="tabular-nums">
            {pctDe(t.finalizados + t.en_ejecucion)} %
          </strong>{" "}
          de los proyectos se encuentra finalizado o en ejecución,{" "}
          <strong className="tabular-nums">{pctDe(t.no_iniciados)} %</strong> permanece no
          iniciado y <strong className="tabular-nums">{pctDe(t.sin_datos)} %</strong> no dispone
          de información suficiente para su evaluación.
        </p>
      </section>

      {/* ---------- 3 ---------- */}
      <section className="space-y-2">
        <h2 className="text-base font-bold text-foreground">
          3. Seguimiento de metas e indicadores
        </h2>
        <p className="text-xs text-muted leading-relaxed">
          La revisión de metas e indicadores permite observar no sólo el avance de los
          proyectos, sino también el grado de actualización de la información necesaria para su
          seguimiento.
        </p>

        <div className="tabla-envoltorio">
          <table className="tabla-reporte">
            <thead>
              <tr>
                <th className="izq">Componente</th>
                <th>Registrados</th>
                <th>Con datos</th>
                <th>Completitud</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="izq">Metas</td>
                <td className="num">{t.metas}</td>
                <td className="num">{t.metas_con_datos}</td>
                <td className="num">
                  {t.completitud_metas != null ? `${t.completitud_metas} %` : "—"}
                </td>
              </tr>
              <tr>
                <td className="izq">Indicadores</td>
                <td className="num">{t.indicadores}</td>
                <td className="num">{t.indicadores_con_datos}</td>
                <td className="num">
                  {t.completitud_indicadores != null ? `${t.completitud_indicadores} %` : "—"}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="space-y-1">
          <p className="text-xs font-semibold text-foreground">Situación de seguimiento</p>
          <ul className="text-xs text-foreground/90 space-y-0.5 list-disc pl-5">
            <li>
              Metas con información pendiente:{" "}
              <strong className="tabular-nums">{metasPendientes}</strong>.
            </li>
            <li>
              Indicadores sin actualización:{" "}
              <strong className="tabular-nums">{indicadoresPendientes}</strong>.
            </li>
            <li>
              Proyectos sin información suficiente:{" "}
              <strong className="tabular-nums">{t.sin_datos}</strong>.
            </li>
            <li>
              Proyectos con información incompleta:{" "}
              <strong className="tabular-nums">{proyectosIncompletos}</strong>.
            </li>
          </ul>
        </div>
      </section>

      {/* ---------- 4 ---------- */}
      <section className="space-y-2">
        <h2 className="text-base font-bold text-foreground">4. Detalle de proyectos</h2>
        {reporte.proyectos.length === 0 ? (
          <p className="text-sm text-muted border border-border rounded-lg px-3 py-4 text-center">
            {esDepto ? "Esta área" : "Esta Dirección"} no tiene proyectos cargados en SIPEM al
            momento del corte.
          </p>
        ) : (
          <div className="tabla-envoltorio">
            <table className="tabla-reporte">
              <thead>
                <tr>
                  <th className="izq">Proyecto</th>
                  <th>Estado</th>
                  <th>Avance</th>
                  <th>Metas</th>
                  <th>Indicadores</th>
                  <th className="izq">Situación de seguimiento</th>
                </tr>
              </thead>
              <tbody>
                {reporte.proyectos.map((p, i) => (
                  <tr key={`${p.codigo ?? p.nombre}-${i}`}>
                    <td className="izq">{p.nombre}</td>
                    <td>
                      <EstadoPunto estado={p.estado} />
                    </td>
                    <td className="num">{p.pct != null ? `${p.pct}%` : "—"}</td>
                    <td className="num">
                      {p.metas_con_datos}/{p.metas}
                    </td>
                    <td className="num">
                      {p.indicadores_con_datos}/{p.indicadores}
                    </td>
                    <td className="izq text-muted">{situacionDe(p)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ---------- 5 y 6: lo que redacta Planificación ---------- */}
      {children}

      <AnexoSipem modelo="direccion" />

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

/**
 * La columna "Situación de seguimiento" del detalle.
 *
 * El modelo la muestra con textos como "Actualización en curso", "Verificar
 * cronograma" o "Completar carga". Se deriva de lo que el sistema puede saber:
 * qué falta cargar. Lo que NO se deduce de los datos —por qué un proyecto no
 * arrancó, por ejemplo— queda para el texto que redacta Planificación.
 */
function situacionDe(p: FilaProyecto): string {
  if (p.estado === "sin_datos") return "Completar carga";
  const faltaMeta = p.metas_con_datos < p.metas;
  const faltaInd = p.indicadores_con_datos < p.indicadores;
  if (faltaMeta && faltaInd) return "Completar metas e indicadores";
  if (faltaInd) return "Indicadores sin actualizar";
  if (faltaMeta) return "Metas sin actualizar";
  if (p.estado === "rojo") return "Verificar cronograma";
  if (p.estado === "amarillo") return "Actualización en curso";
  return "—";
}

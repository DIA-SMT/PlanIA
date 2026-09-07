import { faseInstitucional, type FilaReporte, type ReporteSecretaria } from "@/lib/reporte-trimestral";
import { formatFecha } from "@/lib/utils";
import { AnexoMetodologico } from "./anexo-metodologico";

/**
 * El documento del reporte trimestral, con los bloques en el orden de la
 * plantilla del cliente.
 *
 * Está pensado para imprimirse: la hoja es A4 y el CSS de impresión (globals.css)
 * saca la barra lateral, la barra de arriba y los controles. El usuario hace
 * Imprimir → Guardar como PDF y el navegador genera el archivo. Es el mismo
 * resultado que armar el PDF en el servidor, sin meter Chromium en Vercel a tres
 * semanas de la fecha comprometida.
 *
 * El bloque 1 queda como hueco declarado: necesita la fórmula del aporte, que el
 * cliente todavía no definió, y el 17,1 % de su propio ejemplo es imposible con
 * el modelo del 12,5 % que su texto describe.
 */
export function ReporteDocumento({
  reporte,
  trimestre,
  anio,
  children,
}: {
  reporte: ReporteSecretaria;
  trimestre: number;
  anio: number;
  /** El bloque 3 (el análisis), que es interactivo y viene de afuera. */
  children?: React.ReactNode;
}) {
  const { totalSecretaria: t, secretaria } = reporte;
  const fase = faseInstitucional(t.pct);

  return (
    <article className="hoja space-y-6">
      {/* ---------- Encabezado ---------- */}
      <header className="space-y-3 border-b border-border pb-4">
        <div>
          <h1 className="text-xl font-bold text-foreground leading-tight">
            Reporte de cumplimiento de metas operativas
          </h1>
          <p className="text-sm font-semibold text-primary mt-0.5">
            {trimestre === 1 ? "Primer" : trimestre === 2 ? "Segundo" : trimestre === 3 ? "Tercer" : "Cuarto"}{" "}
            trimestre {anio}
          </p>
        </div>

        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-xs">
          <div className="flex gap-2">
            <dt className="text-muted shrink-0">De:</dt>
            <dd className="text-foreground">Dirección de Planificación Estratégica</dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-muted shrink-0">Para:</dt>
            <dd className="text-foreground font-medium">{secretaria?.nombre ?? "—"}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-muted shrink-0">Plataforma de origen:</dt>
            <dd className="text-foreground">PlanIA</dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-muted shrink-0">Datos al:</dt>
            <dd className="text-foreground">
              {reporte.corte
                ? formatFecha(reporte.corte.fecha_corte)
                : "hoy (vista previa, sin corte guardado)"}
            </dd>
          </div>
        </dl>

        {reporte.origen === "vivo" && (
          <p className="no-imprimir text-[11px] text-warning border border-warning/30 bg-warning/5 rounded px-2.5 py-1.5">
            Vista previa con los datos de hoy. El reporte oficial se emite sobre una foto de
            corte guardada, para que el número no cambie después de firmarlo.
          </p>
        )}
      </header>

      {/* ---------- Bloque 1: bloqueado ---------- */}
      <section className="space-y-2">
        <h2 className="text-base font-bold text-foreground">
          1. Desempeño de la Secretaría en el contexto municipal
        </h2>
        <div className="rounded-lg border border-dashed border-warning/50 bg-warning/5 p-4 space-y-2">
          <p className="text-sm font-semibold text-warning">
            Falta una definición de Planificación Estratégica
          </p>
          <p className="text-xs text-foreground/90 leading-relaxed">
            Este bloque necesita la fórmula del <strong>aporte real</strong> de la secretaría
            al consolidado municipal. La plantilla dice que las 8 secretarías del Gabinete
            tienen 12,5 % cada una, pero el gráfico de ejemplo le asigna a Ambiente un aporte
            del 17,1 %, que con ese modelo es imposible: el techo por secretaría es 12,5.
          </p>
          <p className="text-xs text-foreground/90 leading-relaxed">
            También hace falta saber cuáles son esas 8 secretarías: PlanIA tiene 10 unidades de
            primer nivel.
          </p>
          <p className="text-[11px] text-muted">
            Mientras tanto, lo que sí se puede afirmar: el municipio tiene{" "}
            <strong className="text-foreground tabular-nums">
              {reporte.totalMunicipio.proyectos}
            </strong>{" "}
            proyectos activos, y esta secretaría{" "}
            <strong className="text-foreground tabular-nums">{t.proyectos}</strong>
            {reporte.totalMunicipio.proyectos > 0 && (
              <>
                {" "}
                ({Math.round((t.proyectos / reporte.totalMunicipio.proyectos) * 100)} % del
                total de proyectos, que no es lo mismo que el aporte al cumplimiento).
              </>
            )}
          </p>
        </div>
      </section>

      {/* ---------- Bloque 2: estado general ---------- */}
      <section className="space-y-2">
        <h2 className="text-base font-bold text-foreground">
          2. Estado general de proyectos de la Secretaría
        </h2>
        <p className="text-xs text-muted">
          Distribución cuantitativa absoluta del estado de los proyectos vigentes de la
          jurisdicción, según los estados de carga paramétricos de la plataforma.
        </p>

        <div className="tabla-envoltorio">
          <table className="tabla-reporte">
            <thead>
              <tr>
                <th>Total proyectos</th>
                <th>🟢 Finalizados</th>
                <th>🟡 En Ejecución</th>
                <th>🔵 No Iniciados</th>
                <th>⚪ Sin Datos</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="num font-bold">{t.proyectos}</td>
                <td className="num">{t.finalizados}</td>
                <td className="num">{t.en_ejecucion}</td>
                <td className="num">{t.no_iniciados}</td>
                <td className="num">{t.sin_datos}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <p className="text-xs text-foreground/90">
          Nivel de avance institucional del área:{" "}
          <strong>
            {fase.icono} {fase.nombre}
          </strong>
          {t.pct != null ? (
            <>
              {" "}
              — <span className="tabular-nums">{t.pct} %</span> de ejecución promedio, sobre{" "}
              {t.proyectos - t.sin_datos} de {t.proyectos} proyectos con datos cargados.
            </>
          ) : (
            <> — ningún proyecto del área tiene datos cargados al corte.</>
          )}
        </p>
      </section>

      {/* ---------- Bloque 4 (así numerado en la plantilla) ---------- */}
      <section className="space-y-2 rompe-pagina">
        <h2 className="text-base font-bold text-foreground">
          4. Desempeño operativo por áreas
        </h2>
        <p className="text-xs text-muted">
          Volumen de gestión y nivel de actualización de la información por cada dependencia
          de la estructura orgánica de esta Secretaría.
        </p>

        {reporte.filas.length === 0 ? (
          <p className="text-sm text-muted border border-border rounded-lg px-3 py-4 text-center">
            Esta secretaría no tiene proyectos cargados en el POA al momento del corte.
          </p>
        ) : (
          <div className="tabla-envoltorio">
            <table className="tabla-reporte">
              <thead>
                <tr>
                  <th className="izq">Estructura orgánica</th>
                  <th>Total</th>
                  <th>🟢</th>
                  <th>🟡</th>
                  <th>🔵</th>
                  <th>⚪</th>
                  <th>
                    Índice de carga
                    <span className="text-warning" title="Definición provisoria">
                      {" "}
                      *
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {reporte.filas.map((f) => (
                  <FilasAnidadas key={(f.unidad_id ?? f.nombre) + f.tipo} fila={f} nivel={0} />
                ))}
                <tr className="total">
                  <td className="izq">TOTAL SECRETARÍA</td>
                  <td className="num">{t.proyectos}</td>
                  <td className="num">{t.finalizados}</td>
                  <td className="num">{t.en_ejecucion}</td>
                  <td className="num">{t.no_iniciados}</td>
                  <td className="num">{t.sin_datos}</td>
                  <td className="num">{t.indice_carga != null ? `${t.indice_carga} %` : "—"}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

        {reporte.indiceCargaProvisorio && (
          <p className="text-[11px] text-warning">
            * <strong>Índice de carga: definición provisoria.</strong> La plantilla incluye la
            columna pero no la define. Acá se calcula como la proporción de proyectos del área
            con datos cargados, o sea el complemento de “Sin Datos”. Pendiente de confirmación
            de Planificación Estratégica.
          </p>
        )}
      </section>

      {/* ---------- Bloque 3: el análisis (interactivo) ---------- */}
      {children && <div className="rompe-pagina">{children}</div>}

      {/* ---------- Anexo ---------- */}
      <AnexoMetodologico />

      <footer className="border-t border-border pt-3 text-[10px] text-muted">
        <p>
          Generado desde PlanIA
          {reporte.corte
            ? ` sobre la foto de corte del ${formatFecha(reporte.corte.fecha_corte)}`
            : " con los datos del día de la consulta"}
          . Dirección de Planificación Estratégica · Municipalidad de San Miguel de Tucumán.
        </p>
      </footer>
    </article>
  );
}

/** Una fila de la tabla y sus hijas, con sangría por nivel. */
function FilasAnidadas({ fila, nivel }: { fila: FilaReporte; nivel: number }) {
  const esTope = nivel === 0;
  const prefijo = nivel === 0 ? "" : "└─ ";
  return (
    <>
      <tr className={esTope ? "tope" : undefined}>
        <td className="izq" style={{ paddingLeft: `${0.6 + nivel * 1.1}rem` }}>
          {prefijo}
          {fila.tipo === "subsecretaria" ? (
            <span className="uppercase text-[11px] tracking-wide font-semibold">
              {fila.nombre}
            </span>
          ) : fila.tipo === "propios_secretaria" ? (
            <span className="italic">{fila.nombre}</span>
          ) : (
            fila.nombre
          )}
        </td>
        <td className="num">{fila.proyectos}</td>
        <td className="num">{fila.finalizados}</td>
        <td className="num">{fila.en_ejecucion}</td>
        <td className="num">{fila.no_iniciados}</td>
        <td className="num">{fila.sin_datos}</td>
        <td className="num">{fila.indice_carga != null ? `${fila.indice_carga} %` : "—"}</td>
      </tr>
      {fila.hijos.map((h) => (
        <FilasAnidadas key={(h.unidad_id ?? h.nombre) + h.tipo} fila={h} nivel={nivel + 1} />
      ))}
    </>
  );
}

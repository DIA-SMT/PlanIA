import {
  faseInstitucional,
  type FilaProyecto,
  type FilaReporte,
  type ReporteUnidad,
} from "@/lib/reporte-trimestral";
import { formatFecha } from "@/lib/utils";
import { AnexoMetodologico } from "./anexo-metodologico";

const ORDINAL = ["", "Primer", "Segundo", "Tercer", "Cuarto"];

/**
 * Cómo se llama esta área según su nivel, con su artículo.
 *
 * 09.09, párrafo 760: donde el documento decía "área" tiene que decir
 * "Secretaría". No es un reemplazo a ciegas: el mismo informe se emite para
 * secretaría, subsecretaría, dirección y departamento, así que el rótulo sale
 * del nivel de la unidad. Y hace falta el artículo porque "Departamento" es
 * masculino y los otros tres femeninos: sin esto quedaría "de la Departamento".
 */
function rotuloNivel(nivel: number): { nombre: string; dela: string } {
  if (nivel === 0) return { nombre: "Secretaría", dela: "de la" };
  if (nivel === 1) return { nombre: "Subsecretaría", dela: "de la" };
  if (nivel === 2) return { nombre: "Dirección", dela: "de la" };
  return { nombre: "Departamento", dela: "del" };
}

/**
 * El documento del reporte trimestral, con los bloques en el orden de la
 * plantilla del cliente.
 *
 * Sirve para los tres niveles que pidieron: secretaría, subsecretaría y
 * dirección. La diferencia está en el bloque 4 — con estructura debajo se
 * muestra el árbol de áreas; una dirección muestra sus proyectos, porque 55 de
 * las 56 no tienen sub-unidades y un árbol tendría una sola fila igual al total.
 *
 * Está pensado para imprimirse: la hoja es A4 y el CSS de impresión saca la
 * barra lateral, la de arriba y los controles. El usuario hace Imprimir →
 * Guardar como PDF y el navegador genera el archivo.
 */
export function ReporteDocumento({
  reporte,
  trimestre,
  anio,
  children,
}: {
  reporte: ReporteUnidad;
  trimestre: number;
  anio: number;
  /** El bloque 3 (el análisis), que es interactivo y viene de afuera. */
  children?: React.ReactNode;
}) {
  const { totalUnidad: t, unidad } = reporte;
  const fase = faseInstitucional(t.pct);
  const nivel = unidad?.nivel ?? 0;
  const r = rotuloNivel(nivel);
  const conArbol = reporte.filas.length > 0;
  const conProyectos = reporte.proyectos.length > 0;

  return (
    <article className="hoja space-y-6">
      {/* ---------- Encabezado ---------- */}
      <header className="space-y-3 border-b border-border pb-4">
        <div>
          <h1 className="text-xl font-bold text-foreground leading-tight">
            Reporte de cumplimiento de metas operativas
          </h1>
          <p className="text-sm font-semibold text-primary mt-0.5">
            {ORDINAL[trimestre] ?? ""} trimestre {anio}
          </p>
        </div>

        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-xs">
          <div className="flex gap-2">
            <dt className="text-muted shrink-0">De:</dt>
            <dd className="text-foreground">Dirección de Planificación Estratégica</dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-muted shrink-0">Para:</dt>
            <dd className="text-foreground font-medium">{unidad?.nombre ?? "—"}</dd>
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
          1. Desempeño {r.dela} {r.nombre} en el contexto municipal
        </h2>
        <div className="rounded-lg border border-dashed border-warning/50 bg-warning/5 p-4 space-y-2">
          <p className="text-sm font-semibold text-warning">
            Falta una definición de Planificación Estratégica
          </p>
          <p className="text-xs text-foreground/90 leading-relaxed">
            Este bloque necesita la fórmula del <strong>aporte real</strong> al consolidado
            municipal. La plantilla dice que las 8 secretarías del Gabinete tienen 12,5 % cada
            una, pero el gráfico de ejemplo le asigna a Ambiente un aporte del 17,1 %, que con
            ese modelo es imposible: el techo por secretaría es 12,5.
          </p>
          <p className="text-xs text-foreground/90 leading-relaxed">
            También hace falta saber cuáles son esas 8 secretarías: PlanIA tiene 10 unidades de
            primer nivel. Y si el modelo aplica igual a subsecretarías y direcciones, que no
            tienen un reparto definido entre sí.
          </p>
          <p className="text-[11px] text-muted">
            Mientras tanto, lo que sí se puede afirmar: el municipio tiene{" "}
            <strong className="text-foreground tabular-nums">
              {reporte.totalMunicipio.proyectos}
            </strong>{" "}
            proyectos activos, y esta {r.nombre}{" "}
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
          2. Estado general de proyectos {r.dela} {r.nombre}
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
                <th>🔴 No Iniciados</th>
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
          Nivel de avance institucional {r.dela} {r.nombre}:{" "}
          <strong>
            {fase.icono} {fase.nombre}
          </strong>
          <sup className="text-primary font-bold">*</sup>
          {t.pct != null ? (
            <>
              {" "}
              — <span className="tabular-nums">{t.pct} %</span> de ejecución promedio, sobre{" "}
              {t.proyectos - t.sin_datos} de {t.proyectos} proyectos con datos cargados.
            </>
          ) : (
            <> — ningún proyecto {r.dela} {r.nombre} tiene datos cargados al corte.</>
          )}
        </p>

        {/* 09.09, párrafo 761: la definición de ESTA fase al pie, para no tener
            que ir al anexo. El texto sale de FASES, el mismo que usa el anexo. */}
        <p className="text-[11px] text-muted leading-relaxed">
          <span className="text-primary font-bold">*</span>{" "}
          <strong className="text-foreground">
            {fase.nombre} ({fase.rango}):
          </strong>{" "}
          {fase.texto}
        </p>
      </section>

      {/* ---------- Bloque 3 ----------
          Era "4." porque la plantilla del cliente numera así, con el análisis
          como 3 aunque va después. El 09.09 (párrafo 752) pidieron corregirlo:
          la numeración visible saltaba del 2 al 4. Se renumera en el lugar y no
          se mueve nada, porque el bloque del análisis no lleva número propio,
          así que el documento queda 1, 2, 3 sin reordenar contenido que el
          cliente ya vio.

          Sin la clase de salto de página desde el 09.09 (párrafo 755: todo
          continuado y solo el anexo en hoja aparte). */}
      <section className="space-y-2">
        <h2 className="text-base font-bold text-foreground">
          3.{" "}
          {conProyectos
            ? "Detalle de proyectos"
            : "Desempeño operativo por dependencias"}
        </h2>
        <p className="text-xs text-muted">
          {conProyectos
            ? `Estado de cada proyecto ${r.dela} ${r.nombre} y nivel de actualización de su información en el sistema.`
            : "Volumen de gestión y nivel de actualización de la información por cada dependencia de la estructura orgánica."}
        </p>

        {!conArbol && !conProyectos ? (
          <p className="text-sm text-muted border border-border rounded-lg px-3 py-4 text-center">
            Esta {r.nombre} no tiene proyectos cargados en el POA al momento del corte.
          </p>
        ) : conProyectos ? (
          <TablaProyectos proyectos={reporte.proyectos} total={t} />
        ) : (
          <div className="tabla-envoltorio">
            <table className="tabla-reporte">
              <thead>
                <tr>
                  <th className="izq">Estructura orgánica</th>
                  <th>Total</th>
                  <th>🟢</th>
                  <th>🟡</th>
                  <th>🔴</th>
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
                  <td className="izq">TOTAL {r.nombre.toUpperCase()}</td>
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

        {reporte.indiceCargaProvisorio && !conProyectos && (
          <p className="text-[11px] text-warning">
            * <strong>Índice de carga: definición provisoria.</strong> La plantilla incluye la
            columna pero no la define. Acá se calcula como la proporción de proyectos {r.dela} {r.nombre}
            con datos cargados, o sea el complemento de “Sin Datos”. Pendiente de confirmación
            de Planificación Estratégica.
          </p>
        )}
      </section>

      {/* ---------- El análisis (interactivo) ----------
          Sin salto de página desde el 09.09: abría hoja nueva y su hermano
          inmediato, el anexo, también, así que dos saltos seguidos dejaban una
          hoja casi vacía en el medio. Ahora solo el anexo abre página. */}
      {children && <div>{children}</div>}

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

const ICONO_ESTADO: Record<FilaProyecto["estado"], string> = {
  verde: "🟢",
  amarillo: "🟡",
  rojo: "🔴",
  sin_datos: "⚪",
};

/**
 * La tabla del bloque 4 en el reporte de una dirección: un proyecto por fila.
 *
 * Los rótulos salen del anexo metodológico del cliente y no de semaforoLabel del
 * sistema: para el mismo estado el sistema dice "No iniciado" y el documento
 * dice "No Iniciados", y en el informe manda el documento.
 */
function TablaProyectos({
  proyectos,
  total,
}: {
  proyectos: FilaProyecto[];
  total: { proyectos: number; indice_carga: number | null };
}) {
  const rotulo: Record<FilaProyecto["estado"], string> = {
    verde: "Finalizado",
    amarillo: "En Ejecución",
    rojo: "No Iniciado",
    sin_datos: "Sin Datos",
  };
  return (
    <div className="tabla-envoltorio">
      <table className="tabla-reporte">
        <thead>
          <tr>
            <th className="izq">Proyecto</th>
            <th className="izq">Estado</th>
            <th>Avance</th>
            <th>Metas</th>
            <th>Indicadores</th>
          </tr>
        </thead>
        <tbody>
          {proyectos.map((p, i) => (
            <tr key={`${p.codigo ?? ""}-${p.nombre}-${i}`}>
              <td className="izq">
                {p.nombre}
                {p.unidad_nombre && (
                  <span className="text-muted"> · {p.unidad_nombre}</span>
                )}
              </td>
              <td className="izq whitespace-nowrap">
                <span aria-hidden="true">{ICONO_ESTADO[p.estado]}</span> {rotulo[p.estado]}
              </td>
              <td className="num">{p.pct != null ? `${p.pct} %` : "—"}</td>
              <td className="num">
                {p.metas_con_datos}/{p.metas}
              </td>
              <td className="num">
                {p.indicadores_con_datos}/{p.indicadores}
              </td>
            </tr>
          ))}
          <tr className="total">
            <td className="izq">TOTAL ÁREA</td>
            <td className="izq" />
            <td className="num" />
            <td className="num" />
            <td className="num">
              {total.indice_carga != null ? `${total.indice_carga} % carga` : "—"}
            </td>
          </tr>
        </tbody>
      </table>
      <p className="text-[11px] text-muted mt-1.5">
        Metas e indicadores: cuántos tienen datos cargados sobre el total del proyecto.
      </p>
    </div>
  );
}

/** Una fila del árbol de áreas y sus hijas, con sangría por nivel. */
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

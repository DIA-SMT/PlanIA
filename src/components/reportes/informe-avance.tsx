import { formatFecha, avanceGlobalPorConteo } from "@/lib/utils";
import type { ReporteUnidad } from "@/lib/reporte-trimestral";

/**
 * INFORME DE AVANCE DE LA PLANIFICACIÓN OPERATIVA ANUAL — 18.09, párrafos 956
 * a 1013.
 *
 * Reemplaza a los dos modelos del 15.09 ("Informe Ejecutivo de Seguimiento y
 * Desempeño" y "Informe de Seguimiento de Gestión"). Es UNO SOLO: el documento
 * que mandaron transcribe un único informe donde los rótulos cambian según
 * quién lo genere —"la Secretaría / Subsecretaría / Dirección (depende quien
 * genere el informe)"—, así que eso es lo que se hizo.
 *
 * Tres secciones y nada más. Se van, porque el modelo nuevo no las tiene: el
 * Anexo I metodológico, las dos secciones que redactaba Planificación, la
 * comparación contra el municipio o la subsecretaría, los indicadores clave,
 * la completitud de metas e indicadores y la aclaración sobre la fecha de los
 * datos, que pidieron "ELIMINAR COMPLETO" (párrafo 967).
 */

const ORDINAL = ["", "Primer", "Segundo", "Tercer", "Cuarto"];

/** Cómo se nombra el área según su nivel, para los rótulos del texto. */
function rotulos(nivel: number) {
  if (nivel === 0) return { titulo: "SECRETARÍA", el: "la Secretaría" };
  if (nivel === 1) return { titulo: "SUBSECRETARÍA", el: "la Subsecretaría" };
  return { titulo: "DIRECCIÓN", el: "la Dirección" };
}

export function InformeAvance({
  reporte,
  trimestre,
  anio,
  emitidoEl,
}: {
  reporte: ReporteUnidad;
  trimestre: number;
  anio: number;
  emitidoEl: string;
}) {
  const t = reporte.totalUnidad;
  const nivel = reporte.unidad?.nivel ?? 0;
  const r = rotulos(nivel);
  const pctDe = (n: number) => (t.proyectos === 0 ? 0 : Math.round((n / t.proyectos) * 100));

  // El mismo número que el medidor "Cumplimiento global del POA" del Panel
  // Ejecutivo: finalizados + en ejecución sobre el total. Se calcula con la
  // misma función que usa el Panel para que no puedan separarse nunca.
  const avance = avanceGlobalPorConteo({
    verde: t.finalizados,
    amarillo: t.en_ejecucion,
    rojo: t.no_iniciados,
    sin_datos: t.sin_datos,
  }) ?? 0;

  const filas = [
    { icono: "🟢", nombre: "Finalizados", cantidad: t.finalizados },
    { icono: "🟡", nombre: "En ejecución", cantidad: t.en_ejecucion },
    { icono: "🔴", nombre: "No iniciados", cantidad: t.no_iniciados },
    { icono: "⚪", nombre: "Sin datos", cantidad: t.sin_datos },
  ];

  return (
    <article className="hoja space-y-6">
      {/* ---------- Encabezado ---------- */}
      <header className="space-y-3 border-b border-border pb-4">
        <div>
          <h1 className="text-xl font-bold text-foreground leading-tight uppercase">
            Informe de Avance de la Planificación Operativa Anual
          </h1>
          <p className="text-[11px] text-muted mt-0.5">
            Sistema de Planificación Estratégica y Monitoreo Municipal — SIPEM
          </p>
          <p className="text-sm font-semibold text-primary mt-1">
            {ORDINAL[trimestre] ?? ""} trimestre {anio}
          </p>
        </div>

        {/* Las tres líneas del modelo, siempre las tres. La que no aplica queda
            con una raya: el informe de una Secretaría igual dice "Dirección: —",
            que es como está escrito en el documento. */}
        <dl className="space-y-1 text-xs">
          {[
            { rotulo: "Secretaría", valor: nivel === 0 ? reporte.unidad?.nombre : reporte.ruta.secretaria },
            { rotulo: "Subsecretaría", valor: nivel === 1 ? reporte.unidad?.nombre : reporte.ruta.subsecretaria },
            { rotulo: "Dirección", valor: nivel >= 2 ? reporte.unidad?.nombre : null },
            {
              rotulo: "Fecha de corte",
              valor: formatFecha(reporte.corte ? reporte.corte.fecha_corte : emitidoEl),
            },
          ].map((f) => (
            <div key={f.rotulo} className="flex gap-2">
              <dt className="text-muted shrink-0 w-28">{f.rotulo}:</dt>
              <dd className="text-foreground font-medium">{f.valor ?? "—"}</dd>
            </div>
          ))}
        </dl>
      </header>

      {/* ---------- 1 ---------- */}
      <section className="space-y-2">
        <h2 className="text-base font-bold text-foreground">
          1. Desempeño de la {r.titulo.toLowerCase()} en el contexto municipal
        </h2>
        {/* 21.09: "aquí debería estar el 66 % que dice el panel ejecutivo".
            Es el "Cumplimiento global del POA" del Panel: los proyectos
            finalizados más los que están en ejecución, sobre el total del área.
            No es el promedio de cuánto avanzó cada uno.

            Por eso queda la frase tal como la escribieron en el modelo —"sobre
            el total de los proyectos planificados"—: con esta cuenta el
            denominador SÍ es el total, incluidos los no iniciados y los que no
            tienen datos, que aportan cero.

            Es el tercer número que se probó acá en cuatro días: el modelo del
            18.09 pedía el promedio sobre el total (45 % en Secretaría General),
            después que coincidiera con el sistema (48 %), y ahora que coincida
            con el Panel (66 %). Este último es el único que se puede verificar
            mirando las dos pantallas juntas. */}
        <p className="text-xs text-foreground/90 leading-relaxed">
          De acuerdo con los registros disponibles en SIPEM al momento del corte, {r.el}{" "}
          presenta un avance del <strong className="tabular-nums">{avance} %</strong> sobre el
          total de los proyectos planificados.
        </p>
      </section>

      {/* ---------- 2 ---------- */}
      <section className="space-y-2">
        <h2 className="text-base font-bold text-foreground">2. Estado general de los proyectos</h2>
        <p className="text-xs text-foreground/90 leading-relaxed">
          {r.el.charAt(0).toUpperCase() + r.el.slice(1)} registra{" "}
          <strong className="tabular-nums">{t.proyectos}</strong> proyectos en SIPEM. El estado
          de avance de cada uno de los proyectos es el siguiente:
        </p>

        <div className="tabla-envoltorio">
          <table className="tabla-reporte">
            <thead>
              <tr>
                <th className="izq">Estado</th>
                <th>Cantidad</th>
                <th>Porcentaje</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => (
                <tr key={f.nombre}>
                  <td className="izq">
                    {f.icono} {f.nombre}
                  </td>
                  <td className="num">{f.cantidad}</td>
                  <td className="num">{pctDe(f.cantidad)} %</td>
                </tr>
              ))}
              <tr className="font-semibold">
                <td className="izq">TOTAL</td>
                <td className="num">{t.proyectos}</td>
                <td className="num">100 %</td>
              </tr>
            </tbody>
          </table>
        </div>

        <ul className="text-xs text-foreground/90 space-y-0.5">
          {filas.map((f) => (
            <li key={f.nombre}>
              Los proyectos {f.nombre.toLowerCase()} representan el{" "}
              <strong className="tabular-nums">{pctDe(f.cantidad)} %</strong> del total
              registrado.
            </li>
          ))}
        </ul>
      </section>

      {/* ---------- 3 ---------- */}
      <section className="space-y-2">
        <h2 className="text-base font-bold text-foreground">3. Detalle de proyectos</h2>
        <p className="text-xs text-foreground/90 leading-relaxed">
          En el siguiente apartado se puede visualizar el nombre y el estado de cada uno de los
          proyectos de su {r.titulo.toLowerCase()}.
        </p>

        {reporte.proyectos.length === 0 ? (
          <p className="text-sm text-muted border border-border rounded-lg px-3 py-4 text-center">
            No hay proyectos cargados en SIPEM para esta área al momento del corte.
          </p>
        ) : (
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
                    <td>{ESTADO[p.estado] ?? p.estado}</td>
                    <td className="num">{p.pct != null ? `${p.pct}%` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

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

/** Los mismos rótulos con emoji que usa el modelo del documento. */
const ESTADO: Record<string, string> = {
  verde: "🟢 Finalizado",
  amarillo: "🟡 En ejecución",
  rojo: "🔴 No iniciado",
  sin_datos: "⚪ Sin datos",
};

import { formatFecha } from "@/lib/utils";
import type { ConteoEstados } from "@/lib/reporte-trimestral";

/**
 * Piezas que comparten los dos modelos de informe (15.09).
 *
 * Están acá y no duplicadas en cada uno para que la tabla de estados, los
 * colores y la aclaración de fecha digan exactamente lo mismo en el informe de
 * una Secretaría y en el de una Dirección. Si se separan, a la primera
 * corrección uno de los dos queda viejo.
 */

const ICONO: Record<string, string> = {
  verde: "🟢",
  amarillo: "🟡",
  rojo: "🔴",
  sin_datos: "⚪",
};

const ETIQUETA: Record<string, string> = {
  verde: "Finalizado",
  amarillo: "En ejecución",
  rojo: "No iniciado",
  sin_datos: "Sin datos",
};

// El plural va escrito y no agregando una "s": "En ejecución" y "Sin datos" no
// se pluralizan así.
const PLURAL: Record<string, string> = {
  verde: "Finalizados",
  amarillo: "En ejecución",
  rojo: "No iniciados",
  sin_datos: "Sin datos",
};

/** Un porcentaje, o una raya cuando no hay con qué calcularlo. */
export function Pct({ v }: { v: number | null }) {
  return <strong className="tabular-nums">{v != null ? `${v} %` : "—"}</strong>;
}

export function EstadoPunto({ estado }: { estado: keyof typeof ICONO }) {
  return (
    <span className="whitespace-nowrap">
      {ICONO[estado]} {ETIQUETA[estado]}
    </span>
  );
}

/** La tabla de estados con cantidad y porcentaje, igual en los dos modelos. */
export function TablaEstados({ conteo }: { conteo: ConteoEstados }) {
  const t = conteo;
  const pct = (n: number) => (t.proyectos === 0 ? "—" : `${Math.round((n / t.proyectos) * 100)} %`);

  const filas: [string, number][] = [
    ["verde", t.finalizados],
    ["amarillo", t.en_ejecucion],
    ["rojo", t.no_iniciados],
    ["sin_datos", t.sin_datos],
  ];

  return (
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
          {filas.map(([estado, n]) => (
            <tr key={estado}>
              <td className="izq">
                {ICONO[estado]} {PLURAL[estado]}
              </td>
              <td className="num">{n}</td>
              <td className="num">{pct(n)}</td>
            </tr>
          ))}
          <tr className="total">
            <td className="izq">TOTAL</td>
            <td className="num">{t.proyectos}</td>
            <td className="num">{t.proyectos === 0 ? "—" : "100 %"}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

/**
 * La aclaración de a qué fecha corresponden las cifras.
 *
 * Se decidió el 11.09, cuando el informe del segundo trimestre tuvo que salir
 * con los datos del día: un documento impreso que dice "segundo trimestre" con
 * números de septiembre y sin marca se lee como si fueran los del cierre. Va
 * impresa, no como aviso de pantalla.
 */
export function AclaracionFecha({
  origen,
  emitidoEl,
  cierreDelTrimestre,
}: {
  origen: "corte" | "vivo";
  emitidoEl: string;
  cierreDelTrimestre: string;
}) {
  if (origen !== "vivo") return null;
  return (
    <div className="rounded border border-warning/40 bg-warning/5 px-3 py-2 space-y-1">
      <p className="text-xs font-semibold text-warning">Aclaración sobre la fecha de los datos</p>
      <p className="text-[11px] text-foreground/90 leading-relaxed">
        Las cifras de este informe corresponden al <strong>{formatFecha(emitidoEl)}</strong>, que
        es el día de su emisión, y <strong>no al cierre del trimestre</strong> (
        {formatFecha(cierreDelTrimestre)}). El sistema no conserva un registro de cómo estaba el
        POA a esa fecha, así que el estado del cierre no se puede reconstruir. Entre una fecha y
        la otra hubo actualizaciones de metas e indicadores, de modo que estos valores difieren
        de los que hubieran correspondido al cierre.
      </p>
      <p className="text-[11px] text-muted leading-relaxed">
        A partir del cierre del tercer trimestre, cada informe se emite sobre el estado guardado
        el día del cierre y sus cifras no vuelven a cambiar.
      </p>
    </div>
  );
}

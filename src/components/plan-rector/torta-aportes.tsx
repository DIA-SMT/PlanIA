import type { AporteAmbito } from "@/lib/plan-rector-comun";

/**
 * Cuánto aporta cada ámbito al avance del Plan Rector — 13.10.
 *
 * "Usaría el mismo gráfico de cumplimiento global y haría uno circular al lado
 * que indique el aporte en cada ámbito. Es decir vamos cumpliendo un 80 % y cada
 * ámbito aporta x. Y nada más."
 *
 * Es un anillo de 0 a 100: cada ámbito ocupa los puntos que aporta, con su
 * color del documento del Plan Rector, y lo que falta para 100 queda gris. Así
 * el anillo lleno hasta donde llega el color es el mismo número del medidor, y
 * cada porción es lo que pone cada ámbito. La leyenda dice los puntos.
 */
export function TortaAportes({
  ambitos,
  total,
}: {
  ambitos: AporteAmbito[];
  total: number | null;
}) {
  const tam = 200;
  const grosor = 28;
  const r = (tam - grosor) / 2;
  const c = 2 * Math.PI * r;

  // Cada porción arranca donde terminan las anteriores.
  const conAporte = ambitos.filter((a) => (a.aporte ?? 0) > 0);
  const largos = conAporte.map((a) => (c * (a.aporte ?? 0)) / 100);
  const porciones = conAporte.map((a, i) => ({
    a,
    largo: largos[i],
    desde: largos.slice(0, i).reduce((s, l) => s + l, 0),
  }));

  const resumen =
    total == null
      ? "Sin avance registrado"
      : `${total} % de avance: ` +
        ambitos.map((a) => `${a.codigo ?? a.nombre} aporta ${a.aporte ?? 0}`).join(", ");

  return (
    <div className="flex flex-col sm:flex-row items-center gap-5">
      <svg
        viewBox={`0 0 ${tam} ${tam}`}
        className="w-44 h-44 shrink-0"
        role="img"
        aria-label={resumen}
      >
        <g transform={`rotate(-90 ${tam / 2} ${tam / 2})`}>
          <circle
            cx={tam / 2}
            cy={tam / 2}
            r={r}
            fill="none"
            strokeWidth={grosor}
            className="stroke-border"
          />
          {porciones.map(({ a, largo, desde }) => (
            <circle
              key={a.codigo ?? a.nombre}
              cx={tam / 2}
              cy={tam / 2}
              r={r}
              fill="none"
              strokeWidth={grosor}
              stroke={a.color ?? "#9CA3AF"}
              strokeDasharray={`${largo} ${c - largo}`}
              strokeDashoffset={-desde}
            >
              <title>{`${a.codigo ?? ""} ${a.nombre}: aporta ${a.aporte} puntos`}</title>
            </circle>
          ))}
        </g>
        <text
          x={tam / 2}
          y={tam / 2 + 4}
          textAnchor="middle"
          className="fill-foreground"
          fontSize="34"
          fontWeight="700"
        >
          {total != null ? `${total}%` : "—"}
        </text>
        <text x={tam / 2} y={tam / 2 + 26} textAnchor="middle" className="fill-muted" fontSize="12">
          suma de los aportes
        </text>
      </svg>

      <ul className="space-y-2 min-w-0 flex-1">
        {ambitos.map((a) => (
          <li key={a.codigo ?? a.nombre} className="flex items-center gap-2 text-xs">
            <span
              className="h-2.5 w-2.5 rounded-full shrink-0"
              style={{ backgroundColor: a.color ?? "#9CA3AF" }}
            />
            <span className="flex-1 min-w-0 text-foreground/90 line-clamp-1" title={a.nombre}>
              {a.codigo && <strong className="font-semibold">{a.codigo}</strong>} {a.nombre}
            </span>
            <span className="shrink-0 tabular-nums text-foreground font-semibold">
              {a.pct == null ? (
                <span className="text-muted/70 font-normal">sin avance</span>
              ) : (
                `${a.aporte} ${a.aporte === 1 ? "punto" : "puntos"}`
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

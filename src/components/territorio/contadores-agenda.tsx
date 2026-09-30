import Link from "next/link";

/**
 * Los cuatro contadores de la maqueta del 22.09.
 *
 * Están en el inicio, en la agenda y en el mapa, así que viven en un solo
 * lugar: son la misma pregunta —qué hay que mirar hoy— y tres copias se
 * responderían distinto el día que cambie una definición.
 *
 * Cada uno lleva a la agenda ya filtrada por lo que cuenta: un número que no se
 * puede abrir obliga a rearmar el filtro a mano.
 */
export function ContadoresAgenda({
  resumen,
  hoy,
}: {
  resumen: { hoy: number; proximas48: number; porConfirmar: number; modificadas: number };
  hoy: string;
}) {
  const contadores: {
    rotulo: string;
    valor: number;
    a?: Record<string, string>;
    href?: string;
  }[] = [
    { rotulo: "Actividades de hoy", valor: resumen.hoy, a: { vista: "dia", fecha: hoy } },
    { rotulo: "Próximas 48 hs", valor: resumen.proximas48, a: { vista: "semana", fecha: hoy } },
    {
      rotulo: "Pendientes de confirmación",
      valor: resumen.porConfirmar,
      // Este no va a la agenda filtrada sino a "requiere atención", que desde
      // la etapa 5 responde exactamente esa pregunta y ademas dice por que.
      href: "/territorio/atencion",
    },
    { rotulo: "Modificadas hoy", valor: resumen.modificadas, a: { vista: "dia", fecha: hoy } },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {contadores.map((c) => (
        <Link
          key={c.rotulo}
          href={c.href ?? { pathname: "/territorio/agenda", query: c.a }}
          className="rounded-xl border border-border bg-surface p-4 hover:border-primary/40 transition-colors"
        >
          <p className="text-xs text-muted">{c.rotulo}</p>
          <p
            className={`text-3xl font-bold mt-1 tabular-nums ${
              c.valor === 0 ? "text-foreground/40" : "text-foreground"
            }`}
          >
            {c.valor}
          </p>
        </Link>
      ))}
    </div>
  );
}

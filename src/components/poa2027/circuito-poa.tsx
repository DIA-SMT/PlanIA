import Link from "next/link";
import type { AreaDelPoa, Observacion } from "@/lib/poa-2027";
import { EnviarPoa, ObservarFicha, ResolverObservacion } from "./circuito-acciones";

/**
 * El POA del área y lo que le llegó de abajo — 25.09.
 *
 * "En la pantalla de las secretarías debería aparecerle el documento completo:
 * lo suyo más lo que cada dirección envió."
 *
 * Un área que no tiene a nadie abajo —una dirección— solo ve su bloque y el
 * botón de enviar. Una subsecretaría ve el suyo y el de sus direcciones, y su
 * propio botón para subirlo a la secretaría. La secretaría ve todo y no envía a
 * nadie: ahí termina el camino.
 */
export function CircuitoPoa({
  propia,
  recibidas,
  destino,
  observaciones,
  puedeObservar,
}: {
  propia: AreaDelPoa;
  recibidas: AreaDelPoa[];
  destino: { id: string; nombre: string } | null;
  observaciones: Observacion[];
  puedeObservar: boolean;
}) {
  const obsDe = (fichaId: string) => observaciones.filter((o) => o.ficha_id === fichaId && !o.resuelta_at);

  const totalFichas = propia.fichas.length + recibidas.reduce((a, r) => a + r.fichas.length, 0);
  const pendientes = recibidas.filter((r) => !r.enviado);

  return (
    <div className="space-y-6">
      {/* ---------- Mi POA ---------- */}
      <section className="rounded-xl border border-border bg-surface p-4 space-y-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-sm font-bold text-foreground">Mi POA · {propia.nombre}</h2>
            <p className="text-xs text-muted mt-0.5">
              {propia.fichas.length} {propia.fichas.length === 1 ? "ficha" : "fichas"} cargadas
            </p>
          </div>
          <EnviarPoa
            unidadId={propia.id}
            destino={destino?.nombre ?? null}
            enviado={propia.enviado}
            enviadoEl={propia.enviado_at}
            sinFichas={propia.fichas.length === 0}
          />
        </div>

        {propia.tocadoDespues && (
          <p className="text-[11px] text-warning">
            Editaste alguna ficha después de enviar. Quien la recibió ve la versión nueva.
          </p>
        )}

        <ListaFichas area={propia} obsDe={obsDe} puedeObservar={false} />
      </section>

      {/* ---------- Lo que llegó de abajo ---------- */}
      {recibidas.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-baseline justify-between gap-3 flex-wrap">
            <h2 className="text-sm font-bold text-foreground">
              Lo que mandaron las áreas que dependen de {propia.nombre}
            </h2>
            <p className="text-xs text-muted">
              {totalFichas} fichas en total
              {pendientes.length > 0 && ` · ${pendientes.length} áreas todavía no enviaron`}
            </p>
          </div>

          {recibidas.map((area) => (
            <div key={area.id} className="rounded-xl border border-border bg-surface p-4 space-y-2">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <span
                    className={`h-2 w-2 rounded-full ${area.enviado ? "bg-success" : "bg-muted/40"}`}
                  />
                  <p className="text-sm font-medium text-foreground">{area.nombre}</p>
                  <span className="text-[10px] text-muted uppercase tracking-wider">
                    {area.nivel === 1 ? "subsecretaría" : area.nivel === 2 ? "dirección" : "área"}
                  </span>
                </div>
                <p className="text-[11px] text-muted">
                  {area.enviado
                    ? `Enviado${area.enviado_at ? ` el ${new Date(area.enviado_at).toLocaleDateString("es-AR")}` : ""}`
                    : "Todavía no lo envió"}
                  {area.tocadoDespues && (
                    <span className="text-warning"> · editó algo después de enviar</span>
                  )}
                </p>
              </div>

              <ListaFichas area={area} obsDe={obsDe} puedeObservar={puedeObservar} />
            </div>
          ))}
        </section>
      )}
    </div>
  );
}

function ListaFichas({
  area,
  obsDe,
  puedeObservar,
}: {
  area: AreaDelPoa;
  obsDe: (fichaId: string) => Observacion[];
  puedeObservar: boolean;
}) {
  if (area.fichas.length === 0) {
    return <p className="text-xs text-muted/70">Sin fichas cargadas.</p>;
  }

  return (
    <ul className="divide-y divide-border border-t border-border">
      {area.fichas.map((f) => {
        const obs = obsDe(f.id);
        return (
          <li key={f.id} className="py-2 space-y-1.5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm text-foreground">
                  {f.codigo && <span className="text-muted font-mono text-xs mr-2">{f.codigo}</span>}
                  {f.programa}
                </p>
                {f.meta_anual && (
                  <p className="text-[11px] text-muted mt-0.5 line-clamp-1">Meta: {f.meta_anual}</p>
                )}
              </div>
              <div className="shrink-0 text-right">
                {puedeObservar ? (
                  <ObservarFicha fichaId={f.id} cuantas={obs.length} />
                ) : obs.length > 0 ? (
                  <span className="text-[11px] text-warning">
                    {obs.length} observación{obs.length === 1 ? "" : "es"}
                  </span>
                ) : null}
              </div>
            </div>

            {obs.length > 0 && (
              <ul className="space-y-1 pl-3 border-l-2 border-warning/30">
                {obs.map((o) => (
                  <li key={o.id} className="flex items-start gap-2">
                    <p className="text-[11px] text-foreground/80 flex-1">
                      {o.texto}
                      <span className="text-muted/70">
                        {" "}
                        — {o.autor_email ?? "alguien"},{" "}
                        {new Date(o.created_at).toLocaleDateString("es-AR")}
                      </span>
                    </p>
                    <ResolverObservacion id={o.id} />
                  </li>
                ))}
              </ul>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** El enlace al documento consolidado, cuando haya algo que mostrar. */
export function VerDocumento({ hayFichas }: { hayFichas: boolean }) {
  if (!hayFichas) return null;
  return (
    <Link href="/poa-2027/exportar" className="text-xs text-primary hover:underline">
      Ver el documento completo →
    </Link>
  );
}

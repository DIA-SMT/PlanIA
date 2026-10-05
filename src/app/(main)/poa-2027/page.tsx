import Link from "next/link";
import { getPerfilActual } from "@/lib/auth";
import {
  getPoaDelArea,
  getObservaciones,
  getResumenPoaParaPlanificacion,
  ANIO_POA,
} from "@/lib/poa-2027";
import { TraerTodasBoton } from "@/components/poa2027/traer-todas-boton";
import { DocumentoPoa } from "@/components/poa2027/documento-poa";
import { EnviarPoa } from "@/components/poa2027/circuito-acciones";

export const revalidate = 0;

/**
 * POA 2027 — el documento, editable, en la pantalla principal.
 *
 * 28.09: "en esta pantalla me gustaría que aparezca ya el pdf editable". Antes
 * acá había tres tarjetas y el documento estaba a un clic de distancia, en
 * /poa-2027/exportar. Ahora la pantalla ES el POA: arriba las acciones, abajo el
 * documento con lo propio y lo que mandaron las áreas de abajo.
 *
 * El circuito —quién envió y quién no, y las observaciones— tampoco está en un
 * bloque aparte: cada área lo dice en su encabezado dentro del documento, y las
 * observaciones cuelgan de la ficha que observan.
 */
export default async function Poa2027Page() {
  const perfil = await getPerfilActual();

  const puedeCargar =
    perfil?.rol === "director" ||
    perfil?.rol === "subsecretario" ||
    perfil?.rol === "secretario" ||
    perfil?.rol === "coordinador" ||
    perfil?.rol === "admin_funcional";

  let circuito: Awaited<ReturnType<typeof getPoaDelArea>> | null = null;
  let observaciones: Awaited<ReturnType<typeof getObservaciones>> = [];
  let error: string | null = null;

  if (perfil?.unidad_id) {
    try {
      circuito = await getPoaDelArea(perfil.unidad_id);
      const ids = [
        ...(circuito.propia?.fichas ?? []),
        ...circuito.recibidas.flatMap((r) => r.fichas),
      ].map((f) => f.id);
      observaciones = await getObservaciones(ids);
    } catch (e) {
      // La migración 053 puede no estar aplicada: el código se despliega solo.
      error = e instanceof Error ? e.message : String(e);
    }
  }

  // 05.10: Planificación Estratégica no tiene área, así que acá no veía nada y
  // el cartel le pedía que le escribiera a Planificación Estratégica. Ahora ve
  // todas las áreas, y desde acá puede traer los proyectos del 2026 de las que
  // todavía no lo hicieron: "la idea es que ustedes carguen y nosotros editamos".
  const esPlanificacion = perfil?.rol === "admin_funcional";
  let resumen: Awaited<ReturnType<typeof getResumenPoaParaPlanificacion>> | null = null;
  if (esPlanificacion) {
    try {
      resumen = await getResumenPoaParaPlanificacion();
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
  }

  const propia = circuito?.propia;
  return (
    <div className="space-y-6 max-w-4xl">
      <div className="no-imprimir space-y-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">POA {ANIO_POA}</h1>
          <p className="text-sm text-muted mt-1">
            {puedeCargar
              ? "Este es el documento que se va a enviar. Hacé clic sobre cualquier texto de tus fichas para corregirlo acá mismo."
              : "El Plan Operativo Anual 2027, armado con las fichas PRISMA de cada área."}
          </p>
        </div>

        {puedeCargar && perfil?.unidad_id && (
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/poa-2027/mis-fichas"
              className="text-sm bg-primary/10 text-primary border border-primary/30 rounded-lg px-4 py-2 hover:bg-primary/20"
            >
              Editar mi POA
            </Link>
            <a
              href="/api/poa-2027/exportar"
              className="text-sm border border-border rounded-lg px-4 py-2 hover:bg-surface-hover"
            >
              Descargar Word
            </a>
          </div>
        )}

        {propia && (
          <div className="rounded-xl border border-border bg-surface p-4">
            <EnviarPoa
              unidadId={propia.id}
              destino={circuito?.destino?.nombre ?? null}
              enviado={propia.enviado}
              enviadoEl={propia.enviado_at}
              sinFichas={propia.fichas.length === 0}
            />
            {propia.tocadoDespues && (
              <p className="text-[11px] text-warning mt-2">
                Editaste alguna ficha después de enviar. Quien la recibió ve la versión nueva.
              </p>
            )}
          </div>
        )}
      </div>

      {error ? (
        <div className="no-imprimir rounded-xl border border-danger/30 bg-danger/5 p-4">
          <p className="text-sm font-semibold text-danger">No se pudo armar el documento</p>
          <p className="text-xs text-muted mt-1 font-mono break-all">{error}</p>
          <p className="text-xs text-muted mt-2">
            Si dice que no existe la tabla, falta aplicar la migración 053.
          </p>
        </div>
      ) : esPlanificacion && resumen ? (
        <section className="rounded-xl border border-border bg-surface p-5 space-y-4">
          <div>
            <h2 className="text-sm font-bold text-foreground">Todas las áreas</h2>
            <p className="text-xs text-muted mt-1 leading-relaxed">
              {resumen.sinTraer > 0
                ? `Hay ${resumen.sinTraer} proyectos del 2026 de ${resumen.areasSinTraer} ${resumen.areasSinTraer === 1 ? "área" : "áreas"} que todavía no están en el POA ${ANIO_POA}.`
                : `Todos los proyectos del 2026 ya están en el POA ${ANIO_POA}, como fichas aceptadas o propuestas.`}{" "}
              Las propuestas no entran en el documento de un área hasta que alguien las acepta.
            </p>
          </div>
          <TraerTodasBoton sinTraer={resumen.sinTraer} areasSinTraer={resumen.areasSinTraer} />
          <div className="overflow-x-auto border border-border rounded-lg">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border bg-surface-hover/40 text-muted">
                  <th className="text-left font-medium px-3 py-2">Área</th>
                  <th className="text-right font-medium px-3 py-2" title="Proyectos activos del POA 2026">Proyectos 2026</th>
                  <th className="text-right font-medium px-3 py-2" title="Entran en el documento">Aceptadas</th>
                  <th className="text-right font-medium px-3 py-2" title="Esperando que el área las revise">Propuestas</th>
                  <th className="text-right font-medium px-3 py-2" title="Proyectos del 2026 que todavía no se trajeron">Sin traer</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {resumen.areas.map((a) => (
                  <tr key={a.unidad_id}>
                    <td className="px-3 py-1.5 text-foreground">{a.nombre}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-muted">{a.proyectos2026}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{a.aceptadas || "—"}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{a.propuestas || "—"}</td>
                    <td className={`px-3 py-1.5 text-right tabular-nums ${a.sinTraer > 0 ? "text-warning" : "text-muted/50"}`}>
                      {a.sinTraer || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : !perfil?.unidad_id ? (
        <div className="rounded-xl border border-border bg-surface p-6 text-center">
          <p className="text-sm text-muted">
            Tu perfil no tiene un área asignada, así que no hay un POA que mostrar. Escribile a
            Planificación Estratégica.
          </p>
        </div>
      ) : (
        propia && (
          <DocumentoPoa
            propia={propia}
            recibidas={circuito?.recibidas ?? []}
            anio={ANIO_POA}
            observaciones={observaciones}
            // La secretaría no corrige la ficha de una dirección: la observa.
            puedeObservar={puedeCargar}
          />
        )
      )}
    </div>
  );
}

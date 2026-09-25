import Link from "next/link";
import { getPerfilActual } from "@/lib/auth";
import { getPoaDelArea, getObservaciones } from "@/lib/poa-2027";
import { CircuitoPoa } from "@/components/poa2027/circuito-poa";

export const revalidate = 0;

/**
 * POA 2027 — la carga de fichas y el circuito de envío entre áreas.
 *
 * 25.09: "las POA se arman por secretarías, entonces cada secretaría debería
 * tomar los proyectos suyos y de cada dirección que dependen de ella", y "en la
 * pantalla de las secretarías debería aparecerle el documento completo: lo suyo
 * más lo que cada dirección envió".
 *
 * El tercer botón era "Generar POA 2027" y bajaba un documento con las fichas
 * propias nomás. Ahora el envío es un acto del circuito —"el botón de la derecha
 * que diga guardar o enviar a POA"— y vive en el bloque de abajo, junto a lo que
 * cada área mandó. El documento sigue estando, como enlace.
 */
export default async function Poa2027Landing() {
  const perfil = await getPerfilActual();

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

  const puedeCargar =
    perfil?.rol === "director" ||
    perfil?.rol === "subsecretario" ||
    perfil?.rol === "secretario" ||
    perfil?.rol === "coordinador" ||
    perfil?.rol === "admin_funcional";

  const cantidadFichas = circuito?.propia?.fichas.length ?? 0;

  return (
    <div className="space-y-8 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-foreground">POA 2027 — Ficha PRISMA</h1>
        <p className="text-sm text-muted mt-1">
          Planificación de proyectos para el Plan Operativo Anual 2027 mediante la metodología
          PRISMA.
        </p>
      </div>

      {puedeCargar ? (
        <section className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Link
            href="/poa-2027/cargar"
            className="rounded-xl border border-primary/30 bg-primary/5 p-5 hover:bg-primary/10 transition-colors text-center"
          >
            <div className="text-2xl mb-2">➕</div>
            <p className="text-sm font-semibold text-foreground">Cargar ficha nueva</p>
            <p className="text-[10px] text-muted mt-1">Crear una ficha PRISMA</p>
          </Link>
          <Link
            href="/poa-2027/mis-fichas"
            className="rounded-xl border border-border bg-surface p-5 hover:border-primary/40 transition-colors text-center"
          >
            <div className="text-2xl mb-2">📑</div>
            <p className="text-sm font-semibold text-foreground">Mis fichas</p>
            <p className="text-[10px] text-muted mt-1">
              {cantidadFichas} {cantidadFichas === 1 ? "ficha cargada" : "fichas cargadas"} · ver y
              editar
            </p>
          </Link>
          <Link
            href="/poa-2027/exportar"
            className="rounded-xl border border-border bg-surface p-5 hover:border-primary/40 transition-colors text-center"
          >
            <div className="text-2xl mb-2">📥</div>
            <p className="text-sm font-semibold text-foreground">Ver el documento</p>
            <p className="text-[10px] text-muted mt-1">El POA armado, para revisar y bajar</p>
          </Link>
        </section>
      ) : (
        <div className="rounded-xl border border-border bg-surface p-6 text-center">
          <p className="text-sm text-muted">
            La carga de fichas PRISMA está disponible para las áreas que planifican. Con tu rol
            actual podés ver los documentos de referencia.
          </p>
        </div>
      )}

      {error ? (
        <div className="rounded-xl border border-danger/30 bg-danger/5 p-4">
          <p className="text-sm font-semibold text-danger">No se pudo leer el circuito del POA</p>
          <p className="text-xs text-muted mt-1 font-mono break-all">{error}</p>
          <p className="text-xs text-muted mt-2">
            Si dice que no existe la tabla, falta aplicar la migración 053.
          </p>
        </div>
      ) : (
        circuito?.propia && (
          <CircuitoPoa
            propia={circuito.propia}
            recibidas={circuito.recibidas}
            destino={circuito.destino}
            observaciones={observaciones}
            // La secretaría no corrige la ficha de una dirección: la observa.
            // El área dueña no se observa a sí misma.
            puedeObservar={puedeCargar}
          />
        )
      )}
    </div>
  );
}

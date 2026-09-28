import { redirect } from "next/navigation";
import { getPerfilActual } from "@/lib/auth";
import { getPoaDelArea, ANIO_POA } from "@/lib/poa-2027";
import { DocumentoPoa } from "@/components/poa2027/documento-poa";
import { BackButton } from "@/components/layout/back-button";
import { EmptyState } from "@/components/ui/empty-state";

export const revalidate = 0;

/**
 * El previsualizador del POA 2027 — 28.09.
 *
 * "Sería piola que se vea el pdf que se va a mandar y poder editar ahí en el
 * previsualizador."
 *
 * Antes esta pantalla era una tarjeta con un botón de descarga. Ahora muestra el
 * documento entero —lo propio más lo que mandaron las áreas de abajo— y los
 * campos de las fichas propias se editan haciendo clic encima.
 */
export default async function PrevisualizadorPage() {
  const perfil = await getPerfilActual();
  if (!perfil) redirect("/login");

  if (!perfil.unidad_id) {
    return (
      <div className="space-y-6 max-w-3xl">
        <BackButton fallback="/poa-2027" />
        <EmptyState
          title="Tu perfil no tiene un área asignada"
          description="Sin área no se puede armar un POA. Escribile a Planificación Estratégica."
          icon="◫"
        />
      </div>
    );
  }

  let circuito: Awaited<ReturnType<typeof getPoaDelArea>> | null = null;
  let error: string | null = null;
  try {
    circuito = await getPoaDelArea(perfil.unidad_id);
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="no-imprimir space-y-4">
        <BackButton fallback="/poa-2027" />

        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-foreground">POA {ANIO_POA}</h1>
            <p className="text-sm text-muted mt-1">
              Así se va a ver el documento. Hacé clic sobre cualquier texto de tus fichas para
              corregirlo acá mismo; lo de las otras áreas se ve pero no se toca.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <a
              href="/api/poa-2027/exportar"
              className="text-sm border border-border rounded-lg px-4 py-2 hover:bg-surface-hover"
            >
              Descargar Word
            </a>
          </div>
        </div>
      </div>

      {error ? (
        <div className="no-imprimir rounded-xl border border-danger/30 bg-danger/5 p-4">
          <p className="text-sm font-semibold text-danger">No se pudo armar el documento</p>
          <p className="text-xs text-muted mt-1 font-mono break-all">{error}</p>
        </div>
      ) : (
        circuito?.propia && (
          <DocumentoPoa
            propia={circuito.propia}
            recibidas={circuito.recibidas}
            anio={ANIO_POA}
          />
        )
      )}
    </div>
  );
}

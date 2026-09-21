import { getPerfilActual, getScopeReporte } from "@/lib/auth";
import { hoyLocal } from "@/lib/utils";
import { trimestreDe, ultimoCierrePasado } from "@/lib/corte-trimestral";
import {
  getReporteUnidad,
  getUnidadesParaReporte,
  getCortesParaReporte,
} from "@/lib/reporte-trimestral";
import { InformeAvance } from "@/components/reportes/informe-avance";
import { BarraReporte } from "@/components/reportes/barra-reporte";
import { BackButton } from "@/components/layout/back-button";
import { EmptyState } from "@/components/ui/empty-state";

export const revalidate = 0;

/**
 * Informe de Avance de la Planificación Operativa Anual.
 *
 * Reescrita el 18.09 (párrafos 953 a 1028). Queda: el área como desplegable,
 * los tres botones y el informe. Se fueron la lista de chips por secretaría, el
 * selector "Corte del que salen los datos" y el bloque de análisis que redactaba
 * Planificación, porque el modelo nuevo no los tiene.
 *
 * El control de acceso NO está acá: vive en getReporteUnidad, que valida el
 * alcance del perfil antes de leer. Poner la puerta en la pantalla dejaría el
 * agujero abierto para cualquier otra que consuma la misma capa.
 */
export default async function ReportesPage({
  searchParams,
}: {
  searchParams: Promise<{ u?: string; corte?: string; t?: string }>;
}) {
  const params = await searchParams;
  const perfil = await getPerfilActual();
  if (!perfil) {
    return (
      <div className="space-y-6 max-w-3xl">
        <BackButton fallback="/dashboard" />
        <EmptyState title="Sesión no encontrada" icon="⚿" />
      </div>
    );
  }

  const hoy = hoyLocal();

  // Áreas que este usuario puede pedir. La capa de datos lo valida igual; esto
  // es para no ofrecerle opciones que va a rechazar.
  //
  // 09.09: usa `getScopeReporte` (solo hacia abajo) y NO `getScopeUnidades`,
  // que es el alcance de carga. Con el de carga, un director veía en el selector
  // —y podía abrir— el reporte de toda su secretaría.
  const todas = await getUnidadesParaReporte();
  const scope = new Set(await getScopeReporte(perfil));
  const unidades = todas.filter((u) => scope.has(u.id));

  if (unidades.length === 0) {
    return (
      <div className="space-y-6 max-w-3xl">
        <BackButton fallback="/dashboard" />
        <EmptyState
          title="No hay reportes disponibles para tu área"
          description="Si creés que deberías ver alguno, escribile a Planificación Estratégica."
          icon="◫"
        />
      </div>
    );
  }

  let cortes: Awaited<ReturnType<typeof getCortesParaReporte>> = [];
  try {
    cortes = await getCortesParaReporte();
  } catch {
    // Sin cortes se sigue: el informe sale con los datos de hoy y el botón
    // "Generar Informe" queda apagado.
  }

  const unidadId = params.u && unidades.some((u) => u.id === params.u) ? params.u : unidades[0].id;

  // 18.09: se fue el selector de corte. "Generar Informe" toma el último cierre
  // guardado —el número oficial, que no vuelve a cambiar— y "Vista previa" los
  // datos del día.
  const verCorte = params.corte != null && cortes.length > 0;
  const corteElegido = verCorte ? cortes[0] : undefined;

  // El trimestre del informe: el del corte si hay uno, si no el del último
  // cierre pasado. NO el del día de hoy: del 1 al 30 de octubre el trimestre en
  // curso es el cuarto, pero el informe que se está armando es del tercero.
  const cierre = ultimoCierrePasado(hoy);
  const trimestre = corteElegido?.trimestre ?? (Number(params.t) || trimestreDe(cierre));
  const anio = corteElegido?.anio ?? Number(cierre.slice(0, 4));

  let reporte: Awaited<ReturnType<typeof getReporteUnidad>> | null = null;
  let errorReporte: string | null = null;
  try {
    reporte = await getReporteUnidad({ unidadId, corteId: corteElegido?.id });
  } catch (e) {
    errorReporte = e instanceof Error ? e.message : String(e);
  }

  return (
    <div className="space-y-6">
      <div className="no-imprimir space-y-4 max-w-5xl">
        <BackButton fallback="/dashboard" />
        <BarraReporte
          unidades={unidades}
          unidadId={unidadId}
          hayCorte={cortes.length > 0}
          verCorte={verCorte}
        />
      </div>

      {errorReporte ? (
        <div className="no-imprimir max-w-3xl rounded-xl border border-danger/30 bg-danger/5 p-4">
          <p className="text-sm font-semibold text-danger">No se pudo armar el reporte</p>
          <p className="text-xs text-muted mt-1 font-mono break-all">{errorReporte}</p>
        </div>
      ) : (
        reporte && (
          <InformeAvance reporte={reporte} trimestre={trimestre} anio={anio} emitidoEl={hoy} />
        )
      )}
    </div>
  );
}

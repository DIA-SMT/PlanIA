import Link from "next/link";
import { getPerfilActual, getScopeUnidades } from "@/lib/auth";
import { perfilVeTodo, hoyLocal } from "@/lib/utils";
import { trimestreDe, ultimoCierrePasado } from "@/lib/corte-trimestral";
import {
  getReporteSecretaria,
  getSecretarias,
  getCortesParaReporte,
  getAnalisisReporte,
} from "@/lib/reporte-trimestral";
import { ReporteDocumento } from "@/components/reportes/reporte-documento";
import { AnalisisForm } from "@/components/reportes/analisis-form";
import { BackButton } from "@/components/layout/back-button";
import { EmptyState } from "@/components/ui/empty-state";
import { BotonImprimir } from "@/components/reportes/boton-imprimir";

export const revalidate = 0;

/**
 * Reporte trimestral de cumplimiento — etapa 4.
 *
 * Se elige secretaría y corte por querystring, como el resto del sistema
 * (`?sec=`, `?corte=`). Sin corte elegido calcula con los datos de hoy, que es
 * lo único posible mientras no exista la foto del cierre.
 *
 * El control de acceso NO está acá: vive en getReporteSecretaria, que valida el
 * alcance del perfil antes de leer. Poner la puerta en la pantalla dejaría el
 * agujero abierto para cualquier otra pantalla que consuma la misma capa.
 */
export default async function ReportesPage({
  searchParams,
}: {
  searchParams: Promise<{ sec?: string; corte?: string; t?: string }>;
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

  const esAdmin = perfil.rol === "admin_funcional";
  const hoy = hoyLocal();

  // Secretarías que este usuario puede pedir. La capa de datos lo valida igual;
  // esto es para no ofrecerle opciones que va a rechazar.
  const todas = await getSecretarias();
  const scope = perfilVeTodo(perfil) ? null : new Set(await getScopeUnidades(perfil));
  const secretarias = scope ? todas.filter((s) => scope.has(s.id)) : todas;

  if (secretarias.length === 0) {
    return (
      <div className="space-y-6 max-w-3xl">
        <BackButton fallback="/dashboard" />
        <EmptyState
          title="No hay reportes disponibles para tu área"
          description="El reporte trimestral se emite por secretaría. Si creés que deberías verlo, escribile a Planificación Estratégica."
          icon="◫"
        />
      </div>
    );
  }

  let cortes: Awaited<ReturnType<typeof getCortesParaReporte>> = [];
  let errorCortes: string | null = null;
  try {
    cortes = await getCortesParaReporte();
  } catch (e) {
    errorCortes = e instanceof Error ? e.message : String(e);
  }

  const secretariaId = params.sec && secretarias.some((s) => s.id === params.sec)
    ? params.sec
    : secretarias[0].id;
  const corteId = params.corte && cortes.some((c) => c.id === params.corte) ? params.corte : undefined;
  const corteElegido = cortes.find((c) => c.id === corteId);

  // El trimestre del reporte: el del corte si hay uno, si no el del último
  // cierre pasado. NO el del día de hoy: del 1 al 30 de octubre el trimestre en
  // curso es el cuarto, pero el informe que se está armando es del tercero.
  const cierre = ultimoCierrePasado(hoy);
  const trimestre = corteElegido?.trimestre ?? (Number(params.t) || trimestreDe(cierre));
  const anio = corteElegido?.anio ?? Number(cierre.slice(0, 4));

  let reporte: Awaited<ReturnType<typeof getReporteSecretaria>> | null = null;
  let errorReporte: string | null = null;
  try {
    reporte = await getReporteSecretaria({ secretariaId, corteId });
  } catch (e) {
    errorReporte = e instanceof Error ? e.message : String(e);
  }

  const analisis = await getAnalisisReporte({ anio, trimestre, unidadId: secretariaId }).catch(
    () => null
  );

  const conQuery = (extra: Record<string, string | undefined>) => {
    const q = new URLSearchParams();
    const base = { sec: secretariaId, corte: corteId, t: String(trimestre), ...extra };
    for (const [k, v] of Object.entries(base)) if (v) q.set(k, v);
    return `/reportes?${q.toString()}`;
  };

  return (
    <div className="space-y-6">
      <div className="no-imprimir space-y-4 max-w-5xl">
        <BackButton fallback="/dashboard" />

        <div>
          <h1 className="text-2xl font-bold text-foreground">Reporte trimestral</h1>
          <p className="text-sm text-muted mt-1">
            Cumplimiento de metas operativas por secretaría. Para descargarlo, usá Imprimir →
            Guardar como PDF.
          </p>
        </div>

        <div className="rounded-xl border border-border bg-surface p-4 space-y-3">
          <div className="flex flex-wrap gap-4">
            <div className="min-w-[16rem] flex-1">
              <p className="text-[10px] text-muted uppercase tracking-wider mb-1.5">Secretaría</p>
              <div className="flex flex-wrap gap-1.5">
                {secretarias.map((s) => (
                  <Link
                    key={s.id}
                    href={conQuery({ sec: s.id })}
                    className={`text-xs rounded-lg px-2.5 py-1.5 border transition-colors ${
                      s.id === secretariaId
                        ? "bg-primary/10 text-primary border-primary/30 font-medium"
                        : "text-muted border-border hover:text-foreground hover:bg-surface-hover"
                    }`}
                  >
                    {s.nombre}
                  </Link>
                ))}
              </div>
            </div>

            <div className="min-w-[14rem]">
              <p className="text-[10px] text-muted uppercase tracking-wider mb-1.5">
                Corte del que salen los datos
              </p>
              <div className="flex flex-wrap gap-1.5">
                <Link
                  href={conQuery({ corte: undefined })}
                  className={`text-xs rounded-lg px-2.5 py-1.5 border transition-colors ${
                    !corteId
                      ? "bg-warning/10 text-warning border-warning/30 font-medium"
                      : "text-muted border-border hover:text-foreground hover:bg-surface-hover"
                  }`}
                >
                  Hoy (vista previa)
                </Link>
                {cortes.map((c) => (
                  <Link
                    key={c.id}
                    href={conQuery({ corte: c.id })}
                    className={`text-xs rounded-lg px-2.5 py-1.5 border transition-colors ${
                      c.id === corteId
                        ? "bg-primary/10 text-primary border-primary/30 font-medium"
                        : "text-muted border-border hover:text-foreground hover:bg-surface-hover"
                    }`}
                  >
                    {c.anio} · T{c.trimestre} · {c.fecha_corte}
                  </Link>
                ))}
              </div>
              {cortes.length === 0 && !errorCortes && (
                <p className="text-[11px] text-muted mt-1.5">
                  Todavía no hay ninguna foto de corte guardada.{" "}
                  {esAdmin && (
                    <Link href="/admin/cortes" className="text-primary hover:underline">
                      Tomar una
                    </Link>
                  )}
                </p>
              )}
              {errorCortes && (
                <p className="text-[11px] text-danger mt-1.5">
                  No se pudieron leer los cortes: {errorCortes}
                </p>
              )}
            </div>
          </div>

          {reporte && <BotonImprimir />}
        </div>
      </div>

      {errorReporte ? (
        <div className="no-imprimir max-w-3xl rounded-xl border border-danger/30 bg-danger/5 p-4">
          <p className="text-sm font-semibold text-danger">No se pudo armar el reporte</p>
          <p className="text-xs text-muted mt-1 font-mono break-all">{errorReporte}</p>
        </div>
      ) : (
        reporte && (
          <ReporteDocumento reporte={reporte} trimestre={trimestre} anio={anio}>
            <AnalisisForm
              anio={anio}
              trimestre={trimestre}
              unidadId={secretariaId}
              unidadNombre={reporte.secretaria?.nombre ?? "el área"}
              analisis={analisis}
              puedeEditar={esAdmin}
            />
          </ReporteDocumento>
        )
      )}
    </div>
  );
}

"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { subirDocumento, borrarDocumento } from "@/lib/actions-documento";
import type { DocumentoActividad } from "@/lib/agenda-geo";

/**
 * Los adjuntos de una actividad — etapa 4 del plan del 22.09.
 *
 * "Aca se suben los archivos." Es la primera pantalla del proyecto que sube un
 * archivo a ningun lado: hasta hoy PlanIA guardaba solo texto y numeros.
 *
 * Los enlaces vienen firmados desde el servidor y vencen en una hora, porque el
 * bucket es privado. Si alguien deja la ficha abierta toda la tarde y despues
 * hace clic, el enlace ya no sirve: recargar la pagina los renueva. Es el precio
 * de que un briefing no quede accesible para cualquiera que adivine la URL.
 */
export function DocumentosActividad({
  actividadId,
  documentos,
  puedeEditar,
}: {
  actividadId: string;
  documentos: DocumentoActividad[];
  puedeEditar: boolean;
}) {
  const router = useRouter();
  const [pendiente, empezar] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const entrada = useRef<HTMLInputElement>(null);

  const subir = (archivo: File) => {
    setError(null);
    const datos = new FormData();
    datos.set("archivo", archivo);
    empezar(async () => {
      const r = await subirDocumento(actividadId, datos);
      if (!r.success) {
        setError(r.error ?? "No se pudo subir");
        return;
      }
      if (entrada.current) entrada.current.value = "";
      router.refresh();
    });
  };

  const borrar = (id: string, nombre: string) => {
    if (!confirm(`¿Borrar "${nombre}"? No se puede deshacer.`)) return;
    setError(null);
    empezar(async () => {
      const r = await borrarDocumento(actividadId, id);
      if (!r.success) setError(r.error ?? "No se pudo borrar");
      else router.refresh();
    });
  };

  return (
    <section className="rounded-xl border border-border bg-surface p-4 space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="text-sm font-bold text-foreground">Documentación</h2>
        {puedeEditar && (
          <label className="text-xs text-primary border border-primary/30 bg-primary/10 hover:bg-primary/20 rounded px-3 py-1.5 cursor-pointer">
            {pendiente ? "Subiendo…" : "+ Subir archivo"}
            <input
              ref={entrada}
              type="file"
              className="hidden"
              disabled={pendiente}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) subir(f);
              }}
            />
          </label>
        )}
      </div>

      {error && <p className="text-xs text-danger">{error}</p>}

      {documentos.length === 0 ? (
        <p className="text-xs text-muted">
          Sin documentos.{" "}
          {puedeEditar
            ? "Actas, planos, notas, lo que haga falta tener a mano. Hasta 10 MB cada uno."
            : "Los sube el área responsable."}
        </p>
      ) : (
        <ul className="divide-y divide-border border border-border rounded">
          {documentos.map((d) => (
            <li key={d.id} className="flex items-center gap-3 p-2">
              <div className="min-w-0 flex-1">
                {d.url ? (
                  <a
                    href={d.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm text-foreground hover:text-primary truncate block"
                  >
                    {d.nombre}
                  </a>
                ) : (
                  <span className="text-sm text-muted truncate block" title="El enlace venció; recargá la página">
                    {d.nombre}
                  </span>
                )}
                <p className="text-[10px] text-muted">
                  {peso(d.tamano_bytes)}
                  {d.subido_por_email ? ` · ${d.subido_por_email}` : ""}
                  {" · "}
                  {new Date(d.created_at).toLocaleDateString("es-AR")}
                </p>
              </div>
              {puedeEditar && (
                <button
                  onClick={() => borrar(d.id, d.nombre)}
                  disabled={pendiente}
                  title="Borrar"
                  className="text-xs text-muted hover:text-danger disabled:opacity-40 shrink-0 px-1"
                >
                  ✕
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function peso(bytes: number | null): string {
  if (bytes == null) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

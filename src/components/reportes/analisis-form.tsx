"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { guardarAnalisisReporte, despublicarAnalisisReporte } from "@/lib/actions-reporte";
import type { AnalisisReporte } from "@/lib/reporte-trimestral";

const MAX = 4000;

const CAMPOS = [
  {
    clave: "balance" as const,
    titulo: "Balance del Período",
    ayuda: "Qué pasó en el trimestre en esta área, en términos de gestión.",
  },
  {
    clave: "desvios" as const,
    titulo: "Identificación de Desvíos",
    ayuda: "Dónde se apartó de lo planificado y por qué.",
  },
  {
    clave: "oportunidades" as const,
    titulo: "Oportunidades de Mejora de Carga",
    ayuda: "Qué se puede mejorar en el registro de la información en el sistema.",
  },
];

/**
 * Bloque 3 del reporte: los tres campos que redacta Planificación.
 *
 * Se guarda como borrador mientras se escribe. Publicar es lo que lo hace
 * visible para el área: mientras es borrador, el secretario no ve un texto
 * sobre su propia gestión a medio redactar.
 */
export function AnalisisForm({
  anio,
  trimestre,
  unidadId,
  unidadNombre,
  analisis,
  puedeEditar,
}: {
  anio: number;
  trimestre: number;
  unidadId: string;
  unidadNombre: string;
  analisis: AnalisisReporte | null;
  puedeEditar: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [texto, setTexto] = useState({
    balance: analisis?.balance ?? "",
    desvios: analisis?.desvios ?? "",
    oportunidades: analisis?.oportunidades ?? "",
  });
  const [sucio, setSucio] = useState(false);

  const publicado = analisis?.estado === "publicado";
  const vacio = !texto.balance.trim() && !texto.desvios.trim() && !texto.oportunidades.trim();

  const correr = (fn: () => Promise<{ success: boolean; error?: string }>, mensaje: string) => {
    setError(null);
    setAviso(null);
    startTransition(async () => {
      const r = await fn();
      if (r.success) {
        setAviso(mensaje);
        setSucio(false);
        router.refresh();
      } else {
        setError(r.error ?? "No se pudo guardar");
      }
    });
  };

  const guardar = (publicar: boolean) =>
    correr(
      () => guardarAnalisisReporte({ anio, trimestre, unidad_id: unidadId, ...texto, publicar }),
      publicar
        ? "Análisis publicado: ya lo puede ver el área."
        : publicado
        ? "Cambios guardados. Sigue publicado."
        : "Borrador guardado."
    );

  // Solo lectura: el área viendo su propio informe ya publicado.
  if (!puedeEditar) {
    if (!analisis || !publicado) return null;
    return (
      <TextoLimpio
        valores={{
          balance: analisis.balance ?? "",
          desvios: analisis.desvios ?? "",
          oportunidades: analisis.oportunidades ?? "",
        }}
        borrador={false}
      />
    );
  }

  return (
    <>
    {/* En papel, el texto limpio. En pantalla, el formulario. Antes había un
        solo bloque —el formulario— y quien podía editar se imprimía los cuadros
        de texto, el contador de caracteres y los botones, porque la versión
        limpia estaba detrás de `!puedeEditar` Y publicado. O sea que justo
        Planificación, que es la que redacta, nunca veía la versión imprimible
        (09.09, párrafos 748 y 749).

        Se imprime lo que hay en pantalla y no lo último guardado, así imprimir
        un borrador a medio escribir para leerlo en papel funciona como uno
        espera. Y va sellado como BORRADOR mientras no esté publicado, para que
        una hoja suelta no se confunda con el informe final. */}
    <div className="solo-imprimir">
      <TextoLimpio valores={texto} borrador={!publicado} />
    </div>

    <section className="no-imprimir space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="text-lg font-semibold text-foreground">
          Análisis de Gestión y Conclusiones del Trimestre
        </h2>
        <span
          className={`text-[10px] uppercase tracking-wider font-semibold px-2 py-1 rounded ${
            publicado
              ? "text-success bg-success/10 border border-success/30"
              : "text-warning bg-warning/10 border border-warning/30"
          }`}
        >
          {publicado ? "Publicado" : analisis ? "Borrador" : "Sin escribir"}
        </span>
      </div>

      <p className="text-xs text-muted">
        Lo escribe Planificación Estratégica para <strong>{unidadNombre}</strong>, trimestre{" "}
        {trimestre} de {anio}.{" "}
        {publicado
          ? "Está publicado: el área ya lo puede ver."
          : "Mientras sea borrador, el área no lo ve."}
      </p>

      {CAMPOS.map((c) => (
        <div key={c.clave} className="rounded-xl border border-border bg-surface p-4 space-y-1.5">
          <label className="block">
            <span className="text-sm font-semibold text-foreground">{c.titulo}</span>
            <span className="block text-[11px] text-muted mt-0.5">{c.ayuda}</span>
          </label>
          <textarea
            value={texto[c.clave]}
            onChange={(e) => {
              setTexto((t) => ({ ...t, [c.clave]: e.target.value }));
              setSucio(true);
              setAviso(null);
            }}
            rows={4}
            maxLength={MAX}
            disabled={isPending}
            className="w-full text-sm bg-background border border-border rounded px-3 py-2 leading-relaxed disabled:opacity-50"
            placeholder="Escribí acá…"
          />
          <p className="text-[10px] text-muted/70 text-right tabular-nums">
            {texto[c.clave].length} / {MAX}
          </p>
        </div>
      ))}

      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={() => guardar(false)}
          disabled={isPending || (!sucio && !!analisis && !publicado)}
          className="text-sm border border-border rounded-lg px-4 py-2 hover:bg-surface-hover disabled:opacity-50"
        >
          {isPending ? "Guardando…" : publicado ? "Guardar cambios" : "Guardar borrador"}
        </button>

        {!publicado ? (
          <button
            onClick={() => guardar(true)}
            disabled={isPending || vacio}
            title={vacio ? "Escribí al menos uno de los tres campos" : undefined}
            className="text-sm bg-primary text-white rounded-lg px-4 py-2 hover:bg-primary/90 disabled:opacity-50"
          >
            Publicar
          </button>
        ) : (
          <>
            <button
              onClick={() =>
                correr(
                  () => despublicarAnalisisReporte({ anio, trimestre, unidad_id: unidadId }),
                  "Volvió a borrador: el área ya no lo ve."
                )
              }
              disabled={isPending}
              className="text-sm text-muted hover:text-foreground underline disabled:opacity-50"
            >
              Volver a borrador
            </button>
          </>
        )}

        {sucio && !isPending && (
          <span className="text-[11px] text-warning">Hay cambios sin guardar</span>
        )}
      </div>

      {analisis?.actualizado_at && (
        <p className="text-[10px] text-muted/70">
          Última edición: {new Date(analisis.actualizado_at).toLocaleString("es-AR")}
          {analisis.actualizado_por_email ? ` · ${analisis.actualizado_por_email}` : ""}
        </p>
      )}

      {aviso && (
        <p className="text-xs text-success border border-success/30 bg-success/5 rounded-lg px-3 py-2">
          {aviso}
        </p>
      )}
      {error && (
        <p className="text-xs text-danger border border-danger/30 bg-danger/5 rounded-lg px-3 py-2">
          {error}
        </p>
      )}
    </section>
    </>
  );
}

/**
 * El análisis como texto corrido: lo que se lee en el informe, sin controles.
 *
 * Lo usan los dos caminos —el área que lo lee publicado y la impresión de
 * Planificación— así que el documento sale igual para los dos.
 */
function TextoLimpio({
  valores,
  borrador,
}: {
  valores: { balance: string; desvios: string; oportunidades: string };
  borrador: boolean;
}) {
  const escritos = CAMPOS.filter((c) => valores[c.clave].trim() !== "");
  if (escritos.length === 0) return null;

  return (
    <section className="space-y-3">
      <div className="flex items-baseline gap-2 flex-wrap">
        <h2 className="text-lg font-semibold text-foreground">
          Análisis de Gestión y Conclusiones del Trimestre
        </h2>
        {borrador && (
          <span className="text-[10px] uppercase tracking-wider font-bold text-warning border border-warning/50 rounded px-1.5 py-0.5">
            Borrador — no publicado
          </span>
        )}
      </div>
      {escritos.map((c) => (
        <div key={c.clave} className="rounded-xl border border-border bg-surface p-4">
          <p className="text-sm font-semibold text-foreground mb-1.5">{c.titulo}</p>
          <p className="text-sm text-foreground/90 whitespace-pre-wrap leading-relaxed">
            {valores[c.clave]}
          </p>
        </div>
      ))}
    </section>
  );
}

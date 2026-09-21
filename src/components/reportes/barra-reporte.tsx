"use client";

import { useRouter, useSearchParams } from "next/navigation";
import type { UnidadReporte } from "@/lib/reporte-trimestral";

/**
 * La barra de la pantalla de reportes — 18.09, párrafos 954 y 1019 a 1028.
 *
 * Tres cosas y nada más:
 *   - El área, como desplegable: "necesito que en esta solapa se despliegue las
 *     secretarias como esta en el Panel Ejecutivo […] Que sea desplegable".
 *     Antes era una lista de chips agrupada por secretaría.
 *   - Los tres botones, "uno a la par del otro sin ningún título y/o
 *     aclaración".
 *   - Se fue el selector "Corte del que salen los datos" (párrafo 1019). Lo que
 *     ese selector decidía —mirar la foto guardada del cierre o los datos de
 *     hoy— ahora lo deciden los botones: Generar Informe toma el último cierre
 *     guardado, que es el número oficial que no cambia; Vista previa muestra
 *     cómo va hoy.
 */
export function BarraReporte({
  unidades,
  unidadId,
  hayCorte,
  verCorte,
}: {
  unidades: UnidadReporte[];
  unidadId: string;
  /** Si existe alguna foto de corte guardada. Sin eso, Generar no tiene qué leer. */
  hayCorte: boolean;
  /** Si se está mirando el corte guardado (true) o los datos de hoy (false). */
  verCorte: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const ir = (cambios: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(cambios)) {
      if (v == null) params.delete(k);
      else params.set(k, v);
    }
    router.push(`/reportes?${params.toString()}`, { scroll: false });
  };

  const ordenar = (a: UnidadReporte, b: UnidadReporte) => a.nombre.localeCompare(b.nombre, "es");
  const secretarias = unidades.filter((u) => u.nivel === 0).sort(ordenar);
  const subsecretarias = unidades.filter((u) => u.nivel === 1).sort(ordenar);
  const direcciones = unidades.filter((u) => u.nivel >= 2).sort(ordenar);

  const boton = (activo: boolean) =>
    `text-sm rounded-lg px-4 py-2 border transition-colors ${
      activo
        ? "bg-primary text-white border-primary"
        : "border-border text-foreground hover:bg-surface-hover"
    }`;

  return (
    <div className="no-imprimir space-y-3">
      <select
        value={unidadId}
        onChange={(e) => ir({ u: e.target.value })}
        className="text-sm bg-surface border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:border-primary/50 cursor-pointer w-full max-w-xl"
      >
        {secretarias.length > 0 && (
          <optgroup label="Secretarías">
            {secretarias.map((u) => (
              <option key={u.id} value={u.id}>
                {u.nombre}
              </option>
            ))}
          </optgroup>
        )}
        {subsecretarias.length > 0 && (
          <optgroup label="Subsecretarías">
            {subsecretarias.map((u) => (
              <option key={u.id} value={u.id}>
                {u.nombre}
              </option>
            ))}
          </optgroup>
        )}
        {direcciones.length > 0 && (
          <optgroup label="Direcciones">
            {direcciones.map((u) => (
              <option key={u.id} value={u.id}>
                {u.nombre}
              </option>
            ))}
          </optgroup>
        )}
      </select>

      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => ir({ corte: "ultimo" })}
          disabled={!hayCorte}
          title={hayCorte ? undefined : "Todavía no hay ninguna foto de corte guardada"}
          className={`${boton(verCorte)} disabled:opacity-40`}
        >
          Generar Informe
        </button>
        <button onClick={() => ir({ corte: null })} className={boton(!verCorte)}>
          Vista previa
        </button>
        <button onClick={() => window.print()} className={boton(false)}>
          Descargar PDF
        </button>
      </div>
    </div>
  );
}

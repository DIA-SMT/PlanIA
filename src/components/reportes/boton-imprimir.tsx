"use client";

/**
 * Abre el diálogo de impresión del navegador, que es donde se elige "Guardar
 * como PDF".
 *
 * El PDF lo genera el navegador y no el servidor. Da el mismo archivo y evita
 * meter Chromium en el despliegue de Vercel, que roza el límite de tamaño de
 * función. Si más adelante hace falta un botón de descarga directa, se agrega
 * encima: el HTML ya está y no hay que rehacer nada.
 */
export function BotonImprimir() {
  return (
    <div className="flex flex-wrap items-center gap-3 border-t border-border pt-3">
      <button
        onClick={() => window.print()}
        className="text-sm bg-primary text-white rounded-lg px-4 py-2 hover:bg-primary/90"
      >
        Imprimir / Guardar como PDF
      </button>
      <p className="text-[11px] text-muted">
        En el diálogo, elegí <strong>Guardar como PDF</strong> como destino. Los controles de
        esta pantalla no salen impresos.
      </p>
    </div>
  );
}

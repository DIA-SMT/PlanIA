"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cambiarEstadoActividad } from "@/lib/actions-actividad";

/**
 * Confirmar o suspender una actividad desde "requiere atención" — etapa 5.
 *
 * Es el verbo que la lista de pendientes daba por supuesto. Hasta acá las
 * acciones `editarActividad`, `cambiarEstadoActividad` y `borrarActividad`
 * existían desde la etapa 1 pero NINGUNA pantalla las llamaba: una actividad
 * cargada no se podía tocar, y por lo tanto la lista de "pendientes de
 * confirmación" mostraba algo que nadie podía confirmar. De paso, como el
 * historial lo escribe un trigger AFTER UPDATE, sin ninguna actualización
 * posible el historial no podía tener una sola fila.
 *
 * Los botones aparecen solo sobre las áreas donde la persona puede cargar. La
 * RLS decide de verdad —`editarActividad` la consulta antes de escribir— pero
 * ofrecer un botón que va a fallar es peor que no ofrecerlo.
 *
 * Editar el resto de los campos sigue sin existir: eso es la ficha de la etapa
 * 4. Acá están los dos verbos que esta pantalla necesita para no ser una lista
 * de cosas que mirar sin poder hacer nada.
 */
export function AccionesEstado({ id, titulo }: { id: string; titulo: string }) {
  const router = useRouter();
  const [pendiente, empezar] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const cambiar = (estado: string) => {
    setError(null);
    empezar(async () => {
      const r = await cambiarEstadoActividad(id, estado);
      if (!r.success) {
        setError(r.error ?? "No se pudo cambiar");
        return;
      }
      router.refresh();
    });
  };

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <button
        onClick={() => cambiar("confirmada")}
        disabled={pendiente}
        className="text-[11px] text-success border border-success/30 bg-success/10 hover:bg-success/20 disabled:opacity-40 rounded px-2 py-1"
      >
        Confirmar
      </button>
      <button
        onClick={() => {
          // Suspender deja la actividad a la vista en vez de borrarla, que es
          // lo que el pedido llama mantener la trazabilidad. Por eso se
          // pregunta: es un cambio que todo el municipio va a ver.
          if (confirm(`¿Suspender "${titulo}"? Va a seguir viéndose, marcada como suspendida.`)) {
            cambiar("suspendida");
          }
        }}
        disabled={pendiente}
        className="text-[11px] text-muted hover:text-danger border border-border hover:border-danger/30 disabled:opacity-40 rounded px-2 py-1"
      >
        Suspender
      </button>
      {error && <span className="text-[11px] text-danger">{error}</span>}
    </div>
  );
}

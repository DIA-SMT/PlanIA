import Image from "next/image";

/**
 * El pie de la barra lateral: los dos logos y la leyenda.
 *
 * Vive aparte desde el 22.09 porque lo comparten las dos barras —la de PlanIA y
 * la de la Agenda Georreferenciada—. Si se copiaba, el día que cambie un logo
 * quedaría cambiado en una sola.
 */
export function PieInstitucional({ producto }: { producto: string }) {
  return (
    <div className="p-4 border-t border-border space-y-3">
      <div className="flex items-center justify-center gap-4">
        <Image
          src="/logos/Direccion IA logo Secregeneral Dashboard.png"
          alt="Dirección de IA"
          width={100}
          height={32}
          className="logo-auto h-8 w-auto opacity-70"
        />
        <Image
          src="/logos/logoPlanificacion.jpeg"
          alt="Dirección de Planificación Estratégica"
          title="Dirección de Planificación Estratégica"
          width={80}
          height={32}
          className="h-8 w-auto rounded opacity-80"
        />
      </div>
      <p className="text-[9px] text-muted/60 text-center leading-relaxed">
        <span className="font-semibold">{producto}</span> · desarrollado por la Dirección
        de Inteligencia Artificial en conjunto con la Dirección de Planificación
        Estratégica de la Municipalidad de San Miguel de Tucumán
      </p>
    </div>
  );
}

import Image from "next/image";

import { TvClock } from "./tv-clock";
import { TvPanel } from "./tv-panel";
import { AutoRefresh } from "@/components/dashboard/auto-refresh";
import { getPeriodoActivo } from "@/lib/queries";

export const revalidate = 30;

interface Props {
  searchParams: Promise<{ vista?: string; fecha?: string; unidad?: string }>;
}

/**
 * Modo TV (pantalla de sala, sin login): el panel ejecutivo, en el mismo
 * formato que /dashboard.
 *
 * Tuvo una segunda vista con el calendario del mes, que se fue el 30.09 junto
 * con la agenda de PlanIA. Los parametros vista, fecha y unidad se siguen
 * aceptando y se ignoran: hay pantallas de sala con la URL vieja guardada y es
 * mejor que muestren el panel a que muestren un error.
 */
export default async function TvPage({ searchParams }: Props) {
  await searchParams;
  const periodo = await getPeriodoActivo();

  return (
    <div className="fixed inset-0 bg-background overflow-hidden p-8 flex flex-col">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div className="flex items-center gap-5">
          <Image
            src="/logos/logoMuni-sm.png"
            alt="PlanIA"
            width={56}
            height={56}
            className="h-14 w-14"
            priority
          />
          <div className="border-l border-border pl-5">
            <h1 className="text-3xl font-bold text-foreground tracking-tight">
              <span>Plan</span><span className="text-primary">IA</span>
            </h1>
            <p className="text-sm text-muted mt-0.5">{periodo.nombre} · Muni SMT</p>
          </div>
        </div>

        <TvClock />
      </div>

      <TvPanel periodoId={periodo.id} periodoNombre={periodo.nombre} />

      {/* Footer */}
      <div className="mt-4 flex items-center justify-between text-xs text-muted/50">
        <div className="flex items-center gap-3">
          <Image
            src="/logos/Direccion IA logo Secregeneral Dashboard.png"
            alt="Dirección de IA"
            width={80}
            height={28}
            className="logo-auto h-5 w-auto opacity-50"
          />
          <p>Desarrollo realizado por la Dirección de IA — Municipalidad de San Miguel de Tucumán</p>
        </div>
        <AutoRefresh intervalSegundos={60} />
      </div>
    </div>
  );
}

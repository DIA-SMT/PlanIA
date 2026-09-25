import { SidebarAgenda } from "@/components/layout/sidebar-agenda";
import { Topbar } from "@/components/layout/topbar";
import { getPerfilActual } from "@/lib/auth";
import { getAlertasDelUsuario } from "@/lib/queries";

/**
 * El marco de la Agenda Georreferenciada — 22.09.
 *
 * Igual que el de PlanIA pero con su propia barra lateral. Comparte la barra de
 * arriba, que es donde viven la campanita y el perfil: son los mismos avisos
 * para la misma persona, no tiene sentido tener dos campanitas.
 *
 * NO trae los indicadores por vencer: eso es del POA y acá no significa nada.
 */
export default async function AgendaLayout({ children }: { children: React.ReactNode }) {
  const perfil = await getPerfilActual();
  const alertas = perfil ? await getAlertasDelUsuario().catch(() => []) : [];

  return (
    <div className="flex h-full">
      <SidebarAgenda rol={perfil?.rol ?? null} />
      <div className="flex-1 flex flex-col min-w-0 h-full">
        <Topbar
          perfilNombre={perfil?.nombre ?? perfil?.email ?? null}
          rol={perfil?.rol ?? null}
          alertas={alertas}
          porVencer={[]}
        />
        <main className="flex-1 p-4 lg:p-6 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}

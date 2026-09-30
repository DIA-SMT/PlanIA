import type { Metadata } from "next";
import { SidebarAgenda } from "@/components/layout/sidebar-agenda";
import { Topbar } from "@/components/layout/topbar";
import { getPerfilActual } from "@/lib/auth";
import { getAlertasDelUsuario } from "@/lib/queries";
import { MENU_AGENDA_ACTIVO } from "@/lib/menu-agenda";

/**
 * El título de la pestaña, que es de este producto y no del otro.
 *
 * Sin esto heredaba el del layout raíz y el navegador decía "PlanIA — Plan
 * Operativo Anual 2026" estando en la Agenda Georreferenciada, que es
 * justamente la confusión que la pantalla de selección existe para evitar.
 */
export const metadata: Metadata = {
  title: {
    // `absolute` y no `default`: el layout raíz tiene la plantilla "%s — PlanIA"
    // y un `default` pasa por ella, así que la pestaña terminaba diciendo
    // "Agenda Georreferenciada — Muni SMT — PlanIA". `absolute` la esquiva.
    absolute: "Agenda Georreferenciada — Muni SMT",
    // Y esta es la que usan las pantallas de adentro.
    template: "%s — Agenda Georreferenciada",
  },
  description:
    "Las actividades territoriales de todas las áreas de la Municipalidad de San Miguel de Tucumán, en el calendario y en el mapa.",
};

/**
 * El marco de la Agenda Georreferenciada — 22.09.
 *
 * Igual que el de PlanIA pero con su propia barra lateral. Comparte la barra de
 * arriba, que es donde viven la campanita y el perfil: son los mismos avisos
 * para la misma persona, no tiene sentido tener dos campanitas.
 *
 * Lo que NO comparte son las secciones ni la firma. La barra de arriba trae un
 * segundo menú, el de abajo de 1024px, y hasta el 30.09 mostraba ahí las de
 * PlanIA: en un teléfono no había forma de llegar al mapa ni a las actividades.
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
          producto={{
            nombre: "Agenda ",
            destacado: "Georreferenciada",
            subtitulo: "Actividad territorial del municipio",
          }}
          items={MENU_AGENDA_ACTIVO}
        />
        <main className="flex-1 p-4 lg:p-6 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}

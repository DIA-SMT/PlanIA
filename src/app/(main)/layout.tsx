import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { CartelAlertas } from "@/components/layout/cartel-alertas";
import { getPerfilActual, getPerfilReal } from "@/lib/auth";
import { puedeVerComo, getVistaElegida } from "@/lib/ver-como";
import { getUnidades } from "@/lib/queries";
import { VerComo } from "@/components/layout/ver-como";
import { getAlertasDelUsuario, getIndicadoresPorVencer } from "@/lib/queries";

export default async function MainLayout({ children }: { children: React.ReactNode }) {
  const perfil = await getPerfilActual();

  // Las alertas se traen acá, una vez para todo el layout: la campanita las
  // necesita en la barra y el cartel arriba del contenido. Si algo falla, la
  // navegación no se cae por un aviso — se muestra la campanita vacía. (26.08)
  const [alertas, porVencer] = perfil
    ? await Promise.all([
        getAlertasDelUsuario().catch(() => []),
        getIndicadoresPorVencer().catch(() => []),
      ])
    : [[], []];

  // 28.09: "ver la aplicación como…". El perfil REAL es el que decide si el
  // selector aparece; el de arriba ya viene con el área elegida aplicada.
  const real = await getPerfilReal();
  const habilitado = puedeVerComo(real);
  const elegida = habilitado ? await getVistaElegida() : null;
  const unidades = habilitado ? await getUnidades().catch(() => []) : [];
  const nombreElegido = elegida
    ? unidades.find((u) => u.id === elegida.unidad_id)?.nombre_corto ??
      unidades.find((u) => u.id === elegida.unidad_id)?.nombre ??
      "otra área"
    : null;

  return (
    <div className="flex h-full">
      <Sidebar rol={perfil?.rol ?? null} />
      <div className="flex-1 flex flex-col min-w-0 h-full">
        <Topbar
          perfilNombre={perfil?.nombre ?? perfil?.email ?? null}
          rol={perfil?.rol ?? null}
          alertas={alertas}
          porVencer={porVencer}
          verComo={
            habilitado ? (
              <VerComo
                unidades={unidades}
                vista={
                  elegida && nombreElegido
                    ? { ...elegida, nombre: nombreElegido }
                    : null
                }
              />
            ) : null
          }
        />
        <main className="flex-1 p-4 lg:p-6 overflow-y-auto">
          <CartelAlertas alertas={alertas} />
          {children}
        </main>
      </div>
    </div>
  );
}

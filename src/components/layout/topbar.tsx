"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { ThemeToggle } from "./theme-toggle";
import { CampanaAlertas } from "./campana-alertas";
import { getSupabaseBrowser } from "@/lib/supabase/browser";
import type { AlertaConLectura, IndicadorPorVencer, RolUsuario } from "@/types/database";

type NavItem = { href: string; label: string; icon: string; roles?: RolUsuario[] };

// Este es el SEGUNDO menú: la barra de abajo en celular. Sacar algo "del menú"
// son los dos archivos, no solo el sidebar (09.09, párrafo 713). En el lugar
// que dejan Indicadores y Estructura entra Reportes, que no estaba y es de lo
// que más se va a usar de acá al cierre del trimestre.
const navItems: NavItem[] = [
  { href: "/dashboard", label: "Panel", icon: "◎" },
  { href: "/proyectos", label: "Proyectos", icon: "▦" },
  { href: "/reportes", label: "Reportes", icon: "▢" },
  { href: "/poa-2027", label: "POA 2027", icon: "◆" },
  {
    href: "/validaciones",
    label: "Validar",
    icon: "✓",
    roles: ["subsecretario", "secretario", "admin_funcional"],
  },
];

const rolLabels: Record<RolUsuario, string> = {
  intendenta: "Intendenta",
  secretario: "Secretario",
  subsecretario: "Subsecretario",
  director: "Director",
  coordinador: "Coordinador",
  admin_funcional: "Planificación Estratégica",
  admin_tecnico: "Sistemas",
};

/** El producto al que pertenece esta barra. Por defecto, PlanIA. */
const PLANIA = {
  nombre: "Plan",
  destacado: "IA",
  subtitulo: "Planificación Operativa Anual 2026",
};

export function Topbar({
  perfilNombre,
  rol,
  alertas = [],
  porVencer = [],
  verComo,
  producto = PLANIA,
  items = navItems,
}: {
  perfilNombre: string | null;
  rol: RolUsuario | null;
  alertas?: AlertaConLectura[];
  porVencer?: IndicadorPorVencer[];
  /** El selector de "ver como", solo para la cuenta habilitada (28.09). */
  verComo?: React.ReactNode;
  /**
   * Quién firma la barra. La Agenda Georreferenciada comparte este componente
   * —son los mismos avisos para la misma persona— pero no es PlanIA: decir
   * "PlanIA · Planificación Operativa Anual 2026" estando en el otro sistema
   * contradice la pantalla que eligió entre los dos.
   */
  producto?: { nombre: string; destacado: string; subtitulo: string };
  /**
   * Las secciones del menú de celular.
   *
   * Es el SEGUNDO menú del producto, el de abajo de 1024px. Sin esta prop la
   * Agenda Georreferenciada mostraba las secciones de PlanIA —Panel, Proyectos,
   * Reportes, POA 2027— y no había forma de llegar a las suyas: en un teléfono
   * el producto entero quedaba inalcanzable.
   */
  items?: NavItem[];
}) {
  const pathname = usePathname();
  const router = useRouter();
  const visibles = items.filter((i) => !i.roles || (rol && i.roles.includes(rol)));

  const logout = async () => {
    const sb = getSupabaseBrowser();
    await sb.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur-md">
      <div className="flex items-center justify-between h-14 px-4 lg:px-6">
        <div className="flex items-center gap-2 lg:hidden min-w-0">
          <Image
            src="/logos/logoMuni-sm.png"
            alt="Municipalidad de San Miguel de Tucumán"
            width={28}
            height={28}
            className="h-7 w-7 shrink-0"
          />
          <span className="text-base font-bold tracking-tight truncate">
            <span>{producto.nombre}</span>
            <span className="text-primary">{producto.destacado}</span>
          </span>
        </div>

        <div className="hidden lg:flex items-center gap-2">
          <Image
            src="/logos/logoMuni-sm.png"
            alt="Municipalidad de San Miguel de Tucumán"
            width={28}
            height={28}
            className="h-7 w-7"
          />
          <h2 className="text-sm font-medium text-foreground">
            <span className="font-bold">{producto.nombre}</span>
            <span className="font-bold text-primary">{producto.destacado}</span>
            <span className="text-muted ml-2 font-normal">· {producto.subtitulo}</span>
          </h2>
        </div>

        <div className="flex items-center gap-3">
          {verComo}
          <span className="text-xs text-muted hidden sm:inline">
            {new Date().toLocaleDateString("es-AR", {
              weekday: "long",
              day: "numeric",
              month: "long",
            })}
          </span>
          {perfilNombre && (
            <div className="hidden md:flex items-center gap-2 text-xs">
              {/* 09.09, párrafo 737: el nombre lleva a Mi perfil, que es donde
                  cada uno se cambia la contraseña. */}
              <Link href="/perfil" className="text-right group" title="Mi perfil">
                <p className="text-foreground font-medium group-hover:text-primary transition-colors">
                  {perfilNombre}
                </p>
                {rol && <p className="text-muted text-[10px]">{rolLabels[rol]}</p>}
              </Link>
              <button
                onClick={logout}
                title="Cerrar sesión"
                className="text-muted hover:text-foreground border border-border rounded px-2 py-1"
              >
                ⎋
              </button>
            </div>
          )}
          <CampanaAlertas alertas={alertas} porVencer={porVencer} />
          <ThemeToggle />
        </div>
      </div>

      <nav className="flex lg:hidden border-t border-border overflow-x-auto">
        {visibles.map((item) => {
          const active = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex-1 flex flex-col items-center gap-0.5 py-2 text-[10px] font-medium transition-colors min-w-[70px]
                ${active ? "text-primary border-b-2 border-primary" : "text-muted"}`}
            >
              <span className="text-sm">{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}

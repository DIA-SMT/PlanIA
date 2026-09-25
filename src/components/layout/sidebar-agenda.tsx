"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import type { RolUsuario } from "@/types/database";
import { PieInstitucional } from "./pie-institucional";

/**
 * La barra lateral de la Agenda Georreferenciada.
 *
 * Va aparte de la de PlanIA y no compartiendo una lista de items: son dos
 * productos distintos que se eligen al entrar, y mezclarlos en un solo menú es
 * justamente lo que pidieron evitar.
 *
 * Las secciones son las de la maqueta del 22.09. Las que todavía no existen se
 * muestran apagadas, con su fecha estimada, en vez de esconderse: así se ve a
 * dónde va la cosa y nadie pregunta si se olvidaron de algo.
 */
type Item = {
  href: string;
  label: string;
  icon: string;
  roles?: RolUsuario[];
  /** Todavía no construido: se muestra apagado y no navega. */
  pronto?: boolean;
};

const items: Item[] = [
  { href: "/territorio", label: "Inicio", icon: "◎" },
  { href: "/territorio/agenda", label: "Agenda", icon: "📅", pronto: true },
  { href: "/territorio/mapa", label: "Mapa Territorial", icon: "🗺", pronto: true },
  { href: "/territorio/actividades", label: "Actividades", icon: "▦", pronto: true },
  { href: "/territorio/briefing", label: "Briefing", icon: "◫", pronto: true },
  { href: "/territorio/actualidad", label: "Actualidad", icon: "◈", pronto: true },
  {
    href: "/territorio/configuracion",
    label: "Configuración",
    icon: "⚙",
    roles: ["admin_funcional", "admin_tecnico"],
    pronto: true,
  },
];

export function SidebarAgenda({ rol }: { rol: RolUsuario | null }) {
  const pathname = usePathname();
  const visibles = items.filter((i) => !i.roles || (rol && i.roles.includes(rol)));

  return (
    <aside className="hidden lg:flex flex-col w-64 border-r border-border bg-surface min-h-screen">
      <div className="p-5 border-b border-border flex items-center gap-3">
        <Image
          src="/logos/logoMuni-sm.png"
          alt="Municipalidad de San Miguel de Tucumán"
          width={40}
          height={40}
          className="h-10 w-10 shrink-0"
          priority
        />
        <div className="leading-tight">
          <p className="text-base font-bold text-foreground tracking-tight">
            Agenda <span className="text-primary">Georreferenciada</span>
          </p>
          <p className="text-[9px] text-muted uppercase tracking-widest">Muni SMT</p>
        </div>
      </div>

      <nav className="flex-1 p-4 space-y-1">
        {visibles.map((item) =>
          item.pronto ? (
            <span
              key={item.href}
              title="En construcción"
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-muted/40 cursor-default"
            >
              <span className="text-base">{item.icon}</span>
              {item.label}
              <span className="ml-auto text-[9px] uppercase tracking-wider border border-border rounded px-1 py-0.5">
                pronto
              </span>
            </span>
          ) : (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors
                ${
                  pathname === item.href
                    ? "bg-primary/10 text-primary border border-primary/20"
                    : "text-muted hover:text-foreground hover:bg-surface-hover"
                }`}
            >
              <span className="text-base">{item.icon}</span>
              {item.label}
            </Link>
          )
        )}
      </nav>

      <div className="px-4 pb-2">
        <Link
          href="/"
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-muted hover:text-foreground hover:bg-surface-hover transition-colors"
        >
          <span>←</span> Cambiar de sistema
        </Link>
      </div>

      <PieInstitucional producto="Agenda Georreferenciada" />
    </aside>
  );
}

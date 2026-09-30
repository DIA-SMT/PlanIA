"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import type { RolUsuario } from "@/types/database";
import { PieInstitucional } from "./pie-institucional";
import { MENU_AGENDA, type ItemMenu } from "@/lib/menu-agenda";

/**
 * La barra lateral de la Agenda Georreferenciada.
 *
 * Va aparte de la de PlanIA y no compartiendo una lista de items: son dos
 * productos distintos que se eligen al entrar, y mezclarlos en un solo menú es
 * justamente lo que pidieron evitar.
 *
 * Las secciones viven en `menu-agenda.ts`, compartidas con el menú de celular
 * de la barra de arriba: son el mismo menú visto en dos anchos, y tenerlas dos
 * veces es lo que hizo que el 09.09 sacaran algo de uno y quedara en el otro.
 * Las que todavía no existen se muestran apagadas en vez de esconderse: así se
 * ve a dónde va la cosa y nadie pregunta si se olvidaron de algo.
 */
export function SidebarAgenda({ rol }: { rol: RolUsuario | null }) {
  const pathname = usePathname();
  const visibles = MENU_AGENDA.filter((i) => !i.roles || (rol && i.roles.includes(rol)));

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
        {visibles.map((item: ItemMenu) =>
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

"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import type { RolUsuario } from "@/types/database";

type NavItem = {
  href: string;
  label: string;
  icon: string;
  roles?: RolUsuario[]; // undefined = visible para todos los autenticados
};

// 09.09, párrafo 713: "eliminar la herramienta de indicadores" y sacar
// ESTRUCTURA del tablero. Las dos salen del menú y las pantallas quedan vivas:
// /indicadores/[id] es a donde lleva el click desde un proyecto (párrafo 768) y
// a donde apunta la campanita cuando un indicador está por vencer.
//
// El listado general queda accesible desde la tarjeta "Indicadores" del Panel
// Ejecutivo, que es la única pantalla donde se busca un indicador por nombre sin
// saber de qué proyecto es. Ya hay un precedente del mismo tipo: /metas nunca
// estuvo en el menú y se llega solo desde su tarjeta del Panel. Si el cliente
// prefiere que no quede ninguna puerta, se saca ese link y listo.
const navItems: NavItem[] = [
  { href: "/dashboard", label: "Panel Ejecutivo", icon: "◎" },
  { href: "/proyectos", label: "Proyectos", icon: "▦" },
  { href: "/avance-direcciones", label: "Avance por Dirección", icon: "📊" },
  // 24.08, página 36: "incorporar una herramienta para medir los avances del
  // Plan Rector", con la captura señalando este menú.
  //
  // 09.09, párrafo 715: solo Intendenta, Secretarios y Subsecretarios. Van
  // también los dos roles de administración, que son los que la mantienen —
  // Planificación es la que imputa los proyectos al plan. El pedido apuntaba al
  // menú del director, que es el que no la tiene que ver.
  {
    href: "/plan-rector",
    label: "Plan Rector",
    icon: "◇",
    roles: ["intendenta", "secretario", "subsecretario", "admin_funcional", "admin_tecnico"],
  },
  // Reporte trimestral (pedido del 01.09). Lo ve cualquiera: cada uno accede
  // solo al de su alcance, y eso lo controla la capa de datos.
  { href: "/reportes", label: "Reportes", icon: "▢" },
  { href: "/agenda", label: "Agenda", icon: "📅" },
  { href: "/poa-2027", label: "POA 2027", icon: "◆" },
  {
    href: "/validaciones",
    label: "Validaciones",
    icon: "✓",
    roles: ["subsecretario", "secretario", "admin_funcional"],
  },
  {
    href: "/admin/alertas",
    label: "Avisos",
    icon: "◔",
    roles: ["admin_funcional", "admin_tecnico"],
  },
  {
    href: "/admin/usuarios",
    label: "Usuarios",
    icon: "⚙",
    roles: ["admin_funcional", "admin_tecnico"],
  },
];

export function Sidebar({ rol }: { rol: RolUsuario | null }) {
  const pathname = usePathname();
  const visibles = navItems.filter((i) => !i.roles || (rol && i.roles.includes(rol)));

  return (
    <aside className="hidden lg:flex flex-col w-64 border-r border-border bg-surface min-h-screen">
      <div className="p-5 border-b border-border flex items-center gap-3">
        <Image
          src="/logos/logoMuni-sm.png"
          alt="PlanIA"
          width={40}
          height={40}
          className="h-10 w-10 shrink-0"
          priority
        />
        <div className="leading-tight">
          <p className="text-xl font-bold text-foreground tracking-tight">
            <span>Plan</span><span className="text-primary">IA</span>
          </p>
          <p className="text-[9px] text-muted uppercase tracking-widest">
            POA 2026 · Muni SMT
          </p>
        </div>
      </div>

      <nav className="flex-1 p-4 space-y-1">
        {visibles.map((item) => {
          const active = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors
                ${
                  active
                    ? "bg-primary/10 text-primary border border-primary/20"
                    : "text-muted hover:text-foreground hover:bg-surface-hover"
                }`}
            >
              <span className="text-base">{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>

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
          <span className="font-semibold">PlanIA</span> · desarrollado por la Dirección
          de Inteligencia Artificial en conjunto con la Dirección de Planificación
          Estratégica de la Municipalidad de San Miguel de Tucumán
        </p>
      </div>
    </aside>
  );
}

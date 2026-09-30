import type { RolUsuario } from "@/types/database";

export type ItemMenu = {
  href: string;
  label: string;
  icon: string;
  roles?: RolUsuario[];
  /** Todavía no construido: se muestra apagado y no navega. */
  pronto?: boolean;
};

/**
 * Las secciones de la Agenda Georreferenciada, en un solo lugar.
 *
 * Las leen la barra lateral y el menú de celular. El comentario de `topbar.tsx`
 * avisa lo que pasó el 09.09 (párrafo 713): sacar algo "del menú" eran dos
 * archivos y se hizo en uno solo. Con la lista compartida, de este lado no
 * puede volver a pasar.
 *
 * Las secciones que todavía no existen llevan `pronto`. En la barra lateral se
 * muestran apagadas —así se ve a dónde va la cosa y nadie pregunta si se
 * olvidaron de algo— y en el menú de celular se omiten, porque una pestaña que
 * no navega no sirve de nada y ahí el espacio es el que es.
 */
export const MENU_AGENDA: ItemMenu[] = [
  { href: "/territorio", label: "Inicio", icon: "◎" },
  { href: "/territorio/agenda", label: "Agenda", icon: "📅" },
  { href: "/territorio/mapa", label: "Mapa Territorial", icon: "🗺" },
  { href: "/territorio/actividades", label: "Actividades", icon: "▦" },
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

/** Las que de verdad navegan, para el menú de celular. */
export const MENU_AGENDA_ACTIVO = MENU_AGENDA.filter((i) => !i.pronto);

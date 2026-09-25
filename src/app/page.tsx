import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import { getPerfilActual } from "@/lib/auth";

export const revalidate = 0;

/**
 * El selector de sistema — 22.09.
 *
 * "Después de loguearse con user y pass, vayamos a una pantalla donde elijamos
 * entre PlanIA y Agenda Georreferenciada". Antes acá había un redirect directo
 * al Panel Ejecutivo.
 *
 * Los dos sistemas comparten usuario, contraseña y organigrama; lo que cambia es
 * la barra lateral y las pantallas. Desde cada uno se vuelve acá con "Cambiar
 * de sistema".
 */
export default async function SelectorDeSistema() {
  const perfil = await getPerfilActual();
  if (!perfil) redirect("/login");

  const sistemas = [
    {
      href: "/dashboard",
      titulo: "PlanIA",
      subtitulo: "Plan Operativo Anual 2026",
      descripcion:
        "Proyectos, metas e indicadores de cada área, el Plan Rector y el informe trimestral de avance.",
      icono: "◎",
    },
    {
      href: "/territorio",
      titulo: "Agenda Georreferenciada",
      subtitulo: "Actividad territorial del municipio",
      descripcion:
        "Las actividades de todas las áreas en el calendario y en el mapa, con su ficha, su estado y su historial.",
      icono: "🗺",
    },
  ];

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 gap-8">
      <div className="flex flex-col items-center gap-3 text-center">
        <Image
          src="/logos/logoMuni-sm.png"
          alt="Municipalidad de San Miguel de Tucumán"
          width={56}
          height={56}
          className="h-14 w-14"
          priority
        />
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            Buenas, {perfil.nombre?.split(" ")[0] ?? "¿qué tal?"}
          </h1>
          <p className="text-sm text-muted mt-1">¿Con cuál querés trabajar?</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full max-w-3xl">
        {sistemas.map((s) => (
          <Link
            key={s.href}
            href={s.href}
            className="group rounded-2xl border border-border bg-surface p-6 hover:border-primary/40 hover:bg-surface-hover transition-colors flex flex-col gap-3"
          >
            <span className="text-3xl">{s.icono}</span>
            <div>
              <p className="text-lg font-bold text-foreground group-hover:text-primary transition-colors">
                {s.titulo}
              </p>
              <p className="text-[11px] text-muted uppercase tracking-wider mt-0.5">
                {s.subtitulo}
              </p>
            </div>
            <p className="text-sm text-muted leading-relaxed">{s.descripcion}</p>
            <span className="text-xs text-primary mt-auto pt-2">Entrar →</span>
          </Link>
        ))}
      </div>

      <p className="text-[10px] text-muted/60 text-center max-w-md leading-relaxed">
        Dirección de Inteligencia Artificial en conjunto con la Dirección de Planificación
        Estratégica · Municipalidad de San Miguel de Tucumán
      </p>
    </div>
  );
}

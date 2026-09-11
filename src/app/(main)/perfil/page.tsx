import { getPerfilActual } from "@/lib/auth";
import { CambiarContrasena } from "@/components/perfil/cambiar-contrasena";
import { BackButton } from "@/components/layout/back-button";
import { EmptyState } from "@/components/ui/empty-state";
import type { RolUsuario } from "@/types/database";

export const revalidate = 0;

const ROL_ETIQUETA: Record<RolUsuario, string> = {
  intendenta: "Intendenta",
  secretario: "Secretario",
  subsecretario: "Subsecretario",
  director: "Director",
  coordinador: "Coordinador",
  admin_funcional: "Planificación Estratégica",
  admin_tecnico: "Sistemas",
};

/**
 * Mi perfil — 09.09, párrafo 737.
 *
 * Por ahora tiene una sola cosa: cambiar la contraseña. Los demás datos (área,
 * rol, teléfono) los administra Planificación desde Usuarios, así que acá se
 * muestran para que cada uno vea con qué figura, pero no se editan.
 *
 * También es donde aterriza quien entra con un enlace de recuperación generado
 * desde Usuarios: el enlace lo deja con la sesión abierta y acá se pone la
 * contraseña nueva.
 */
export default async function PerfilPage() {
  const perfil = await getPerfilActual();
  if (!perfil) {
    return (
      <div className="space-y-6 max-w-3xl">
        <BackButton fallback="/dashboard" />
        <EmptyState title="Sesión no encontrada" icon="⚿" />
      </div>
    );
  }

  const unidad = (perfil as { unidad?: { nombre?: string | null } | null }).unidad;

  return (
    <div className="space-y-6 max-w-3xl">
      <BackButton fallback="/dashboard" />

      <div>
        <h1 className="text-2xl font-bold text-foreground">Mi perfil</h1>
        <p className="text-sm text-muted mt-1">
          Tus datos de acceso a PlanIA.
        </p>
      </div>

      <section className="rounded-xl border border-border bg-surface p-5">
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
          <div>
            <dt className="text-[10px] text-muted uppercase tracking-wider">Nombre</dt>
            <dd className="text-foreground">{perfil.nombre ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-[10px] text-muted uppercase tracking-wider">Correo</dt>
            <dd className="text-foreground break-all">{perfil.email ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-[10px] text-muted uppercase tracking-wider">Rol</dt>
            <dd className="text-foreground">{ROL_ETIQUETA[perfil.rol] ?? perfil.rol}</dd>
          </div>
          <div>
            <dt className="text-[10px] text-muted uppercase tracking-wider">Área</dt>
            <dd className="text-foreground">{unidad?.nombre ?? "—"}</dd>
          </div>
        </dl>
        <p className="text-[11px] text-muted/70 mt-4 border-t border-border pt-3">
          El área, el rol y el teléfono los administra Planificación Estratégica. Si algo
          de esto está mal, escribiles.
        </p>
      </section>

      <CambiarContrasena />
    </div>
  );
}

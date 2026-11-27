import { getPerfilActual } from "@/lib/auth";
import { unidadesDelPerfil } from "@/lib/utils";
import type { RolUsuario } from "@/types/database";
import type { ReactNode } from "react";

interface Props {
  allow: RolUsuario[];
  unidadId?: string; // si se pasa, además valida scope para 'director'
  children: ReactNode;
  fallback?: ReactNode;
}

/**
 * Render condicional por rol. Server component — usa el perfil de la sesión.
 *
 * Ejemplos:
 *   <RolGate allow={["director","admin_funcional"]} unidadId={proyecto.unidad_id}>
 *     <button>Cargar avance</button>
 *   </RolGate>
 */
export async function RolGate({ allow, unidadId, children, fallback = null }: Props) {
  const perfil = await getPerfilActual();
  if (!perfil) return <>{fallback}</>;

  if (!allow.includes(perfil.rol)) return <>{fallback}</>;

  // Si requiere scope adicional (Director solo sobre su unidad)
  if (unidadId && perfil.rol === "director" && !unidadesDelPerfil(perfil).includes(unidadId)) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}

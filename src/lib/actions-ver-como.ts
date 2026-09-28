"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { getPerfilReal } from "./auth";
import { puedeVerComo, COOKIE_VER_COMO } from "./ver-como";
import type { RolUsuario } from "@/types/database";

/**
 * Elegir y soltar la vista — 28.09.
 *
 * Se apoya en `getPerfilReal` y no en `getPerfilActual`: si preguntara por el
 * perfil ya cambiado, alguien que está mirando como director dejaría de poder
 * soltar la vista, porque un director no está habilitado.
 */

const ROLES: RolUsuario[] = [
  "intendenta",
  "secretario",
  "subsecretario",
  "director",
  "coordinador",
  "admin_funcional",
  "admin_tecnico",
];

export async function elegirVista(
  unidadId: string,
  rol: string
): Promise<{ success: boolean; error?: string }> {
  const real = await getPerfilReal();
  if (!puedeVerComo(real)) return { success: false, error: "No disponible" };
  if (!ROLES.includes(rol as RolUsuario)) return { success: false, error: "Ese rol no existe" };
  if (!unidadId) return { success: false, error: "Elegí un área" };

  const store = await cookies();
  store.set(COOKIE_VER_COMO, JSON.stringify({ unidad_id: unidadId, rol }), {
    httpOnly: true,
    sameSite: "lax",
    // Dura lo que dure el navegador abierto: es para mirar un rato, no para
    // quedarse viviendo adentro de otra área.
    path: "/",
  });
  revalidatePath("/", "layout");
  return { success: true };
}

export async function soltarVista(): Promise<{ success: boolean }> {
  const store = await cookies();
  store.delete(COOKIE_VER_COMO);
  revalidatePath("/", "layout");
  return { success: true };
}

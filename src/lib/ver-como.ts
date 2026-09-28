import { cookies } from "next/headers";
import type { PerfilUsuario, RolUsuario } from "@/types/database";

/**
 * "Ver la aplicación como…" — 28.09.
 *
 * "Me gustaría poder ver todas las vistas de la aplicación de cada cuenta […]
 * necesito poder ver eso para correcciones." Y después: "pero que sea solo para
 * mi usuario".
 *
 * Cambia el ÁREA y el ROL con los que las pantallas deciden qué mostrar, sin
 * cambiar de sesión ni pedir la contraseña de nadie.
 *
 * TRES COSAS QUE HAY QUE TENER CLARAS:
 *
 * 1. Es UNA SOLA CUENTA la que puede usarlo, la de abajo. No es "los
 *    administradores": si mañana entra otro admin_funcional, no lo hereda.
 *
 * 2. NO da permisos que la cuenta no tenga. Quien lo usa es admin_funcional, que
 *    ya alcanza a todas las áreas; lo que cambia es lo que la PANTALLA decide
 *    mostrar. Por eso no hay escalada posible: no se puede mirar nada que la
 *    cuenta no pudiera mirar igual.
 *
 * 3. Y por lo mismo, NO sirve para probar la seguridad. La base sigue
 *    respondiendo como el usuario de verdad, así que si una pantalla se olvida
 *    de filtrar, acá se va a ver igual de bien. Prueba cómo se VE la aplicación,
 *    no qué deja hacer.
 *
 * Escribir mientras se mira como otra área queda a nombre del usuario real pero
 * cae en el área elegida. Por eso la barra de arriba avisa, con un cartel que no
 * se puede no ver.
 */

/** La única cuenta habilitada. Explícito y no una variable de entorno: así se ve en el código quién lo tiene. */
const HABILITADO = ["direccionia@smt.gob.ar"];

const COOKIE = "ver_como";

/**
 * Además del mail, la cuenta tiene que poder LEER todo en la base: o por su rol
 * de administración, o por `acceso_global`.
 *
 * No es un capricho. La base responde como el usuario de verdad, así que si la
 * cuenta solo alcanza a su propia dirección, mirar como una secretaría muestra
 * una pantalla vacía —no la vista de esa secretaría— y el modo no sirve para lo
 * que se pidió.
 *
 * Escribir es otra cosa y sigue acotado a lo suyo: se puede recorrer todo el
 * municipio sin riesgo de dejar algo cargado en el área de otro.
 */
export function puedeVerComo(perfil: PerfilUsuario | null): boolean {
  if (!perfil) return false;
  if (!HABILITADO.includes((perfil.email ?? "").toLowerCase())) return false;
  return (
    perfil.rol === "admin_funcional" ||
    perfil.rol === "admin_tecnico" ||
    perfil.rol === "intendenta" ||
    perfil.acceso_global === true
  );
}

export interface VistaElegida {
  unidad_id: string;
  rol: RolUsuario;
}

/** Lo que haya elegido, si eligió algo. */
export async function getVistaElegida(): Promise<VistaElegida | null> {
  const store = await cookies();
  const crudo = store.get(COOKIE)?.value;
  if (!crudo) return null;
  try {
    const v = JSON.parse(crudo) as VistaElegida;
    return v.unidad_id && v.rol ? v : null;
  } catch {
    return null;
  }
}

/**
 * Devuelve el perfil con el área y el rol cambiados, si corresponde.
 *
 * El perfil que entra tiene que ser el REAL: la comprobación de quién puede se
 * hace acá adentro y no en quien llama, para que no haya forma de saltearla.
 */
export async function aplicarVista(real: PerfilUsuario | null): Promise<PerfilUsuario | null> {
  if (!puedeVerComo(real)) return real;
  const vista = await getVistaElegida();
  if (!vista) return real;
  return {
    ...(real as PerfilUsuario),
    rol: vista.rol,
    unidad_id: vista.unidad_id,
    // `acceso_global` da lectura de todo sin importar el rol. Si quedara
    // encendido, mirar como un director mostraría igual todo el municipio y el
    // modo no serviría para nada.
    acceso_global: false,
  };
}

export const COOKIE_VER_COMO = COOKIE;

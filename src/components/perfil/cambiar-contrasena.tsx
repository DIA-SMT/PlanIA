"use client";

import { useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabase/browser";

const MINIMO = 8;

/**
 * Cambio de contraseña propio — 09.09, párrafo 737: "agregar la función para
 * modificar las contraseñas, desde el perfil de cada usuario".
 *
 * Dos decisiones que importan:
 *
 * 1. El cambio va DIRECTO con la sesión que ya tiene el usuario, no por correo.
 *    El usuario que entra a esta pantalla ya está logueado, así que mandarle un
 *    mail para que vuelva es un paseo. Y hay una razón más fuerte: el proyecto
 *    no tiene servidor de correo propio y el de prueba de Supabase permite unos
 *    pocos mensajes por hora, con 73 usuarios no alcanza. El reseteo por enlace
 *    queda para el otro caso —el que no puede entrar—, que es lo que hace la
 *    herramienta de Planificación en Usuarios.
 *
 * 2. La contraseña se escribe y se envía desde el navegador del usuario a
 *    Supabase. No pasa por un Server Action nuestro, así que no puede quedar en
 *    ningún log del servidor.
 */
export function CambiarContrasena() {
  const [nueva, setNueva] = useState("");
  const [repetir, setRepetir] = useState("");
  const [ver, setVer] = useState(false);
  const [estado, setEstado] = useState<"idle" | "guardando" | "listo">("idle");
  const [error, setError] = useState<string | null>(null);

  const problema =
    nueva.length > 0 && nueva.length < MINIMO
      ? `Tiene que tener al menos ${MINIMO} caracteres.`
      : repetir.length > 0 && nueva !== repetir
      ? "Las dos no coinciden."
      : null;

  const guardar = async () => {
    setError(null);
    setEstado("guardando");
    const { error: e } = await getSupabaseBrowser().auth.updateUser({ password: nueva });
    if (e) {
      setEstado("idle");
      setError(e.message);
      return;
    }
    setNueva("");
    setRepetir("");
    setEstado("listo");
  };

  return (
    <section className="rounded-xl border border-border bg-surface p-5 space-y-4 max-w-md">
      <div>
        <h2 className="text-sm font-semibold text-foreground">Cambiar mi contraseña</h2>
        <p className="text-xs text-muted mt-1">
          Se cambia al instante. La próxima vez que entres, usá la nueva.
        </p>
      </div>

      <label className="block">
        <span className="text-xs text-muted">Contraseña nueva</span>
        <input
          type={ver ? "text" : "password"}
          value={nueva}
          onChange={(e) => {
            setNueva(e.target.value);
            setEstado("idle");
          }}
          autoComplete="new-password"
          className="mt-1 w-full text-sm bg-background border border-border rounded px-3 py-2 text-foreground"
          placeholder={`Al menos ${MINIMO} caracteres`}
        />
      </label>

      <label className="block">
        <span className="text-xs text-muted">Repetila</span>
        <input
          type={ver ? "text" : "password"}
          value={repetir}
          onChange={(e) => {
            setRepetir(e.target.value);
            setEstado("idle");
          }}
          autoComplete="new-password"
          className="mt-1 w-full text-sm bg-background border border-border rounded px-3 py-2 text-foreground"
        />
      </label>

      <label className="flex items-center gap-2 text-xs text-muted">
        <input type="checkbox" checked={ver} onChange={(e) => setVer(e.target.checked)} />
        Mostrar lo que escribo
      </label>

      {problema && <p className="text-xs text-warning">{problema}</p>}
      {error && (
        <p className="text-xs text-danger border border-danger/30 bg-danger/5 rounded-lg px-3 py-2">
          {error}
        </p>
      )}
      {estado === "listo" && (
        <p className="text-xs text-success border border-success/30 bg-success/5 rounded-lg px-3 py-2">
          Listo, la contraseña quedó cambiada.
        </p>
      )}

      <button
        onClick={guardar}
        disabled={estado === "guardando" || nueva.length < MINIMO || nueva !== repetir}
        className="text-sm bg-primary text-white rounded-lg px-4 py-2 hover:bg-primary/90 disabled:opacity-50"
      >
        {estado === "guardando" ? "Guardando…" : "Cambiar contraseña"}
      </button>
    </section>
  );
}

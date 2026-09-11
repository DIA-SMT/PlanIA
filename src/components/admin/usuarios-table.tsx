"use client";

import { useState, useTransition } from "react";
import { actualizarPerfil, desactivarPerfil, eliminarUsuario } from "@/lib/actions";
import { generarEnlaceRecuperacion } from "@/lib/actions-cuenta";
import { formatTelefono, normalizarTelefono } from "@/lib/utils";
import type { PerfilUsuario, UnidadOrganizacional, RolUsuario } from "@/types/database";

const ROLES: { value: RolUsuario; label: string }[] = [
  { value: "intendenta", label: "Intendenta" },
  { value: "secretario", label: "Secretario" },
  { value: "subsecretario", label: "Subsecretario" },
  { value: "director", label: "Director" },
  { value: "coordinador", label: "Coordinador" },
  { value: "admin_funcional", label: "Admin funcional (Planif. Estratégica)" },
  { value: "admin_tecnico", label: "Admin técnico (Sistemas)" },
];

interface Props {
  perfiles: PerfilUsuario[];
  unidades: UnidadOrganizacional[];
  /** user_id del admin logueado: no puede eliminarse a sí mismo. */
  userIdActual: string;
}

export function UsuariosTable({ perfiles, unidades, userIdActual }: Props) {
  const [editing, setEditing] = useState<string | null>(null);

  const unidadesByNivel = (nivel: number) =>
    unidades.filter((u) => u.nivel === nivel).sort((a, b) =>
      (a.nombre_corto ?? a.nombre).localeCompare(b.nombre_corto ?? b.nombre)
    );

  return (
    <div className="rounded-xl border border-border bg-surface overflow-x-auto">
      <table className="w-full text-sm min-w-[780px]">
        <thead className="bg-border/30 text-xs uppercase tracking-wider text-muted">
          <tr>
            <th className="text-left p-3">Nombre / Email</th>
            <th className="text-left p-3">Teléfono</th>
            <th className="text-left p-3">Rol</th>
            <th className="text-left p-3">Unidad</th>
            <th className="text-left p-3">Estado</th>
            <th className="p-3"></th>
          </tr>
        </thead>
        <tbody>
          {perfiles.map((p) => (
            <UsuarioRow
              key={p.user_id}
              perfil={p}
              unidades={unidades}
              unidadesByNivel={unidadesByNivel}
              editing={editing === p.user_id}
              onEdit={() => setEditing(p.user_id)}
              onCancel={() => setEditing(null)}
              userIdActual={userIdActual}
            />
          ))}
        </tbody>
      </table>

      <div className="p-4 border-t border-border bg-border/10 text-xs text-muted">
        Para crear nuevos usuarios usá el panel de Supabase Auth (Authentication → Users → Add user)
        y luego asigná el perfil acá. O ejecutá el script <code className="text-foreground">300_seed_usuarios.ts</code>.
      </div>
    </div>
  );
}

function UsuarioRow({
  perfil,
  unidades,
  unidadesByNivel,
  editing,
  onEdit,
  onCancel,
  userIdActual,
}: {
  perfil: PerfilUsuario;
  unidades: UnidadOrganizacional[];
  unidadesByNivel: (nivel: number) => UnidadOrganizacional[];
  editing: boolean;
  onEdit: () => void;
  onCancel: () => void;
  /** user_id del admin logueado: no puede eliminarse a sí mismo. */
  userIdActual: string;
}) {
  const [rol, setRol] = useState<RolUsuario>(perfil.rol);
  const [unidadId, setUnidadId] = useState<string | null>(perfil.unidad_id);
  const [accesoGlobal, setAccesoGlobal] = useState(perfil.acceso_global ?? false);
  const [telefono, setTelefono] = useState(perfil.telefono ?? "");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirmandoBorrado, setConfirmandoBorrado] = useState(false);
  const [enlace, setEnlace] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);

  const requierUnidad =
    rol === "secretario" || rol === "subsecretario" || rol === "director" || rol === "coordinador";
  const nivelEsperado = rol === "secretario" ? 0 : rol === "subsecretario" ? 1 : 2;
  // El coordinador (30.07) no está atado a un nivel: puede coordinar una
  // secretaría, una subsecretaría o una dirección.
  const unidadesParaRol = !requierUnidad
    ? []
    : rol === "coordinador"
    ? [...unidades].sort((a, b) =>
        (a.nombre_corto ?? a.nombre).localeCompare(b.nombre_corto ?? b.nombre)
      )
    : unidadesByNivel(nivelEsperado);

  // Se previsualiza acá para que el admin vea cómo va a quedar antes de
  // guardar, pero el server action vuelve a normalizar: esto es comodidad, no
  // validación.
  const telNormalizado = normalizarTelefono(telefono);

  const guardar = () => {
    setError(null);
    if (requierUnidad && !unidadId) {
      setError("Este rol requiere asignar una unidad");
      return;
    }
    if (!telNormalizado.ok) {
      setError(telNormalizado.error);
      return;
    }
    startTransition(async () => {
      const r = await actualizarPerfil({
        user_id: perfil.user_id,
        rol,
        unidad_id: requierUnidad ? unidadId : null,
        acceso_global: accesoGlobal,
        telefono,
      });
      if (!r.success) setError(r.error ?? "Error al guardar");
      else onCancel();
    });
  };

  const desactivar = () => {
    if (!confirm(`Desactivar a ${perfil.nombre ?? perfil.email}?`)) return;
    startTransition(async () => {
      await desactivarPerfil(perfil.user_id);
    });
  };

  const generarEnlace = () => {
    setError(null);
    setCopiado(false);
    startTransition(async () => {
      const r = await generarEnlaceRecuperacion({ user_id: perfil.user_id });
      if (!r.success) setError(r.error ?? "No se pudo generar el enlace");
      else setEnlace(r.enlace);
    });
  };

  const copiar = async () => {
    if (!enlace) return;
    try {
      await navigator.clipboard.writeText(enlace);
      setCopiado(true);
    } catch {
      // Sin permiso de portapapeles: el enlace está a la vista para copiarlo a mano.
      setCopiado(false);
    }
  };

  // Eliminar es irreversible, así que va con confirmación en dos pasos en vez
  // de un confirm() que se despacha de un click.
  const eliminar = () => {
    setError(null);
    startTransition(async () => {
      const r = await eliminarUsuario({ user_id: perfil.user_id });
      if (!r.success) setError(r.error ?? "No se pudo eliminar");
      else setConfirmandoBorrado(false);
    });
  };

  const unidadActual = unidades.find((u) => u.id === perfil.unidad_id);

  return (
    <tr className="border-t border-border">
      <td className="p-3">
        <p className="text-foreground font-medium">{perfil.nombre ?? "—"}</p>
        <p className="text-xs text-muted">{perfil.email}</p>
      </td>
      <td className="p-3">
        {editing ? (
          <>
            <input
              value={telefono}
              onChange={(e) => setTelefono(e.target.value)}
              placeholder="381 4123456"
              inputMode="tel"
              className="w-36 text-xs bg-background border border-border rounded px-2 py-1"
            />
            {telefono.trim() !== "" && (
              <p
                className={`text-[10px] mt-1 ${
                  telNormalizado.ok ? "text-muted" : "text-danger"
                }`}
              >
                {telNormalizado.ok ? `Se guarda: ${telNormalizado.valor}` : telNormalizado.error}
              </p>
            )}
          </>
        ) : (
          <span className={`text-xs ${perfil.telefono ? "text-foreground" : "text-muted"}`}>
            {formatTelefono(perfil.telefono)}
          </span>
        )}
      </td>
      <td className="p-3">
        {editing ? (
          <select
            value={rol}
            onChange={(e) => {
              const nuevo = e.target.value as RolUsuario;
              setRol(nuevo);
              if (!["secretario", "subsecretario", "director", "coordinador"].includes(nuevo))
                setUnidadId(null);
            }}
            className="text-xs bg-background border border-border rounded px-2 py-1"
          >
            {ROLES.map((r) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
        ) : (
          <span className="text-xs capitalize">{perfil.rol.replace("_", " ")}</span>
        )}
      </td>
      <td className="p-3 text-xs">
        {editing && requierUnidad ? (
          <select
            value={unidadId ?? ""}
            onChange={(e) => setUnidadId(e.target.value || null)}
            className="text-xs bg-background border border-border rounded px-2 py-1"
          >
            <option value="">Seleccionar...</option>
            {unidadesParaRol.map((u) => (
              <option key={u.id} value={u.id}>{u.nombre_corto ?? u.nombre}</option>
            ))}
          </select>
        ) : (
          <>
            {unidadActual ? (
              unidadActual.nombre_corto ?? unidadActual.nombre
            ) : (
              <span className="text-muted">global</span>
            )}
            {perfil.acceso_global && (
              <span
                className="ml-2 text-[9px] uppercase tracking-wider bg-accent/15 text-accent border border-accent/25 rounded px-1.5 py-0.5"
                title="Ve todas las áreas (solo lectura). Carga únicamente en la suya."
              >
                ve todo
              </span>
            )}
          </>
        )}
        {editing && (
          <label className="flex items-center gap-1.5 mt-2 text-[10px] text-muted cursor-pointer">
            <input
              type="checkbox"
              checked={accesoGlobal}
              onChange={(e) => setAccesoGlobal(e.target.checked)}
              className="accent-accent"
            />
            Ve todas las áreas (solo lectura)
          </label>
        )}
      </td>
      <td className="p-3">
        <span className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded ${
          perfil.activo ? "bg-success/20 text-success" : "bg-muted/20 text-muted"
        }`}>
          {perfil.activo ? "activo" : "inactivo"}
        </span>
      </td>
      <td className="p-3 text-right">
        {editing ? (
          <div className="flex items-center gap-2 justify-end">
            <button
              onClick={guardar}
              disabled={isPending}
              className="text-xs text-success hover:text-success/80 disabled:opacity-50"
            >
              ✓ Guardar
            </button>
            <button onClick={onCancel} className="text-xs text-muted hover:text-foreground">
              ✕
            </button>
          </div>
        ) : confirmandoBorrado ? (
          <div className="flex items-center gap-2 justify-end">
            <span className="text-[10px] text-danger">¿Eliminar definitivamente?</span>
            <button
              onClick={eliminar}
              disabled={isPending}
              className="text-xs text-danger font-semibold hover:text-danger/80 disabled:opacity-50"
            >
              Sí, eliminar
            </button>
            <button
              onClick={() => {
                setConfirmandoBorrado(false);
                setError(null);
              }}
              className="text-xs text-muted hover:text-foreground"
            >
              Cancelar
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2 justify-end">
            <button onClick={onEdit} className="text-xs text-primary hover:text-primary-light">
              Editar
            </button>
            {/* 09.09, párrafo 737: la herramienta para ayudar a quien no puede
                entrar. Genera un enlace de un solo uso; nadie ve la contraseña. */}
            {perfil.activo && (
              <button
                onClick={generarEnlace}
                disabled={isPending}
                title="Genera un enlace de un solo uso para que esta persona ponga su contraseña"
                className="text-xs text-primary hover:text-primary-light disabled:opacity-50"
              >
                {isPending && enlace === null ? "Generando…" : "Dar acceso"}
              </button>
            )}
            {perfil.activo && (
              <button onClick={desactivar} className="text-xs text-warning hover:text-warning/80">
                Desactivar
              </button>
            )}
            {perfil.user_id !== userIdActual && (
              <button
                onClick={() => setConfirmandoBorrado(true)}
                className="text-xs text-danger hover:text-danger/80"
              >
                Eliminar
              </button>
            )}
          </div>
        )}
        {enlace && (
          <div className="mt-2 rounded-lg border border-primary/30 bg-primary/5 p-2 space-y-1.5 text-left">
            <p className="text-[10px] text-foreground">
              Enlace de un solo uso para{" "}
              <strong>{perfil.nombre ?? perfil.email}</strong>. Mandáselo y que entre: lo
              deja adentro y ahí pone su contraseña en <strong>Mi perfil</strong>.
            </p>
            <input
              readOnly
              value={enlace}
              onClick={(ev) => ev.currentTarget.select()}
              className="w-full text-[10px] font-mono bg-background border border-border rounded px-2 py-1 text-foreground"
            />
            <div className="flex items-center gap-2">
              <button
                onClick={copiar}
                className="text-[10px] text-primary hover:text-primary-light"
              >
                {copiado ? "Copiado ✓" : "Copiar enlace"}
              </button>
              <button
                onClick={() => {
                  setEnlace(null);
                  setCopiado(false);
                }}
                className="text-[10px] text-muted hover:text-foreground"
              >
                Cerrar
              </button>
            </div>
          </div>
        )}
        {error && <p className="text-[10px] text-danger mt-1">{error}</p>}
      </td>
    </tr>
  );
}

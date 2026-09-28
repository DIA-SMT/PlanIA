"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { elegirVista, soltarVista } from "@/lib/actions-ver-como";
import type { UnidadOrganizacional, RolUsuario } from "@/types/database";

/**
 * El selector de "ver la aplicación como…" — 28.09.
 *
 * Cuando hay una vista puesta, la barra se pinta y dice de quién es. Tiene que
 * molestar un poco: mientras está encendida, lo que se escriba cae en el área
 * elegida, y confundirse de área es peor que el cartel.
 *
 * El rol se propone según el nivel del área —una dirección se mira como
 * director— y se puede cambiar: el mismo área se ve distinta según quién entre.
 */

const ROLES: { valor: RolUsuario; rotulo: string }[] = [
  { valor: "director", rotulo: "Director" },
  { valor: "subsecretario", rotulo: "Subsecretario" },
  { valor: "secretario", rotulo: "Secretario" },
  { valor: "coordinador", rotulo: "Coordinador" },
  { valor: "intendenta", rotulo: "Intendenta" },
  { valor: "admin_funcional", rotulo: "Planificación" },
];

const rolSegunNivel = (nivel: number): RolUsuario =>
  nivel === 0 ? "secretario" : nivel === 1 ? "subsecretario" : "director";

export function VerComo({
  unidades,
  vista,
}: {
  unidades: UnidadOrganizacional[];
  /** La vista puesta, si hay alguna. */
  vista: { unidad_id: string; rol: string; nombre: string } | null;
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [unidadId, setUnidadId] = useState(vista?.unidad_id ?? "");
  const [rol, setRol] = useState<string>(vista?.rol ?? "director");
  const [pendiente, startTransition] = useTransition();

  const ordenar = (a: UnidadOrganizacional, b: UnidadOrganizacional) =>
    a.nivel - b.nivel || (a.nombre_corto ?? a.nombre).localeCompare(b.nombre_corto ?? b.nombre, "es");
  const secretarias = unidades.filter((u) => u.nivel === 0).sort(ordenar);
  const subsecretarias = unidades.filter((u) => u.nivel === 1).sort(ordenar);
  const direcciones = unidades.filter((u) => u.nivel >= 2).sort(ordenar);

  const elegirUnidad = (id: string) => {
    setUnidadId(id);
    const u = unidades.find((x) => x.id === id);
    if (u) setRol(rolSegunNivel(u.nivel));
  };

  const aplicar = () =>
    startTransition(async () => {
      await elegirVista(unidadId, rol);
      setAbierto(false);
      router.refresh();
    });

  const soltar = () =>
    startTransition(async () => {
      await soltarVista();
      setAbierto(false);
      router.refresh();
    });

  if (vista) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-warning/40 bg-warning/10 px-2.5 py-1">
        <span className="text-[11px] text-warning">
          Viendo como <strong>{vista.nombre}</strong>
        </span>
        <button
          onClick={soltar}
          disabled={pendiente}
          className="text-[11px] text-warning underline hover:no-underline disabled:opacity-50"
        >
          salir
        </button>
      </div>
    );
  }

  if (!abierto) {
    return (
      <button
        onClick={() => setAbierto(true)}
        title="Ver la aplicación como otra área"
        className="text-[11px] text-muted hover:text-foreground border border-border rounded-lg px-2.5 py-1"
      >
        Ver como…
      </button>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <select
        value={unidadId}
        onChange={(e) => elegirUnidad(e.target.value)}
        className="text-[11px] bg-surface border border-border rounded px-2 py-1 max-w-52"
      >
        <option value="">Elegí un área…</option>
        <optgroup label="Secretarías">
          {secretarias.map((u) => (
            <option key={u.id} value={u.id}>
              {u.nombre_corto ?? u.nombre}
            </option>
          ))}
        </optgroup>
        <optgroup label="Subsecretarías">
          {subsecretarias.map((u) => (
            <option key={u.id} value={u.id}>
              {u.nombre_corto ?? u.nombre}
            </option>
          ))}
        </optgroup>
        <optgroup label="Direcciones">
          {direcciones.map((u) => (
            <option key={u.id} value={u.id}>
              {u.nombre_corto ?? u.nombre}
            </option>
          ))}
        </optgroup>
      </select>

      <select
        value={rol}
        onChange={(e) => setRol(e.target.value)}
        className="text-[11px] bg-surface border border-border rounded px-2 py-1"
      >
        {ROLES.map((r) => (
          <option key={r.valor} value={r.valor}>
            {r.rotulo}
          </option>
        ))}
      </select>

      <button
        onClick={aplicar}
        disabled={pendiente || !unidadId}
        className="text-[11px] bg-primary text-white rounded px-2.5 py-1 disabled:opacity-50"
      >
        {pendiente ? "…" : "Ver"}
      </button>
      <button
        onClick={() => setAbierto(false)}
        className="text-[11px] text-muted hover:text-foreground"
      >
        ✕
      </button>
    </div>
  );
}

"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";
import type { UnidadOrganizacional } from "@/types/database";

export function ProyectosSearch({ unidades }: { unidades: UnidadOrganizacional[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentQ = searchParams.get("q") ?? "";
  const currentDir = searchParams.get("dir") ?? "";
  const currentEstado = searchParams.get("estado") ?? "todos";
  const currentPr = searchParams.get("pr") ?? "";

  const update = useCallback((key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (!value || value === "todos") params.delete(key);
    else params.set(key, value);
    router.push(`/proyectos?${params.toString()}`, { scroll: false });
  }, [router, searchParams]);

  const sortByName = (a: UnidadOrganizacional, b: UnidadOrganizacional) =>
    (a.nombre_corto ?? a.nombre).localeCompare(b.nombre_corto ?? b.nombre);
  const secretarias = unidades.filter((u) => u.nivel === 0).sort(sortByName);
  const subsecretarias = unidades.filter((u) => u.nivel === 1).sort(sortByName);
  const direcciones = unidades.filter((u) => u.nivel >= 2).sort(sortByName);

  const estados = [
    { value: "todos", label: "Todos" },
    { value: "verde", label: "FINALIZADO" },
    { value: "amarillo", label: "EN EJECUCIÓN" },
    { value: "rojo", label: "NO INICIADO" },
  ];
  const estadoColors: Record<string, string> = {
    todos: "bg-primary/20 text-primary border-primary/30",
    verde: "bg-success/20 text-success border-success/30",
    amarillo: "bg-warning/20 text-warning border-warning/30",
    rojo: "bg-info/20 text-info border-info/30",
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        type="text"
        placeholder="Buscar proyecto..."
        defaultValue={currentQ}
        onChange={(e) => {
          clearTimeout((window as unknown as Record<string, ReturnType<typeof setTimeout>>).__searchTimer);
          (window as unknown as Record<string, ReturnType<typeof setTimeout>>).__searchTimer = setTimeout(() => {
            update("q", e.target.value);
          }, 300);
        }}
        className="text-sm bg-surface border border-border rounded-lg px-3 py-1.5 text-foreground placeholder:text-muted/50 focus:outline-none focus:border-primary/50 w-48"
      />
      <select
        value={currentDir}
        onChange={(e) => update("dir", e.target.value)}
        className="text-sm bg-surface border border-border rounded-lg px-3 py-1.5 text-foreground focus:outline-none focus:border-primary/50"
      >
        <option value="">Todas las áreas</option>
        {secretarias.length > 0 && (
          <optgroup label="Secretarías">
            {secretarias.map((u) => (
              <option key={u.id} value={u.id}>{u.nombre_corto ?? u.nombre}</option>
            ))}
          </optgroup>
        )}
        <optgroup label="Subsecretarías">
          {subsecretarias.map((u) => (
            <option key={u.id} value={u.id}>{u.nombre_corto ?? u.nombre}</option>
          ))}
        </optgroup>
        <optgroup label="Direcciones">
          {direcciones.map((u) => (
            <option key={u.id} value={u.id}>{u.nombre_corto ?? u.nombre}</option>
          ))}
        </optgroup>
      </select>
      {/* 05.10: para encontrar los proyectos sin asignar al Plan Rector sin
          abrir uno por uno. Con un filtro puesto el árbol se despliega solo. */}
      <select
        value={currentPr}
        onChange={(e) => update("pr", e.target.value)}
        aria-label="Filtrar por Plan Rector"
        className="text-sm bg-surface border border-border rounded-lg px-3 py-1.5 text-foreground focus:outline-none focus:border-primary/50"
      >
        <option value="">Plan Rector: todos</option>
        <option value="pendiente">Sin asignar al Plan Rector</option>
        <option value="imputado">En el Plan Rector</option>
        <option value="excluido">Fuera del plan</option>
      </select>
      <div className="flex items-center gap-1">
        {estados.map((e) => {
          const active = currentEstado === e.value;
          return (
            <button
              key={e.value}
              onClick={() => update("estado", e.value)}
              className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                active ? estadoColors[e.value] : "border-border text-muted hover:text-foreground"
              }`}
            >
              {e.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { crearIndicador } from "@/lib/actions";
import { avanceIndicador, estadoDeAvance } from "@/lib/utils";
import { IndicadorCargaForm } from "./indicador-carga-form";
import { IndicadorAccionesBar } from "./indicador-acciones-bar";
import type { Indicador } from "@/types/database";

interface Props {
  metaId: string;
  proyectoId: string;
  indicadores: Indicador[];
  metaValorMeta?: number | null;
  metaUnidadMedida?: string | null;
  puedeEditar?: boolean;
}

export function IndicadoresPanel({
  metaId,
  proyectoId,
  indicadores,
  metaValorMeta,
  metaUnidadMedida,
  puedeEditar = false,
}: Props) {
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <div className="space-y-2 mt-3">
      <div className="flex items-center justify-between">
        <p className="text-[10px] text-muted uppercase tracking-wider">Indicadores ({indicadores.length})</p>
        {puedeEditar && (
          <button
            onClick={() => setAdding(!adding)}
            className="text-[10px] text-primary hover:text-primary-light"
          >
            {adding ? "Cancelar" : "+ Agregar"}
          </button>
        )}
      </div>

      {adding && puedeEditar && (
        <CreateForm
          metaValorMeta={metaValorMeta}
          metaUnidadMedida={metaUnidadMedida}
          onSubmit={(data) => {
            startTransition(async () => {
              await crearIndicador({ ...data, meta_id: metaId, proyecto_id: proyectoId });
              setAdding(false);
            });
          }}
          isPending={isPending}
        />
      )}

      {indicadores.length === 0 ? (
        <p className="text-[10px] text-muted/50 italic">Sin indicadores cargados</p>
      ) : (
        <ul className="space-y-1">
          {indicadores.map((ind) => {
            const pct = avanceIndicador(ind);
            const estado = estadoDeAvance(pct);
            const abierto = editingId === ind.id;
            const valor =
              ind.valor_actual_texto ?? (ind.valor_actual != null ? String(ind.valor_actual) : "—");
            const objetivo =
              ind.valor_objetivo_texto ??
              (ind.valor_objetivo != null ? String(ind.valor_objetivo) : "—");

            return (
              <li key={ind.id} className="bg-border/20 rounded px-2 py-1.5 text-xs">
                <div className="flex items-center gap-2">
                  <span
                    className={`h-2 w-2 rounded-full shrink-0 ${
                      estado === "verde"
                        ? "bg-success"
                        : estado === "amarillo"
                        ? "bg-warning"
                        : estado === "rojo"
                        ? "bg-info"
                        : "bg-muted/40"
                    }`}
                    title={pct == null ? "Sin dato cargado" : `${pct} % de avance`}
                  />
                  {/* 09.09, párrafo 768: el indicador se puede clickear y lleva
                      a su ficha, que es donde está el historial de cargas. */}
                  <Link
                    href={`/indicadores/${ind.id}`}
                    className="flex-1 min-w-0 line-clamp-1 hover:text-primary"
                    title={ind.nombre}
                  >
                    {ind.nombre}
                  </Link>
                  <span className="text-muted shrink-0">
                    {valor} / {objetivo} {ind.unidad_medida ?? ""}
                  </span>
                  {puedeEditar && (
                    <button
                      onClick={() => setEditingId(abierto ? null : ind.id)}
                      className="text-[10px] text-primary hover:text-primary-light shrink-0"
                    >
                      {abierto ? "Cerrar" : "Editar"}
                    </button>
                  )}
                </div>

                {/* 09.09, párrafos 707 y 710: "toda la edición de indicadores
                    pasa a PROYECTOS; el botón EDITAR despliega la herramienta de
                    Indicadores tal cual está". Son literalmente los mismos dos
                    componentes que monta /indicadores/[id], no una copia
                    recortada: antes acá solo se podían escribir dos números
                    (valor y objetivo) y para lo demás había que salir. */}
                {abierto && puedeEditar && (
                  <div className="mt-2 pt-2 border-t border-border/40 space-y-3">
                    <IndicadorCargaForm
                      indicadorId={ind.id}
                      proyectoId={proyectoId}
                      valorActual={ind.valor_actual}
                      valorActualTexto={ind.valor_actual_texto}
                      valorObjetivo={ind.valor_objetivo}
                      valorObjetivoTexto={ind.valor_objetivo_texto}
                      unidadMedida={ind.unidad_medida}
                      observacion={ind.observacion}
                      puedeCargar
                    />
                    <IndicadorAccionesBar
                      indicadorId={ind.id}
                      proyectoId={proyectoId}
                      nombre={ind.nombre}
                      unidadMedida={ind.unidad_medida}
                      valorObjetivo={ind.valor_objetivo}
                      valorObjetivoTexto={ind.valor_objetivo_texto}
                      fechaInicio={ind.fecha_inicio}
                      fechaFin={ind.fecha_fin}
                      tieneValor={
                        ind.valor_actual != null ||
                        (ind.valor_actual_texto != null && ind.valor_actual_texto.trim() !== "")
                      }
                    />
                    <p className="text-[10px] text-muted/70">
                      El historial de cargas de este indicador está en{" "}
                      <Link
                        href={`/indicadores/${ind.id}`}
                        className="text-primary hover:underline"
                      >
                        su ficha
                      </Link>
                      .
                    </p>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function CreateForm({
  onSubmit,
  isPending,
  metaValorMeta,
  metaUnidadMedida,
}: {
  onSubmit: (data: {
    nombre: string;
    unidad_medida?: string | null;
    valor_objetivo?: number | null;
    fecha_inicio?: string | null;
    fecha_fin?: string | null;
  }) => void;
  isPending: boolean;
  metaValorMeta?: number | null;
  metaUnidadMedida?: string | null;
}) {
  const [nombre, setNombre] = useState("");
  const [unidad, setUnidad] = useState(metaUnidadMedida ?? "");
  const [objetivo, setObjetivo] = useState(metaValorMeta?.toString() ?? "");
  const [fechaInicio, setFechaInicio] = useState("");
  const [fechaFin, setFechaFin] = useState("");

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!nombre.trim()) return;
        onSubmit({
          nombre,
          unidad_medida: unidad || null,
          valor_objetivo: objetivo ? Number(objetivo) : null,
          fecha_inicio: fechaInicio || null,
          fecha_fin: fechaFin || null,
        });
        setNombre("");
        setUnidad("");
        setObjetivo("");
        setFechaInicio("");
        setFechaFin("");
      }}
      className="space-y-2 p-2 bg-surface rounded border border-border"
    >
      <input
        type="text"
        placeholder="Nombre del indicador"
        value={nombre}
        onChange={(e) => setNombre(e.target.value)}
        className="w-full text-xs bg-background border border-border rounded px-2 py-1 text-foreground"
        required
      />
      <div className="flex gap-2">
        <input
          type="text"
          placeholder="Unidad (días, %, etc)"
          value={unidad}
          onChange={(e) => setUnidad(e.target.value)}
          className="flex-1 text-xs bg-background border border-border rounded px-2 py-1 text-foreground"
        />
        <input
          type="number"
          step="any"
          placeholder="Objetivo"
          value={objetivo}
          onChange={(e) => setObjetivo(e.target.value)}
          className="w-24 text-xs bg-background border border-border rounded px-2 py-1 text-foreground"
        />
      </div>
      <div className="flex gap-2">
        <label className="flex-1 text-[10px] text-muted">
          Inicio del plazo
          <input
            type="date"
            value={fechaInicio}
            onChange={(e) => setFechaInicio(e.target.value)}
            className="mt-0.5 w-full text-xs bg-background border border-border rounded px-2 py-1 text-foreground"
          />
        </label>
        <label className="flex-1 text-[10px] text-muted">
          Fin del plazo
          <input
            type="date"
            value={fechaFin}
            onChange={(e) => setFechaFin(e.target.value)}
            className="mt-0.5 w-full text-xs bg-background border border-border rounded px-2 py-1 text-foreground"
          />
        </label>
      </div>
      <button
        type="submit"
        disabled={isPending}
        className="w-full text-xs bg-primary/20 text-primary border border-primary/30 rounded px-2 py-1 hover:bg-primary/30 disabled:opacity-50"
      >
        {isPending ? "Guardando..." : "Guardar indicador"}
      </button>
    </form>
  );
}

// Acá vivía `EditValue`, un formulario de dos campos (valor y objetivo) que era
// la única forma de tocar un indicador desde el proyecto. Se borró el 09.09 al
// traer la herramienta completa: tener dos formularios distintos para lo mismo
// —uno con modo texto y observación, el otro sin— era una trampa, porque el
// resultado dependía de por dónde hubieras entrado.


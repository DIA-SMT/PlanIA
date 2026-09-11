"use client";

import { useState, useTransition } from "react";
import type { Meta, Indicador } from "@/types/database";
import { StatusBadge } from "@/components/ui/status-badge";
import { ProgressBar } from "@/components/ui/progress-bar";
import {
  calcularPorcentajeMeta,
  avanceMetaEnPlazo,
  semaforoTextColor,
  formatFechaRelativa,
  formatFechaHora,
} from "@/lib/utils";
import { PlazoBadge } from "@/components/ui/plazo-badge";
import { AvanceForm } from "./avance-form";
import { IndicadoresPanel } from "@/components/indicadores/indicador-mini-form";
import { editarMeta, eliminarMeta } from "@/lib/actions";

interface MetaCardWithFormProps {
  meta: Meta;
  proyectoId: string;
  indicadores?: Indicador[];
  puedeCargar?: boolean;
  /** Fecha actual YYYY-MM-DD (para el estado por plazo). */
  hoy: string;
}

export function MetaCardWithForm({ meta, proyectoId, indicadores = [], puedeCargar = false, hoy }: MetaCardWithFormProps) {
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(false);
  const [nombreEdit, setNombreEdit] = useState(meta.nombre);
  const [unidadEdit, setUnidadEdit] = useState(meta.unidad_medida ?? "");
  const [metaEdit, setMetaEdit] = useState(meta.valor_meta?.toString() ?? "");
  const [inicioEdit, setInicioEdit] = useState(meta.fecha_inicio ?? "");
  const [limiteEdit, setLimiteEdit] = useState(meta.fecha_limite ?? "");
  const [pesoEdit, setPesoEdit] = useState(meta.peso?.toString() ?? "");
  const [isPending, startTransition] = useTransition();
  const [editError, setEditError] = useState<string | null>(null);
  const invertida = (meta.metadata as Record<string, unknown>)?.invertida === true;
  // Avance de la meta: se deriva de sus indicadores (cascada 16.07); si no
  // tiene indicadores, cae al avance propio de la meta. Considera el plazo.
  const av = avanceMetaEnPlazo(
    indicadores,
    calcularPorcentajeMeta(meta),
    { fecha_inicio: meta.fecha_inicio, fecha_limite: meta.fecha_limite },
    hoy
  );
  const pct = av.pct;
  const metaEstado = av.estado;
  const metaTieneSeg = av.conDatos > 0;
  // Seguimiento propio de la meta (para la línea "valor / objetivo").
  const metaPropioSeg = meta.ultima_actualizacion != null;

  const guardarEdicion = () => {
    setEditError(null);
    startTransition(async () => {
      const r = await editarMeta({
        meta_id: meta.id,
        proyecto_id: proyectoId,
        nombre: nombreEdit,
        unidad_medida: unidadEdit || null,
        valor_meta: metaEdit.trim() !== "" && isFinite(Number(metaEdit)) ? Number(metaEdit) : null,
        fecha_inicio: inicioEdit || null,
        fecha_limite: limiteEdit || null,
        peso: pesoEdit.trim() !== "" && isFinite(Number(pesoEdit)) ? Number(pesoEdit) : null,
      });
      if (r.success) setEditing(false);
      else setEditError(r.error ?? "Error");
    });
  };

  const borrar = () => {
    if (!confirm(`¿Eliminar la meta "${meta.nombre}"?`)) return;
    startTransition(async () => {
      await eliminarMeta({ meta_id: meta.id, proyecto_id: proyectoId });
    });
  };

  if (editing) {
    return (
      <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 space-y-2">
        <p className="text-[10px] text-muted uppercase tracking-wider">Editar meta</p>
        <textarea
          value={nombreEdit}
          onChange={(e) => setNombreEdit(e.target.value)}
          rows={2}
          className="w-full text-sm bg-background border border-border rounded px-2 py-1.5 text-foreground"
          placeholder="Enunciado de la meta"
        />
        <div className="flex gap-2">
          <input
            value={unidadEdit}
            onChange={(e) => setUnidadEdit(e.target.value)}
            placeholder="Unidad (%, días…)"
            className="flex-1 text-xs bg-background border border-border rounded px-2 py-1.5 text-foreground"
          />
          <input
            type="number"
            step="any"
            value={metaEdit}
            onChange={(e) => setMetaEdit(e.target.value)}
            placeholder="Valor objetivo"
            className="w-32 text-xs bg-background border border-border rounded px-2 py-1.5 text-foreground"
          />
        </div>
        <div className="flex gap-2">
          <label className="flex-1 text-[10px] text-muted">
            Inicio del plazo
            <input
              type="date"
              value={inicioEdit}
              onChange={(e) => setInicioEdit(e.target.value)}
              className="mt-0.5 w-full text-xs bg-background border border-border rounded px-2 py-1.5 text-foreground"
            />
          </label>
          <label className="flex-1 text-[10px] text-muted">
            Fin del plazo
            <input
              type="date"
              value={limiteEdit}
              onChange={(e) => setLimiteEdit(e.target.value)}
              className="mt-0.5 w-full text-xs bg-background border border-border rounded px-2 py-1.5 text-foreground"
            />
          </label>
          <label className="w-24 text-[10px] text-muted">
            Peso
            <input
              type="number"
              step="any"
              min="0"
              max="100"
              value={pesoEdit}
              onChange={(e) => setPesoEdit(e.target.value)}
              placeholder="1-100"
              className="mt-0.5 w-full text-xs bg-background border border-border rounded px-2 py-1.5 text-foreground"
            />
          </label>
        </div>
        <p className="text-[10px] text-muted">
          El peso es el &quot;valor particular&quot; de la meta: pondera cuánto influye en el avance global.
        </p>
        {editError && <p className="text-xs text-danger">{editError}</p>}
        <div className="flex gap-2">
          <button
            onClick={guardarEdicion}
            disabled={isPending}
            className="text-xs bg-primary text-white rounded px-3 py-1.5 hover:bg-primary/90 disabled:opacity-50"
          >
            {isPending ? "Guardando..." : "Guardar"}
          </button>
          <button onClick={() => setEditing(false)} className="text-xs text-muted hover:text-foreground">
            Cancelar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <StatusBadge estado={metaEstado} />
            <span className="text-[10px] font-mono text-muted bg-border/50 px-1.5 py-0.5 rounded">
              {meta.tipo_medicion}
            </span>
            {invertida && (
              <span className="text-[10px] text-accent bg-accent/10 px-1.5 py-0.5 rounded">↓ menor es mejor</span>
            )}
            {puedeCargar && (
              <span className="ml-auto flex items-center gap-2">
                <button onClick={() => setEditing(true)} className="text-[10px] text-primary hover:text-primary-light">
                  ✎ Editar
                </button>
                <button onClick={borrar} disabled={isPending} className="text-[10px] text-danger hover:text-danger/80 disabled:opacity-50">
                  ✕ Eliminar
                </button>
              </span>
            )}
          </div>
          <h3 className="text-sm font-semibold text-foreground">{meta.nombre}</h3>

          {meta.tipo_medicion === "cuantitativo" && meta.valor_meta != null && (
            <p className="text-xs text-muted mt-1">
              {metaPropioSeg ? (
                <>
                  <span className={semaforoTextColor(metaEstado) + " font-semibold"}>
                    {meta.valor_actual ?? meta.valor_linea_base ?? 0}
                  </span>
                  {" / "}{meta.valor_meta} {meta.unidad_medida}
                </>
              ) : (
                <>
                  Objetivo: {meta.valor_meta} {meta.unidad_medida}
                  {meta.valor_linea_base != null && meta.valor_linea_base !== 0 && (
                    <span className="ml-2 text-muted/60">(base: {meta.valor_linea_base})</span>
                  )}
                </>
              )}
            </p>
          )}

          {meta.tipo_medicion === "cualitativo" && meta.escala_cualitativa && (
            <div className="flex items-center gap-1.5 mt-2 flex-wrap">
              {meta.escala_cualitativa.niveles.map((nivel) => (
                <span key={nivel.clave}
                  className={`text-[10px] px-2 py-0.5 rounded-full border transition-all
                    ${meta.nivel_actual === nivel.clave
                      ? "bg-primary/20 border-primary/40 text-primary font-semibold"
                      : "border-border text-muted/50"}`}>
                  {nivel.label}
                </span>
              ))}
            </div>
          )}

          {meta.tipo_medicion === "hito_unico" && (
            <p className="text-xs mt-1">
              {meta.valor_actual === 1
                ? <span className="text-success font-semibold">✓ Cumplido</span>
                : <span className="text-muted">Pendiente</span>}
            </p>
          )}
        </div>

        <div className="flex flex-col items-end gap-2 shrink-0">
          <div className="w-28">
            {metaTieneSeg ? (
              <ProgressBar value={pct} estado={metaEstado} showLabel size="sm" />
            ) : (
              <span className="text-xs text-muted/50">—</span>
            )}
          </div>
          {/* Botón de avance de la meta — solo Director o admin.
              09.09, párrafo 711: pidieron borrarlo porque "no hace nada". No es
              así, y borrarlo habría sacado algo que se usa: escribe en la tabla
              `avance`, que alimenta "Últimos avances" y la pantalla de
              Validaciones, y tiene 231 registros, 202 de ellos de metas CON
              indicadores y el último de ayer.
              Lo que pasa es otra cosa: cuando la meta tiene indicadores, su
              porcentaje sale de ellos, así que cargar acá no mueve el número — y
              la etiqueta "Cargar avance" prometía justamente eso. Ahora el
              botón dice qué hace en cada caso y el cartel de abajo lo explica. */}
          {puedeCargar && (meta.tipo_medicion !== "hito_unico" || meta.valor_actual !== 1) ? (
            <button
              onClick={() => setShowForm(!showForm)}
              title={
                indicadores.length > 0
                  ? "Queda registrado y va a Validaciones. El porcentaje de esta meta sale de sus indicadores."
                  : "Esta meta no tiene indicadores: su porcentaje sale de este valor."
              }
              className="text-[10px] font-medium text-primary hover:text-primary-light transition-colors"
            >
              {showForm
                ? "Cerrar"
                : indicadores.length > 0
                ? "+ Registrar novedad"
                : "+ Cargar avance"}
            </button>
          ) : null}
        </div>
      </div>

      {(meta.fecha_inicio || meta.fecha_limite || meta.peso != null || metaPropioSeg) && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-[10px] text-muted">
          <PlazoBadge inicio={meta.fecha_inicio} fin={meta.fecha_limite} hoy={hoy}
            cumplido={av.pct != null && av.pct >= 100} />
          {meta.peso != null && <span>Peso: {meta.peso}</span>}
          {/* 09.09, párrafo 740: "en vez que diga así, podría decir exactamente
              la fecha de última carga?". Decía "Hace 1 mes(es)". Ahora va la
              fecha exacta y el relativo queda en el globito, que para mirar de
              reojo sigue siendo más rápido. */}
          {metaPropioSeg && meta.ultima_actualizacion && (
            <span title={formatFechaRelativa(meta.ultima_actualizacion)}>
              Última carga: {formatFechaHora(meta.ultima_actualizacion)}
            </span>
          )}
        </div>
      )}

      {/* Panel de indicadores (siempre visible; el botón "+ Agregar" sólo si puede cargar) */}
      <div className="mt-3 pt-3 border-t border-border/50">
        <IndicadoresPanel
          metaId={meta.id}
          proyectoId={proyectoId}
          indicadores={indicadores}
          metaValorMeta={meta.valor_meta}
          metaUnidadMedida={meta.unidad_medida}
          puedeEditar={puedeCargar}
        />
      </div>

      {/* Formulario inline de carga de avance de la meta (solo cuando puede y lo abrió) */}
      {showForm && (
        <div className="mt-3 space-y-3 border-t border-border pt-3">
          {indicadores.length > 0 && (
            <p className="text-[11px] text-warning bg-warning/5 border border-warning/20 rounded-lg px-3 py-2">
              Esta meta tiene {indicadores.length}{" "}
              {indicadores.length === 1 ? "indicador" : "indicadores"}, así que su
              porcentaje sale de ellos. Lo que escribas acá <strong>queda registrado</strong>{" "}
              y pasa por Validaciones, pero no mueve el porcentaje. Para que se mueva,
              cargá el valor en el indicador que corresponda —{" "}
              {indicadores.length === 1 ? "está" : "están"} acá abajo.
            </p>
          )}
          <AvanceForm meta={meta} proyectoId={proyectoId} onClose={() => setShowForm(false)} />
        </div>
      )}
    </div>
  );
}

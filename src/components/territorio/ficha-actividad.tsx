"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { editarActividad, borrarActividad } from "@/lib/actions-actividad";
import { TIPOS, ESTADOS, type Actividad } from "@/lib/agenda-geo-comun";
import { SelectorUbicacion } from "./selector-ubicacion";
import type { UnidadOrganizacional } from "@/types/database";

/**
 * La ficha de una actividad — etapa 4 del plan del 22.09.
 *
 * "El detalle completo: responsables, ubicación, antecedentes, documentación,
 * proyectos vinculados."
 *
 * Es también la primera pantalla donde una actividad se puede EDITAR. Las
 * acciones existían desde la etapa 1 y ninguna pantalla las llamaba: se cargaba
 * y quedaba congelada. La carga rápida siempre prometió que "después se
 * completa", y hasta acá no había dónde.
 *
 * Se guarda todo junto con un botón y no campo por campo. Con guardado
 * automático, cada tecla del briefing sería un UPDATE y el historial —que anota
 * una fila por campo modificado— quedaría con cien filas por una redacción.
 */

interface Props {
  actividad: Actividad;
  /** Áreas donde esta persona puede cargar; vacío significa solo lectura. */
  unidades: UnidadOrganizacional[];
  proyectos: { id: string; nombre: string; codigo: string | null }[];
  puedeEditar: boolean;
}

export function FichaActividad({ actividad, unidades, proyectos, puedeEditar }: Props) {
  const router = useRouter();
  const [pendiente, empezar] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const [v, setV] = useState({
    titulo: actividad.titulo,
    fecha: actividad.fecha,
    hora_desde: actividad.hora_desde?.slice(0, 5) ?? "",
    hora_hasta: actividad.hora_hasta?.slice(0, 5) ?? "",
    unidad_id: actividad.unidad_id,
    tipo: actividad.tipo,
    estado: actividad.estado,
    lugar_texto: actividad.lugar_texto ?? "",
    lat: actividad.lat,
    lng: actividad.lng,
    descripcion: actividad.descripcion ?? "",
    briefing: actividad.briefing ?? "",
    proyecto_id: actividad.proyecto_id ?? "",
    requiere_confirmacion: actividad.requiere_confirmacion,
  });
  const set = <K extends keyof typeof v>(k: K, valor: (typeof v)[K]) =>
    setV((x) => ({ ...x, [k]: valor }));

  const guardar = () => {
    setError(null);
    setAviso(null);
    empezar(async () => {
      const r = await editarActividad(actividad.id, {
        ...v,
        hora_desde: v.hora_desde || null,
        hora_hasta: v.hora_hasta || null,
        lugar_texto: v.lugar_texto || null,
        descripcion: v.descripcion || null,
        briefing: v.briefing || null,
        // El select usa "" para "ninguno" porque un <option> no puede valer
        // null; la columna sí acepta null y es lo que corresponde guardar.
        proyecto_id: v.proyecto_id || null,
      });
      if (!r.success) {
        setError(r.error ?? "No se pudo guardar");
        return;
      }
      setAviso("Guardado.");
      router.refresh();
    });
  };

  const darDeBaja = () => {
    if (
      !confirm(
        `¿Dar de baja "${actividad.titulo}"?\n\nEs para un error de carga. Si la actividad se cayó de verdad, marcala como suspendida: así queda a la vista y no se pierde que estaba prevista.`
      )
    ) {
      return;
    }
    setError(null);
    empezar(async () => {
      const r = await borrarActividad(actividad.id);
      if (!r.success) {
        setError(r.error ?? "No se pudo dar de baja");
        return;
      }
      router.push("/territorio/actividades");
    });
  };

  const campo =
    "w-full text-sm bg-background border border-border rounded px-3 py-2 disabled:opacity-60";
  const rotulo = "block text-[11px] text-muted uppercase tracking-wider mb-1";
  const off = !puedeEditar || pendiente;

  return (
    <div className="rounded-xl border border-border bg-surface p-4 space-y-4">
      {!puedeEditar && (
        <p className="text-[11px] text-muted border border-border rounded px-2 py-1.5">
          Estás viendo una actividad de otra área. Podés leerla completa, pero la edita
          quien la cargó.
        </p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="sm:col-span-2">
          <label className={rotulo}>Qué es</label>
          <input
            value={v.titulo}
            onChange={(e) => set("titulo", e.target.value)}
            disabled={off}
            className={campo}
          />
        </div>

        <div>
          <label className={rotulo}>Cuándo</label>
          <input
            type="date"
            value={v.fecha}
            onChange={(e) => set("fecha", e.target.value)}
            disabled={off}
            className={campo}
          />
        </div>

        <div>
          <label className={rotulo}>Área responsable</label>
          <select
            value={v.unidad_id}
            onChange={(e) => set("unidad_id", e.target.value)}
            disabled={off}
            className={campo}
          >
            {/* Si la actividad es de un área donde esta persona no carga, su
                área no está en la lista y el select quedaría vacío. */}
            {!unidades.some((u) => u.id === v.unidad_id) && (
              <option value={v.unidad_id}>{actividad.unidad_nombre ?? "Su área"}</option>
            )}
            {unidades.map((u) => (
              <option key={u.id} value={u.id}>
                {u.nombre_corto ?? u.nombre}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className={rotulo}>Desde</label>
          <input
            type="time"
            value={v.hora_desde}
            onChange={(e) => set("hora_desde", e.target.value)}
            disabled={off}
            className={campo}
          />
        </div>

        <div>
          <label className={rotulo}>Hasta</label>
          <input
            type="time"
            value={v.hora_hasta}
            onChange={(e) => set("hora_hasta", e.target.value)}
            disabled={off}
            className={campo}
          />
        </div>

        <div>
          <label className={rotulo}>Tipo</label>
          <select
            value={v.tipo}
            onChange={(e) => set("tipo", e.target.value)}
            disabled={off}
            className={campo}
          >
            {TIPOS.map((t) => (
              <option key={t.clave} value={t.clave}>
                {t.rotulo}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className={rotulo}>Estado</label>
          <select
            value={v.estado}
            onChange={(e) => set("estado", e.target.value)}
            disabled={off}
            className={campo}
          >
            {ESTADOS.map((e) => (
              <option key={e.clave} value={e.clave}>
                {e.rotulo}
              </option>
            ))}
          </select>
        </div>

        <SelectorUbicacion
          lugar={v.lugar_texto}
          lat={v.lat}
          lng={v.lng}
          onLugar={(x) => set("lugar_texto", x)}
          onPunto={(la, ln) => setV((x) => ({ ...x, lat: la, lng: ln }))}
          deshabilitado={off}
          claseCampo={campo}
          claseRotulo={rotulo}
        />

        <div className="sm:col-span-2">
          <label className={rotulo}>Detalle</label>
          <textarea
            value={v.descripcion}
            onChange={(e) => set("descripcion", e.target.value)}
            disabled={off}
            rows={3}
            className={campo}
          />
        </div>

        {/* El briefing es lo que el pedido llama "antecedentes y datos para
            preparar la actividad": lo que alguien necesita leer antes de ir,
            no la descripción de qué es. Por eso va aparte y más grande. */}
        <div className="sm:col-span-2">
          <label className={rotulo}>Briefing — antecedentes para preparar la actividad</label>
          <textarea
            value={v.briefing}
            onChange={(e) => set("briefing", e.target.value)}
            disabled={off}
            rows={6}
            placeholder="Qué se hizo antes en este barrio, con quién hay que hablar, qué se anunció, datos para tener a mano…"
            className={campo}
          />
        </div>

        <div className="sm:col-span-2">
          <label className={rotulo}>Proyecto del POA vinculado</label>
          <select
            value={v.proyecto_id}
            onChange={(e) => set("proyecto_id", e.target.value)}
            disabled={off}
            className={campo}
          >
            <option value="">Sin vincular</option>
            {/* Si está vinculada a un proyecto que no está en la lista —de otra
                área, o de otro período— igual se muestra: sacarlo del select
                haría que guardar cualquier otro campo lo desvinculara. */}
            {actividad.proyecto_id &&
              !proyectos.some((p) => p.id === actividad.proyecto_id) && (
                <option value={actividad.proyecto_id}>
                  {actividad.proyecto_nombre ?? "El proyecto vinculado"}
                </option>
              )}
            {proyectos.map((p) => (
              <option key={p.id} value={p.id}>
                {[p.codigo, p.nombre].filter(Boolean).join(" · ")}
              </option>
            ))}
          </select>
          <p className="text-[10px] text-muted/70 mt-1">
            Para poder mirar después qué actividades territoriales sostuvieron cada
            proyecto del POA.
          </p>
        </div>

        <label className="sm:col-span-2 flex items-start gap-2 text-xs text-foreground/90">
          <input
            type="checkbox"
            checked={v.requiere_confirmacion}
            onChange={(e) => set("requiere_confirmacion", e.target.checked)}
            disabled={off}
            className="mt-0.5"
          />
          <span>
            Requiere confirmación
            <span className="block text-[10px] text-muted">
              Aparece en “requiere atención” hasta que alguien la confirme.
            </span>
          </span>
        </label>
      </div>

      {error && <p className="text-xs text-danger">{error}</p>}
      {aviso && <p className="text-xs text-success">{aviso}</p>}

      {puedeEditar && (
        <div className="flex items-center justify-between gap-3 flex-wrap border-t border-border pt-3">
          <button
            onClick={guardar}
            disabled={pendiente}
            className="text-sm text-primary border border-primary/30 bg-primary/10 hover:bg-primary/20 disabled:opacity-40 rounded-lg px-4 py-1.5"
          >
            {pendiente ? "Guardando…" : "Guardar cambios"}
          </button>
          <button
            onClick={darDeBaja}
            disabled={pendiente}
            className="text-xs text-muted hover:text-danger underline disabled:opacity-40"
          >
            Dar de baja
          </button>
        </div>
      )}
    </div>
  );
}

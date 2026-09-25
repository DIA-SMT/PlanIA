"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { crearActividad } from "@/lib/actions-actividad";
import { TIPOS, ESTADOS } from "@/lib/agenda-geo-comun";
import type { UnidadOrganizacional } from "@/types/database";

/**
 * Alta de una actividad, con los dos modos que pide el 22.09.
 *
 * "Carga rápida: mecanismo simplificado para registrar actividades que surjan
 * espontáneamente o con poca anticipación, permitiendo completar la información
 * posteriormente."
 *
 * Por eso el formulario arranca en rápido —título, fecha y área, tres campos— y
 * se despliega al completo con un clic. Si el modo rápido pidiera una cosa más,
 * dejaría de ser rápido y nadie cargaría lo que surge sobre la hora, que es
 * justamente lo que se quiere capturar.
 *
 * La ubicación es texto por ahora. El pin en el mapa llega con la etapa 3.
 */
export function FormActividad({
  unidades,
  unidadPorDefecto,
  hoy,
}: {
  unidades: UnidadOrganizacional[];
  unidadPorDefecto: string | null;
  hoy: string;
}) {
  const router = useRouter();
  const [pendiente, startTransition] = useTransition();
  const [completo, setCompleto] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const vacio = {
    titulo: "",
    fecha: hoy,
    unidad_id: unidadPorDefecto ?? unidades[0]?.id ?? "",
    hora_desde: "",
    hora_hasta: "",
    tipo: "otras",
    estado: "programada",
    lugar_texto: "",
    descripcion: "",
    requiere_confirmacion: false,
  };
  const [v, setV] = useState(vacio);
  const set = <K extends keyof typeof vacio>(k: K, valor: (typeof vacio)[K]) =>
    setV((x) => ({ ...x, [k]: valor }));

  const guardar = () => {
    setError(null);
    setAviso(null);
    startTransition(async () => {
      const r = await crearActividad(v);
      if (!r.success) {
        setError(r.error ?? "No se pudo guardar");
        return;
      }
      setAviso(
        completo
          ? "Actividad cargada."
          : "Cargada. Cuando puedas, completá el horario, el lugar y el tipo."
      );
      setV({ ...vacio, fecha: v.fecha, unidad_id: v.unidad_id });
      router.refresh();
    });
  };

  const campo = "w-full text-sm bg-background border border-border rounded px-3 py-2 disabled:opacity-50";
  const rotulo = "block text-[11px] text-muted uppercase tracking-wider mb-1";

  if (unidades.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-surface p-4">
        <p className="text-sm text-muted">
          Tu perfil no tiene un área donde cargar actividades. Escribile a Planificación
          Estratégica.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-surface p-4 space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="text-sm font-bold text-foreground">
          {completo ? "Nueva actividad" : "Carga rápida"}
        </h2>
        <button
          onClick={() => setCompleto((c) => !c)}
          className="text-xs text-primary hover:underline"
        >
          {completo ? "Volver a la carga rápida" : "Cargar todos los datos"}
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="sm:col-span-2">
          <label className={rotulo}>Qué es</label>
          <input
            value={v.titulo}
            onChange={(e) => set("titulo", e.target.value)}
            disabled={pendiente}
            placeholder="Operativo de salud en el barrio…"
            className={campo}
          />
        </div>

        <div>
          <label className={rotulo}>Cuándo</label>
          <input
            type="date"
            value={v.fecha}
            onChange={(e) => set("fecha", e.target.value)}
            disabled={pendiente}
            className={campo}
          />
        </div>

        <div>
          <label className={rotulo}>Área responsable</label>
          <select
            value={v.unidad_id}
            onChange={(e) => set("unidad_id", e.target.value)}
            disabled={pendiente}
            className={campo}
          >
            {unidades.map((u) => (
              <option key={u.id} value={u.id}>
                {u.nombre_corto ?? u.nombre}
              </option>
            ))}
          </select>
        </div>

        {completo && (
          <>
            <div>
              <label className={rotulo}>Desde</label>
              <input
                type="time"
                value={v.hora_desde}
                onChange={(e) => set("hora_desde", e.target.value)}
                disabled={pendiente}
                className={campo}
              />
            </div>
            <div>
              <label className={rotulo}>Hasta</label>
              <input
                type="time"
                value={v.hora_hasta}
                onChange={(e) => set("hora_hasta", e.target.value)}
                disabled={pendiente}
                className={campo}
              />
            </div>

            <div>
              <label className={rotulo}>Tipo</label>
              <select
                value={v.tipo}
                onChange={(e) => set("tipo", e.target.value)}
                disabled={pendiente}
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
                disabled={pendiente}
                className={campo}
              >
                {ESTADOS.map((e) => (
                  <option key={e.clave} value={e.clave}>
                    {e.rotulo}
                  </option>
                ))}
              </select>
            </div>

            <div className="sm:col-span-2">
              <label className={rotulo}>Dónde</label>
              <input
                value={v.lugar_texto}
                onChange={(e) => set("lugar_texto", e.target.value)}
                disabled={pendiente}
                placeholder="Bº Ciudadela — Florida 1514"
                className={campo}
              />
              <p className="text-[10px] text-muted/70 mt-1">
                Por ahora se escribe. El punto en el mapa se va a poder marcar desde acá
                cuando esté el mapa.
              </p>
            </div>

            <div className="sm:col-span-2">
              <label className={rotulo}>Detalle</label>
              <textarea
                value={v.descripcion}
                onChange={(e) => set("descripcion", e.target.value)}
                disabled={pendiente}
                rows={3}
                className={campo}
              />
            </div>

            <label className="sm:col-span-2 flex items-start gap-2 text-xs text-foreground/90">
              <input
                type="checkbox"
                checked={v.requiere_confirmacion}
                onChange={(e) => set("requiere_confirmacion", e.target.checked)}
                disabled={pendiente}
                className="mt-0.5"
              />
              <span>
                Requiere confirmación
                <span className="block text-[10px] text-muted">
                  Aparece en “requiere atención” hasta que alguien la confirme.
                </span>
              </span>
            </label>
          </>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={guardar}
          disabled={pendiente || !v.titulo.trim()}
          className="text-sm bg-primary text-white rounded-lg px-4 py-2 hover:bg-primary/90 disabled:opacity-50"
        >
          {pendiente ? "Guardando…" : "Guardar"}
        </button>
        {aviso && <span className="text-xs text-success">{aviso}</span>}
        {error && <span className="text-xs text-danger">{error}</span>}
      </div>
    </div>
  );
}

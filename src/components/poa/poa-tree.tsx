"use client";

import { useState } from "react";
import Link from "next/link";
import type { EstadoSemaforo, UnidadOrganizacional } from "@/types/database";
import { StatusBadge } from "@/components/ui/status-badge";
import { ProgressBar } from "@/components/ui/progress-bar";
import { IndicadorCargaInline } from "./indicador-carga-inline";
import { avanceIndicador, estadoDeAvance } from "@/lib/utils";

// Tipos planos para el árbol
export interface PoaIndicador {
  id: string;
  codigo: string | null;
  nombre: string;
  valor_actual: number | null;
  valor_actual_texto: string | null;
  valor_objetivo: number | null;
  valor_objetivo_texto: string | null;
  unidad_medida: string | null;
  estado_semaforo: EstadoSemaforo;
  /** Hace falta para `avanceIndicador`: ahí vive la marca `invertida`. */
  metadata: Record<string, unknown> | null;
}

export interface PoaMeta {
  id: string;
  codigo: string | null;
  nombre: string;
  estado_semaforo: EstadoSemaforo;
  ultima_actualizacion: string | null;
  indicadores: PoaIndicador[];
}

export interface PoaProyecto {
  id: string;
  codigo: string | null;
  nombre: string;
  unidad_id: string;
  unidad_nombre: string | null;
  metas: PoaMeta[];
  porcentaje: number;
  estado: EstadoSemaforo;
  tieneSeguimiento: boolean;
  puedeCargar: boolean;
}

export interface PoaDireccion {
  unidad: UnidadOrganizacional;
  proyectos: PoaProyecto[];
  // Subdirecciones (nivel 3) dentro de la dirección, con sus proyectos
  subdirecciones?: { unidad: UnidadOrganizacional; proyectos: PoaProyecto[] }[];
}

export interface PoaArbolNodo {
  unidad: UnidadOrganizacional;
  // Proyectos cuyo unidad_id es la secretaría misma (sin dirección intermedia)
  proyectosDirectos: PoaProyecto[];
  subs: {
    unidad: UnidadOrganizacional;
    proyectosDirectos: PoaProyecto[]; // proyectos cuyo unidad_id es la subsec misma
    dirs: PoaDireccion[];
  }[];
  dirsDirectas: PoaDireccion[];
}

interface Props {
  arbol: PoaArbolNodo[];
  autoExpand?: boolean;
}

function contarIndicadores(proyectos: PoaProyecto[]) {
  let total = 0;
  for (const p of proyectos) for (const m of p.metas) total += m.indicadores.length;
  return total;
}

function contarMetas(proyectos: PoaProyecto[]) {
  return proyectos.reduce((acc, p) => acc + p.metas.length, 0);
}

export function PoaTree({ arbol, autoExpand = false }: Props) {
  if (arbol.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-surface p-8 text-center">
        <p className="text-sm text-muted">Sin resultados</p>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {arbol.map((nodo) => (
        <SecretariaNode key={nodo.unidad.id} nodo={nodo} autoExpand={autoExpand} />
      ))}
    </div>
  );
}

function SecretariaNode({ nodo, autoExpand }: { nodo: PoaArbolNodo; autoExpand: boolean }) {
  const dirPys = (d: { proyectos: PoaProyecto[]; subdirecciones?: { proyectos: PoaProyecto[] }[] }) =>
    [...d.proyectos, ...(d.subdirecciones ?? []).flatMap((s) => s.proyectos)];
  const todosProyectos = [
    ...nodo.proyectosDirectos,
    ...nodo.dirsDirectas.flatMap(dirPys),
    ...nodo.subs.flatMap((s) => [...s.proyectosDirectos, ...s.dirs.flatMap(dirPys)]),
  ];
  const totalPy = todosProyectos.length;
  if (totalPy === 0) return null;
  const totalMet = contarMetas(todosProyectos);
  const totalInd = contarIndicadores(todosProyectos);

  return (
    <details open={autoExpand} className="rounded-xl border border-border bg-surface overflow-hidden">
      <summary className="cursor-pointer p-4 hover:bg-surface-hover transition-colors flex items-center gap-3">
        <span className="text-muted text-xs w-3 group-open:rotate-90 transition-transform">▸</span>
        <div className="h-8 w-8 rounded-lg bg-primary/20 flex items-center justify-center text-xs font-bold text-primary shrink-0">
          {nodo.unidad.nombre_corto?.[0] ?? nodo.unidad.nombre[0]}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-foreground line-clamp-1">{nodo.unidad.nombre}</p>
          <p className="text-[10px] text-muted">
            {totalPy} proyectos · {totalMet} metas · {totalInd} indicadores
          </p>
        </div>
      </summary>
      <div className="px-4 pb-4 space-y-2 border-t border-border/50">
        {/* Proyectos directamente bajo la secretaría (sin dirección) */}
        {nodo.proyectosDirectos.length > 0 && (
          <div className="space-y-1.5 pt-2">
            {nodo.proyectosDirectos.map((py) => (
              <ProyectoNode key={py.id} py={py} />
            ))}
          </div>
        )}
        {nodo.subs.map((s) => (
          <SubsecretariaNode key={s.unidad.id} sub={s} autoExpand={autoExpand} />
        ))}
        {nodo.dirsDirectas.map((d) => (
          <DireccionNode key={d.unidad.id} dir={d} autoExpand={autoExpand} />
        ))}
      </div>
    </details>
  );
}

function SubsecretariaNode({
  sub,
  autoExpand,
}: {
  sub: {
    unidad: UnidadOrganizacional;
    proyectosDirectos: PoaProyecto[];
    dirs: PoaDireccion[];
  };
  autoExpand: boolean;
}) {
  const totalPy =
    sub.proyectosDirectos.length +
    sub.dirs.reduce(
      (acc, d) => acc + d.proyectos.length + (d.subdirecciones ?? []).reduce((a, s) => a + s.proyectos.length, 0),
      0
    );
  if (totalPy === 0) return null;
  return (
    <details open={autoExpand} className="rounded-lg border border-border/60 bg-background/40 ml-4">
      <summary className="cursor-pointer p-3 hover:bg-surface-hover/50 flex items-center gap-2">
        <span className="text-muted text-xs">▸</span>
        <div className="h-6 w-6 rounded bg-accent/20 flex items-center justify-center text-[10px] font-bold text-accent">
          {sub.unidad.nombre_corto?.[0] ?? sub.unidad.nombre[0]}
        </div>
        <p className="text-xs font-semibold text-foreground flex-1 line-clamp-1">{sub.unidad.nombre}</p>
        <span className="text-[10px] text-muted">{totalPy} proy.</span>
      </summary>
      <div className="px-3 pb-3 space-y-1.5 border-t border-border/30">
        {sub.proyectosDirectos.length > 0 && (
          <div className="space-y-1.5 pt-1.5">
            {sub.proyectosDirectos.map((py) => (
              <ProyectoNode key={py.id} py={py} />
            ))}
          </div>
        )}
        {sub.dirs.map((d) => (
          <DireccionNode key={d.unidad.id} dir={d} autoExpand={autoExpand} />
        ))}
      </div>
    </details>
  );
}

function DireccionNode({
  dir,
  autoExpand,
}: {
  dir: {
    unidad: UnidadOrganizacional;
    proyectos: PoaProyecto[];
    subdirecciones?: { unidad: UnidadOrganizacional; proyectos: PoaProyecto[] }[];
  };
  autoExpand: boolean;
}) {
  const subs = dir.subdirecciones ?? [];
  const totalSubPy = subs.reduce((acc, s) => acc + s.proyectos.length, 0);
  if (dir.proyectos.length === 0 && totalSubPy === 0) return null;
  return (
    <details open={autoExpand} className="rounded-lg border border-border/40 bg-background/20 ml-4">
      <summary className="cursor-pointer p-2.5 hover:bg-surface-hover/30 flex items-center gap-2">
        <span className="text-muted text-xs">▸</span>
        <p className="text-xs font-semibold text-accent uppercase tracking-wider flex-1 line-clamp-1">
          {dir.unidad.nombre_corto ?? dir.unidad.nombre}
        </p>
        <span className="text-[10px] text-muted">{dir.proyectos.length + totalSubPy} proy.</span>
      </summary>
      <div className="px-3 pb-3 space-y-1.5">
        {dir.proyectos.map((py) => (
          <ProyectoNode key={py.id} py={py} />
        ))}
        {subs.map((s) => (
          <SubdireccionNode key={s.unidad.id} sub={s} autoExpand={autoExpand} />
        ))}
      </div>
    </details>
  );
}

function SubdireccionNode({
  sub,
  autoExpand,
}: {
  sub: { unidad: UnidadOrganizacional; proyectos: PoaProyecto[] };
  autoExpand: boolean;
}) {
  if (sub.proyectos.length === 0) return null;
  return (
    <details open={autoExpand} className="rounded-md border border-border/30 bg-background/30 ml-3">
      <summary className="cursor-pointer p-2 hover:bg-surface-hover/20 flex items-center gap-2">
        <span className="text-muted text-xs">▸</span>
        <span className="text-[10px] text-muted">↳</span>
        <p className="text-[11px] font-medium text-foreground/90 flex-1 line-clamp-1">
          {sub.unidad.nombre_corto ?? sub.unidad.nombre}
        </p>
        <span className="text-[10px] text-muted">{sub.proyectos.length} proy.</span>
      </summary>
      <div className="px-3 pb-2 space-y-1.5">
        {sub.proyectos.map((py) => (
          <ProyectoNode key={py.id} py={py} />
        ))}
      </div>
    </details>
  );
}

function ProyectoNode({ py }: { py: PoaProyecto }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="rounded-md border border-border bg-surface">
      <div className="p-2.5 flex items-center gap-2">
        <button onClick={() => setExpanded((v) => !v)} className="text-muted hover:text-foreground text-xs w-3">
          {expanded ? "▾" : "▸"}
        </button>
        <StatusBadge estado={py.estado} />
        {py.codigo && (
          <span className="text-[10px] font-mono text-muted bg-border/50 px-1.5 py-0.5 rounded shrink-0">
            {py.codigo}
          </span>
        )}
        <Link
          href={`/proyectos/${py.id}`}
          className="flex-1 min-w-0 text-xs font-semibold text-foreground hover:text-primary line-clamp-1"
          title={py.nombre}
        >
          {py.nombre}
        </Link>
        <span className="text-[10px] text-muted shrink-0">{py.metas.length} metas</span>
        {py.tieneSeguimiento ? (
          <div className="flex items-center gap-2 shrink-0">
            <div className="w-20 hidden md:block">
              <ProgressBar value={py.porcentaje} estado={py.estado} size="sm" />
            </div>
            <span className="text-xs font-bold text-foreground w-9 text-right">{py.porcentaje}%</span>
          </div>
        ) : (
          <span className="text-[9px] text-muted/60 uppercase shrink-0">sin datos</span>
        )}
      </div>
      {expanded && (
        <div className="px-3 pb-3 space-y-2 border-t border-border/30">
          {py.metas.map((m) => (
            <MetaNode key={m.id} meta={m} proyectoId={py.id} puedeCargar={py.puedeCargar} />
          ))}
        </div>
      )}
    </div>
  );
}

function MetaNode({
  meta,
  proyectoId,
  puedeCargar,
}: {
  meta: PoaMeta;
  proyectoId: string;
  puedeCargar: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="rounded border border-border/60 bg-background/40 p-2">
      <div className="flex items-center gap-2">
        <button onClick={() => setExpanded((v) => !v)} className="text-muted text-xs w-3 hover:text-foreground">
          {expanded ? "▾" : "▸"}
        </button>
        <StatusBadge estado={meta.estado_semaforo} />
        <p className="text-xs text-foreground flex-1 line-clamp-2" title={meta.nombre}>
          {meta.nombre}
        </p>
        <span className="text-[10px] text-muted shrink-0">{meta.indicadores.length} ind.</span>
      </div>
      {expanded && (
        <div className="mt-2 pl-4 space-y-1">
          {meta.indicadores.length === 0 ? (
            <p className="text-[10px] text-muted italic">Sin indicadores cargados</p>
          ) : (
            meta.indicadores.map((ind) => (
              <IndicadorRow key={ind.id} ind={ind} proyectoId={proyectoId} puedeCargar={puedeCargar} />
            ))
          )}
        </div>
      )}
    </div>
  );
}

function IndicadorRow({
  ind,
  proyectoId,
  puedeCargar,
}: {
  ind: PoaIndicador;
  proyectoId: string;
  puedeCargar: boolean;
}) {
  const [editing, setEditing] = useState(false);

  // El punto se calcula al mostrar, con la misma regla que la meta y el
  // proyecto (verde = 100 %). Antes usaba `estado_semaforo` crudo, que se
  // escribe con otro umbral (`actions.ts:219`, verde desde el 80 %): medido el
  // 10.09, 45 de los 360 indicadores guardados en verde tienen su avance real
  // por debajo del 100 %, 39 de ellos justo entre el 80 % y el 99 %. Desde que
  // el proyecto pasó a exigir el 100 %, esos puntos quedaban verdes al lado de
  // una meta "En ejecución", en la misma fila.
  //
  // Se arregla al mostrar y NO moviendo el umbral de escritura: `avanceIndicador`
  // usa `estado_semaforo` como ENTRADA para el indicador de texto y para el
  // numérico sin objetivo, así que cambiar cómo se guarda les movería el
  // porcentaje a 178 indicadores. Acá no se toca ningún dato.
  const pctIndicador = avanceIndicador(ind);
  const estadoDelPunto = estadoDeAvance(pctIndicador);

  return (
    <div className="rounded bg-surface border border-border/40 p-2 text-xs">
      <div className="flex items-center gap-2">
        <span
          className={`h-2 w-2 rounded-full shrink-0 ${
            estadoDelPunto === "verde"
              ? "bg-success"
              : estadoDelPunto === "amarillo"
              ? "bg-warning"
              : estadoDelPunto === "rojo"
              ? "bg-info"
              : "bg-muted/40"
          }`}
          title={pctIndicador == null ? "Sin dato cargado" : `${pctIndicador} % de avance`}
        />
        {ind.codigo && (
          <span className="text-[9px] font-mono text-muted bg-border/50 px-1 py-0.5 rounded shrink-0">{ind.codigo}</span>
        )}
        <Link
          href={`/indicadores/${ind.id}`}
          className="flex-1 min-w-0 text-foreground hover:text-primary line-clamp-1"
          title={ind.nombre}
        >
          {ind.nombre}
        </Link>
        <span className="text-[10px] text-muted shrink-0">
          {ind.valor_actual_texto ?? ind.valor_actual ?? "—"}
          {(ind.valor_objetivo_texto ?? ind.valor_objetivo) != null && (
            <> / {ind.valor_objetivo_texto ?? ind.valor_objetivo}</>
          )}{" "}
          {ind.unidad_medida ?? ""}
        </span>
        {puedeCargar && (
          <button
            onClick={() => setEditing((v) => !v)}
            className="text-[10px] text-primary hover:text-primary-light shrink-0"
          >
            {editing ? "Cerrar" : "✎"}
          </button>
        )}
      </div>
      {editing && (
        <div className="mt-2">
          <IndicadorCargaInline
            indicadorId={ind.id}
            proyectoId={proyectoId}
            valorActual={ind.valor_actual}
            valorActualTexto={ind.valor_actual_texto}
            valorObjetivo={ind.valor_objetivo}
            valorObjetivoTexto={ind.valor_objetivo_texto}
            unidadMedida={ind.unidad_medida}
            onClose={() => setEditing(false)}
          />
        </div>
      )}
    </div>
  );
}

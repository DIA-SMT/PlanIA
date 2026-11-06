"use client";

import { useState, useTransition } from "react";
import { actualizarIndicador } from "@/lib/actions";

interface Props {
  indicadorId: string;
  proyectoId: string;
  valorActual: number | null;
  valorActualTexto?: string | null;
  valorObjetivo: number | null;
  valorObjetivoTexto?: string | null;
  unidadMedida: string | null;
  onClose: () => void;
}

type Modo = "numerico" | "texto";

export function IndicadorCargaInline({
  indicadorId,
  proyectoId,
  valorActual,
  valorActualTexto,
  valorObjetivo,
  valorObjetivoTexto,
  unidadMedida,
  onClose,
}: Props) {
  const [modo, setModo] = useState<Modo>(
    valorActualTexto != null || valorObjetivoTexto != null ? "texto" : "numerico"
  );
  const [valor, setValor] = useState(valorActual?.toString() ?? "");
  const [valorTxt, setValorTxt] = useState(valorActualTexto ?? "");
  const [obj, setObj] = useState(valorObjetivo?.toString() ?? "");
  const [objTxt, setObjTxt] = useState(valorObjetivoTexto ?? "");
  const [unidad, setUnidad] = useState(unidadMedida ?? "");
  const [estadoTexto, setEstadoTexto] = useState<"verde" | "amarillo" | "rojo">("amarillo");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    setError(null);
    if (modo === "numerico") {
      const valorT = valor.trim();
      const objT = obj.trim();
      if (valorT === "" && objT === "") {
        setError("Ingresá un valor y/o un objetivo");
        return;
      }
      // Campo vacío ⇒ null (no 0), para no marcar avance inexistente.
      const num = valorT === "" ? null : Number(valorT);
      if (num != null && !isFinite(num)) {
        setError("Número inválido (sin signo %)");
        return;
      }
      startTransition(async () => {
        const r = await actualizarIndicador({
          indicador_id: indicadorId,
          valor_actual: num,
          valor_actual_texto: null,
          valor_objetivo: objT !== "" && isFinite(Number(objT)) ? Number(objT) : null,
          valor_objetivo_texto: null,
          unidad_medida: unidad || null,
          proyecto_id: proyectoId,
        });
        if (r.success) onClose();
        else setError(r.error ?? "Error");
      });
    } else {
      if (!valorTxt.trim()) {
        setError("Ingresá un valor (ej. Sí, Realizado)");
        return;
      }
      startTransition(async () => {
        const r = await actualizarIndicador({
          indicador_id: indicadorId,
          valor_actual: null,
          valor_actual_texto: valorTxt.trim(),
          // Como en IndicadorCargaForm (03.08): sin objetivo textual no se
          // mandan estos campos. En null borraban el objetivo numérico, y el
          // indicador pasaba a contarse como Sí/No, con el 50 % del semáforo.
          ...(objTxt.trim() ? { valor_objetivo: null, valor_objetivo_texto: objTxt.trim() } : {}),
          estado_semaforo_override: estadoTexto,
          unidad_medida: unidad || null,
          proyecto_id: proyectoId,
        });
        if (r.success) onClose();
        else setError(r.error ?? "Error");
      });
    }
  };

  return (
    <div className="space-y-2 bg-background border border-border rounded p-2.5">
      {/* Tipo */}
      <div className="flex gap-1">
        <button
          type="button"
          onClick={() => setModo("numerico")}
          className={`text-[10px] px-2 py-0.5 rounded border ${
            modo === "numerico" ? "bg-primary/20 text-primary border-primary/30" : "border-border text-muted"
          }`}
        >
          🔢 Numérico
        </button>
        <button
          type="button"
          onClick={() => setModo("texto")}
          className={`text-[10px] px-2 py-0.5 rounded border ${
            modo === "texto" ? "bg-primary/20 text-primary border-primary/30" : "border-border text-muted"
          }`}
        >
          🔤 Texto (Sí/No)
        </button>
      </div>

      {modo === "numerico" ? (
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-[10px] text-muted w-full">Valor actual / Objetivo {unidad && `(${unidad})`}</label>
          <input
            type="number"
            step="any"
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            placeholder="Actual"
            autoFocus
            className="w-20 text-xs bg-surface border border-border rounded px-2 py-1 text-foreground"
          />
          <span className="text-muted text-xs">/</span>
          <input
            type="number"
            step="any"
            value={obj}
            onChange={(e) => setObj(e.target.value)}
            placeholder="Objetivo"
            className="w-20 text-xs bg-surface border border-border rounded px-2 py-1 text-foreground"
          />
          <input
            type="text"
            value={unidad}
            onChange={(e) => setUnidad(e.target.value)}
            placeholder="unidad (%, días…)"
            className="w-28 text-xs bg-surface border border-border rounded px-2 py-1 text-foreground"
          />
        </div>
      ) : (
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              value={valorTxt}
              onChange={(e) => setValorTxt(e.target.value)}
              placeholder="Valor (Sí, Realizado…)"
              autoFocus
              className="w-32 text-xs bg-surface border border-border rounded px-2 py-1 text-foreground"
            />
            <input
              type="text"
              value={objTxt}
              onChange={(e) => setObjTxt(e.target.value)}
              placeholder="Objetivo (opcional)"
              className="w-32 text-xs bg-surface border border-border rounded px-2 py-1 text-foreground"
            />
          </div>
          <div className="flex gap-1">
            {(["verde", "amarillo", "rojo"] as const).map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => setEstadoTexto(e)}
                className={`text-[10px] px-2 py-0.5 rounded border ${
                  estadoTexto === e
                    ? e === "verde"
                      ? "bg-success/20 text-success border-success/30"
                      : e === "amarillo"
                      ? "bg-warning/20 text-warning border-warning/30"
                      : "bg-info/20 text-info border-info/30"
                    : "border-border text-muted"
                }`}
              >
                {e === "verde" ? "🟢 Finalizado" : e === "amarillo" ? "🟡 En ejecución" : "🔴 No iniciado"}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center gap-2">
        <button
          onClick={submit}
          disabled={isPending}
          className="text-[10px] bg-primary text-white rounded px-3 py-1 hover:bg-primary/90 disabled:opacity-50"
        >
          {isPending ? "Guardando..." : "Guardar"}
        </button>
        <button onClick={onClose} className="text-[10px] text-muted hover:text-foreground">
          Cancelar
        </button>
        {error && <span className="text-[10px] text-danger">{error}</span>}
      </div>
    </div>
  );
}

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  enviarPoaDelArea,
  reabrirPoaDelArea,
  observarFicha,
  resolverObservacion,
} from "@/lib/actions-poa-area";

/**
 * Los tres botones del circuito del POA 2027 — 25.09.
 *
 * Van juntos en un archivo porque son tres cosas chicas del mismo flujo y
 * separarlos en tres archivos de veinte líneas no aclara nada.
 */

/** "Enviar al POA de mi subsecretaría" / "Enviado el… · Reabrir". */
export function EnviarPoa({
  unidadId,
  destino,
  enviado,
  enviadoEl,
  sinFichas,
}: {
  unidadId: string;
  destino: string | null;
  enviado: boolean;
  enviadoEl: string | null;
  sinFichas: boolean;
}) {
  const router = useRouter();
  const [pendiente, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const correr = (fn: () => Promise<{ success: boolean; error?: string }>) => {
    setError(null);
    startTransition(async () => {
      const r = await fn();
      if (!r.success) setError(r.error ?? "No se pudo");
      else router.refresh();
    });
  };

  // Una secretaría no le manda a nadie: su POA es el final del camino.
  if (!destino) {
    return (
      <p className="text-xs text-muted">
        Este es el POA final: acá se consolida lo que mandan las áreas de abajo.
      </p>
    );
  }

  return (
    <div className="space-y-1.5">
      {enviado ? (
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs text-success border border-success/30 bg-success/5 rounded px-2 py-1">
            Enviado a {destino}
            {enviadoEl ? ` el ${new Date(enviadoEl).toLocaleDateString("es-AR")}` : ""}
          </span>
          <button
            onClick={() => correr(() => reabrirPoaDelArea(unidadId))}
            disabled={pendiente}
            className="text-xs text-muted hover:text-foreground underline disabled:opacity-50"
          >
            Volver a borrador
          </button>
        </div>
      ) : (
        <button
          onClick={() => correr(() => enviarPoaDelArea(unidadId))}
          disabled={pendiente || sinFichas}
          title={sinFichas ? "Cargá al menos una ficha antes de enviar" : undefined}
          className="text-sm bg-primary text-white rounded-lg px-4 py-2 hover:bg-primary/90 disabled:opacity-50"
        >
          {pendiente ? "Enviando…" : `Enviar al POA de ${destino}`}
        </button>
      )}
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}

/** Dejar una observación sobre una ficha ajena, sin tocarla. */
export function ObservarFicha({ fichaId, cuantas }: { fichaId: string; cuantas: number }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState("");
  const [pendiente, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const guardar = () => {
    setError(null);
    startTransition(async () => {
      const r = await observarFicha(fichaId, texto);
      if (!r.success) {
        setError(r.error ?? "No se pudo");
        return;
      }
      setTexto("");
      setAbierto(false);
      router.refresh();
    });
  };

  if (!abierto) {
    return (
      <button
        onClick={() => setAbierto(true)}
        className="text-[11px] text-muted hover:text-primary underline"
      >
        {cuantas > 0 ? `${cuantas} observación${cuantas === 1 ? "" : "es"} · agregar` : "Observar"}
      </button>
    );
  }

  return (
    <div className="space-y-1.5 w-full">
      <textarea
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        disabled={pendiente}
        rows={2}
        autoFocus
        placeholder="Qué habría que revisar de esta ficha…"
        className="w-full text-xs bg-background border border-border rounded px-2 py-1.5"
      />
      <div className="flex items-center gap-2">
        <button
          onClick={guardar}
          disabled={pendiente || !texto.trim()}
          className="text-xs bg-primary text-white rounded px-3 py-1 disabled:opacity-50"
        >
          Guardar
        </button>
        <button
          onClick={() => setAbierto(false)}
          className="text-xs text-muted hover:text-foreground underline"
        >
          Cancelar
        </button>
        {error && <span className="text-[11px] text-danger">{error}</span>}
      </div>
    </div>
  );
}

/** Marcar una observación propia como saldada. */
export function ResolverObservacion({ id }: { id: string }) {
  const router = useRouter();
  const [pendiente, startTransition] = useTransition();
  return (
    <button
      onClick={() =>
        startTransition(async () => {
          await resolverObservacion(id);
          router.refresh();
        })
      }
      disabled={pendiente}
      title="Marcarla como resuelta"
      className="text-[11px] text-muted hover:text-success disabled:opacity-50"
    >
      ✓
    </button>
  );
}

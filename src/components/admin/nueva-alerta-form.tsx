"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { crearAlerta } from "@/lib/actions";
import { coincideBusqueda, normalizarBusqueda } from "@/lib/utils";
import type { RolUsuario } from "@/types/database";

export interface DestinatarioOpcion {
  user_id: string;
  nombre: string | null;
  email: string;
  rol: RolUsuario;
  unidad_nombre: string | null;
}

const ROL_LABEL: Record<RolUsuario, string> = {
  intendenta: "Intendenta",
  secretario: "Secretarios",
  subsecretario: "Subsecretarios",
  director: "Directores",
  coordinador: "Coordinadores",
  admin_funcional: "Planificación Estratégica",
  admin_tecnico: "Sistemas",
};

const ORDEN_ROL: RolUsuario[] = [
  "intendenta",
  "secretario",
  "subsecretario",
  "coordinador",
  "director",
  "admin_funcional",
  "admin_tecnico",
];

type Modo = "todos" | "elegir";

export function NuevaAlertaForm({ perfiles }: { perfiles: DestinatarioOpcion[] }) {
  const router = useRouter();
  const [titulo, setTitulo] = useState("");
  const [cuerpo, setCuerpo] = useState("");
  const [importante, setImportante] = useState(false);
  const [vigenteHasta, setVigenteHasta] = useState("");
  const [modo, setModo] = useState<Modo>("todos");
  const [elegidos, setElegidos] = useState<Set<string>>(new Set());
  const [busqueda, setBusqueda] = useState("");
  const [confirmando, setConfirmando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const porRol = useMemo(() => {
    // `coincideBusqueda` espera el término ya normalizado.
    const q = normalizarBusqueda(busqueda);
    const filtrados = perfiles.filter(
      (p) => !q || [p.nombre, p.email, p.unidad_nombre].some((t) => coincideBusqueda(t, q))
    );
    return ORDEN_ROL.map((rol) => ({
      rol,
      gente: filtrados
        .filter((p) => p.rol === rol)
        .sort((a, b) => (a.nombre ?? a.email).localeCompare(b.nombre ?? b.email)),
    })).filter((g) => g.gente.length > 0);
  }, [perfiles, busqueda]);

  const cantidad = modo === "todos" ? perfiles.length : elegidos.size;

  const toggle = (userId: string) =>
    setElegidos((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });

  const toggleRol = (rol: RolUsuario, gente: DestinatarioOpcion[]) =>
    setElegidos((prev) => {
      const next = new Set(prev);
      const todosPuestos = gente.every((p) => next.has(p.user_id));
      for (const p of gente) {
        if (todosPuestos) next.delete(p.user_id);
        else next.add(p.user_id);
      }
      return next;
    });

  const revisar = () => {
    setError(null);
    setOk(null);
    if (!titulo.trim()) return setError("Escribí un título.");
    if (!cuerpo.trim()) return setError("Escribí el mensaje.");
    if (cantidad === 0) return setError("Elegí al menos un destinatario.");
    setConfirmando(true);
  };

  const enviar = () => {
    setError(null);
    startTransition(async () => {
      const r = await crearAlerta({
        titulo,
        cuerpo,
        importante,
        vigente_hasta: vigenteHasta || null,
        destinatarios: modo === "todos" ? "todos" : [...elegidos],
      });
      if (r.success) {
        // 09.09, párrafo 735: además de la campanita, el aviso va por correo.
        // Se dice exactamente qué pasó con el correo en vez de dar un "enviado"
        // a secas: si no está configurado o algo rebotó, quien lo mandó tiene
        // que enterarse en el momento, no cuando alguien pregunte por qué no le
        // llegó nada.
        const base = `Aviso enviado a ${r.enviadas} ${r.enviadas === 1 ? "persona" : "personas"}.`;
        const c = r.correo;
        const detalleCorreo = !c
          ? ""
          : !c.configurado
          ? " Por correo no salió: falta configurar el envío (avisale a Sistemas)."
          : c.error
          ? ` El correo falló: ${c.error}`
          : c.enviados === 0
          ? " Ninguno tenía correo cargado, así que solo les llega por la campanita."
          : ` Por correo le llegó a ${c.enviados}.` +
            (c.sinCorreo > 0
              ? ` ${c.sinCorreo} no ${c.sinCorreo === 1 ? "tiene" : "tienen"} correo cargado.`
              : "");
        setOk(base + detalleCorreo);
        setTitulo("");
        setCuerpo("");
        setImportante(false);
        setVigenteHasta("");
        setElegidos(new Set());
        setModo("todos");
        setConfirmando(false);
        router.refresh();
      } else {
        setError(r.error ?? "No se pudo enviar");
        setConfirmando(false);
      }
    });
  };

  return (
    <div className="rounded-xl border border-border bg-surface p-5 space-y-4">
      <div>
        <p className="text-sm font-semibold text-foreground">Nuevo aviso</p>
        <p className="text-xs text-muted mt-0.5">
          Aparece dentro del sistema: en la campanita de cada usuario y, si lo marcás
          como importante, también como cartel arriba de la pantalla.
        </p>
      </div>

      <div>
        <label className="text-[10px] text-muted uppercase tracking-wider">Título</label>
        <input
          value={titulo}
          onChange={(e) => setTitulo(e.target.value)}
          maxLength={160}
          placeholder="Presentación de informes de grado de avance"
          className="w-full text-sm bg-background border border-border rounded px-3 py-2 mt-0.5"
        />
      </div>

      <div>
        <label className="text-[10px] text-muted uppercase tracking-wider">Mensaje</label>
        <textarea
          value={cuerpo}
          onChange={(e) => setCuerpo(e.target.value)}
          maxLength={2000}
          rows={4}
          placeholder="Presentación de informes de grado de avance: 01 de octubre. Por favor actualice sus datos en el sistema."
          className="w-full text-sm bg-background border border-border rounded px-3 py-2 mt-0.5"
        />
        <p className="text-[10px] text-muted mt-1">{cuerpo.length}/2000</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <label className="flex items-start gap-2 text-xs text-muted cursor-pointer">
          <input
            type="checkbox"
            checked={importante}
            onChange={(e) => setImportante(e.target.checked)}
            className="accent-warning mt-0.5"
          />
          <span>
            <span className="text-foreground font-medium">Importante</span>
            <br />
            Además de la campanita, muestra un cartel arriba de la pantalla hasta que
            cada uno lo cierre.
          </span>
        </label>
        <div>
          <label className="text-[10px] text-muted uppercase tracking-wider">
            Mostrar hasta (opcional)
          </label>
          <input
            type="date"
            value={vigenteHasta}
            onChange={(e) => setVigenteHasta(e.target.value)}
            className="w-full text-sm bg-background border border-border rounded px-3 py-2 mt-0.5"
          />
          <p className="text-[10px] text-muted mt-1">
            Después de esa fecha deja de mostrarse. Vacío = sin vencimiento.
          </p>
        </div>
      </div>

      {/* Destinatarios */}
      <div className="space-y-2">
        <p className="text-[10px] text-muted uppercase tracking-wider">Destinatarios</p>
        <div className="flex gap-1">
          {(["todos", "elegir"] as Modo[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setModo(m)}
              className={`text-xs px-3 py-1.5 rounded border transition-colors ${
                modo === m
                  ? "bg-primary/10 text-primary border-primary/30"
                  : "text-muted border-border hover:text-foreground"
              }`}
            >
              {m === "todos" ? `Todos (${perfiles.length})` : "Elegir personas"}
            </button>
          ))}
        </div>

        {modo === "elegir" && (
          <div className="rounded-lg border border-border">
            <div className="p-2 border-b border-border">
              <input
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar por nombre, email o área..."
                className="w-full text-xs bg-background border border-border rounded px-2 py-1.5"
              />
            </div>
            <div className="max-h-64 overflow-y-auto p-2 space-y-3">
              {porRol.length === 0 && (
                <p className="text-xs text-muted text-center py-3">Sin resultados.</p>
              )}
              {porRol.map(({ rol, gente }) => (
                <div key={rol}>
                  <button
                    type="button"
                    onClick={() => toggleRol(rol, gente)}
                    className="text-[10px] font-semibold text-primary uppercase tracking-wider hover:text-primary-light"
                  >
                    {ROL_LABEL[rol]} ({gente.length})
                  </button>
                  <div className="mt-1 space-y-0.5">
                    {gente.map((p) => (
                      <label
                        key={p.user_id}
                        className="flex items-center gap-2 text-xs cursor-pointer hover:bg-surface-hover rounded px-1 py-0.5"
                      >
                        <input
                          type="checkbox"
                          checked={elegidos.has(p.user_id)}
                          onChange={() => toggle(p.user_id)}
                          className="accent-primary"
                        />
                        <span className="text-foreground">{p.nombre ?? p.email}</span>
                        {p.unidad_nombre && (
                          <span className="text-muted text-[10px] truncate">
                            · {p.unidad_nombre}
                          </span>
                        )}
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {error && <p className="text-xs text-danger">{error}</p>}
      {ok && <p className="text-xs text-success">✓ {ok}</p>}

      {/* Se confirma antes de mandar: una vez enviado le aparece a todo el mundo. */}
      {confirmando ? (
        <div className="rounded-lg border border-warning/40 bg-warning/10 p-3 space-y-2">
          <p className="text-xs text-foreground">
            Se va a enviar a <span className="font-semibold">{cantidad}</span>{" "}
            {cantidad === 1 ? "persona" : "personas"}
            {importante ? ", con cartel arriba de la pantalla" : ""}. ¿Confirmás?
          </p>
          <div className="flex gap-2">
            <button
              onClick={enviar}
              disabled={isPending}
              className="text-sm bg-primary text-white rounded-lg px-4 py-2 hover:bg-primary/90 disabled:opacity-50"
            >
              {isPending ? "Enviando..." : "Sí, enviar"}
            </button>
            <button
              onClick={() => setConfirmando(false)}
              className="text-sm text-muted hover:text-foreground"
            >
              Volver
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={revisar}
          disabled={isPending}
          className="text-sm bg-primary text-white rounded-lg px-4 py-2 hover:bg-primary/90 disabled:opacity-50"
        >
          Revisar y enviar
        </button>
      )}
    </div>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { getPerfilActual } from "@/lib/auth";
import { getUnidades, getPeriodoActivo, getProyectos } from "@/lib/queries";
import { unidadesQuePuedeCargar, formatFecha } from "@/lib/utils";
import {
  getActividad,
  getHistorial,
  getDocumentos,
  tipoDe,
  estadoDe,
  faltantesDe,
  type DocumentoActividad,
  type CambioActividad,
} from "@/lib/agenda-geo";
import { FichaActividad } from "@/components/territorio/ficha-actividad";
import { DocumentosActividad } from "@/components/territorio/documentos-actividad";
import { HistorialActividad } from "@/components/territorio/historial-actividad";
import { MapaCliente } from "@/components/territorio/mapa-cliente";
import { BackButton } from "@/components/layout/back-button";

export const revalidate = 0;

/**
 * La ficha de una actividad — etapa 4 del plan del 22.09.
 *
 * Es el destino que faltaba: hasta acá los chips del calendario y los globos
 * del mapa no llevaban a ninguna parte, porque no había adónde.
 *
 * Y es la primera pantalla donde una actividad se puede editar. Las acciones
 * estaban escritas desde la etapa 1 y ninguna pantalla las llamaba.
 */
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const a = await getActividad(id);
  return { title: a?.titulo ?? "Actividad" };
}

export default async function FichaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const actividad = await getActividad(id);
  // Una actividad dada de baja no tiene ficha: `getActividad` ya las descarta.
  if (!actividad) notFound();

  const perfil = await getPerfilActual();
  const unidades = await getUnidades().catch(() => []);
  const editables = perfil ? unidadesQuePuedeCargar(perfil, unidades) : [];
  const puedeEditar = editables.some((u) => u.id === actividad.unidad_id);

  // Los proyectos del POA para vincular, del período activo. Si algo de esto
  // falla —un período sin cargar, por ejemplo— la ficha sigue andando sin la
  // lista: vincular un proyecto es lo accesorio de esta pantalla.
  let proyectos: { id: string; nombre: string; codigo: string | null }[] = [];
  try {
    const periodo = await getPeriodoActivo();
    const todos = await getProyectos(periodo.id);
    proyectos = todos
      .filter((p) => editables.some((u) => u.id === p.unidad_id))
      .map((p) => ({ id: p.id, nombre: p.nombre, codigo: p.codigo ?? null }));
  } catch {
    proyectos = [];
  }

  let documentos: DocumentoActividad[] = [];
  let historial: CambioActividad[] = [];
  try {
    [documentos, historial] = await Promise.all([getDocumentos(id), getHistorial(id)]);
  } catch {
    // La migración 055 puede no estar aplicada: la ficha vale igual sin los
    // adjuntos, y el aviso de que falta va abajo.
  }

  const t = tipoDe(actividad.tipo);
  const e = estadoDe(actividad.estado);
  const faltan = faltantesDe(actividad);

  return (
    <div className="space-y-6 max-w-4xl">
      <BackButton fallback="/territorio/actividades" />

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className="h-3 w-3 rounded-full shrink-0"
              style={{ backgroundColor: t.hex }}
              title={t.rotulo}
            />
            <h1 className="text-2xl font-bold text-foreground">{actividad.titulo}</h1>
            <span
              className={`text-[10px] uppercase tracking-wider border rounded px-1.5 py-0.5 ${e.clase}`}
            >
              {e.rotulo}
            </span>
          </div>
          <p className="text-sm text-muted mt-1">
            {formatFecha(actividad.fecha)}
            {actividad.hora_desde ? ` · ${actividad.hora_desde.slice(0, 5)}` : ""}
            {actividad.hora_hasta ? ` a ${actividad.hora_hasta.slice(0, 5)}` : ""}
            {" · "}
            {actividad.unidad_nombre ?? "—"}
            {" · "}
            {t.rotulo}
          </p>
        </div>
        <Link
          href={{ pathname: "/territorio/agenda", query: { vista: "dia", fecha: actividad.fecha } }}
          className="text-xs text-foreground border border-border hover:border-primary/40 rounded-lg px-3 py-1.5 self-start"
        >
          📅 Ver el día
        </Link>
      </div>

      {faltan.length > 0 && (
        <p className="text-xs text-warning border border-warning/30 bg-warning/5 rounded-lg px-3 py-2">
          Le falta: {faltan.join(", ")}.{" "}
          {puedeEditar
            ? "Se completa acá abajo."
            : "Lo completa el área responsable."}
        </p>
      )}

      <FichaActividad
        actividad={actividad}
        unidades={editables}
        proyectos={proyectos}
        puedeEditar={puedeEditar}
      />

      {/* El punto en el mapa, para mirarlo. Corregirlo se hace arriba, en el
          selector de la ficha, que ya trae su propio mapa arrastrable. */}
      {actividad.lat != null && actividad.lng != null && (
        <section className="space-y-2">
          <h2 className="text-sm font-bold text-foreground">Dónde queda</h2>
          <MapaCliente actividades={[actividad]} alto="320px" />
        </section>
      )}

      <DocumentosActividad
        actividadId={actividad.id}
        documentos={documentos}
        puedeEditar={puedeEditar}
      />

      <section className="rounded-xl border border-border bg-surface p-4 space-y-2">
        <h2 className="text-sm font-bold text-foreground">Historial de cambios</h2>
        <p className="text-[11px] text-muted/80">
          Lo anota la base sola, una línea por campo modificado. No se puede editar.
        </p>
        <HistorialActividad cambios={historial} limite={30} />
      </section>
    </div>
  );
}

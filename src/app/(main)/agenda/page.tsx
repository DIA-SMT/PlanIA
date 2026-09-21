import {
  getUnidades,
  getAgendasSemana,
  getEventosAgenda,
  getHitosDelRango,
  lunesIso,
  sumarDias,
  type EventoAgenda,
} from "@/lib/queries";
import { getPerfilActual } from "@/lib/auth";
import {
  coincideBusqueda,
  perfilVeTodo,
  normalizarBusqueda,
  unidadesQueGestionaAgenda,
} from "@/lib/utils";
import Link from "next/link";
import { Suspense } from "react";
import { CalendarioToolbar, type VistaCalendario } from "@/components/agenda/calendario-toolbar";
import { CalendarioVista } from "@/components/agenda/calendario-vista";
import { NuevaActividadForm } from "@/components/agenda/nueva-actividad-form";
import { SuscribirCalendario } from "@/components/agenda/suscribir-calendario";
import { tokenDeUnidad } from "@/lib/ics";
import type { AgendaSemana, UnidadOrganizacional } from "@/types/database";

export const revalidate = 0;

interface Props {
  searchParams: Promise<{
    vista?: string;
    fecha?: string;
    sec?: string;
    sub?: string;
    dir?: string;
    q?: string;
    /** "0" apaga los hitos del municipio dentro de la cuadrícula (18.09). */
    eventos?: string;
    // Compatibilidad con los links viejos (?semana=YYYY-MM-DD)
    semana?: string;
  }>;
}

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

const esIso = (s: string | undefined): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);

export default async function AgendaPage({ searchParams }: Props) {
  const params = await searchParams;

  const hoy = new Date().toISOString().slice(0, 10);
  const vista: VistaCalendario =
    params.vista === "semana" || params.vista === "dia" ? params.vista : "mes";
  const fecha = esIso(params.fecha) ? params.fecha : esIso(params.semana) ? params.semana : hoy;
  // 18.09: los hitos del municipio se pintan dentro de la cuadrícula y el
  // interruptor "Evento" de la barra los saca. Prendido por defecto.
  const verHitos = params.eventos !== "0";

  // -------------------------------------------------------
  // Rango de días que se muestra según la vista
  // -------------------------------------------------------
  let desde: string;
  let hasta: string;
  let titulo: string;
  let anterior: string;
  let siguiente: string;
  const mesReferencia = Number(fecha.slice(5, 7)) - 1;

  if (vista === "dia") {
    desde = fecha;
    hasta = fecha;
    anterior = sumarDias(fecha, -1);
    siguiente = sumarDias(fecha, 1);
    titulo = new Date(fecha + "T00:00:00").toLocaleDateString("es-AR", {
      weekday: "long",
      day: "numeric",
      month: "long",
    });
  } else if (vista === "semana") {
    desde = lunesIso(fecha);
    hasta = sumarDias(desde, 6);
    anterior = sumarDias(desde, -7);
    siguiente = sumarDias(desde, 7);
    titulo = `${Number(desde.slice(8, 10))} – ${Number(hasta.slice(8, 10))} de ${
      MESES[Number(hasta.slice(5, 7)) - 1]
    } ${hasta.slice(0, 4)}`;
  } else {
    const primero = `${fecha.slice(0, 7)}-01`;
    const diasDelMes = new Date(
      Number(fecha.slice(0, 4)),
      Number(fecha.slice(5, 7)),
      0
    ).getDate();
    const ultimo = `${fecha.slice(0, 7)}-${String(diasDelMes).padStart(2, "0")}`;
    desde = lunesIso(primero); // la grilla arranca el lunes de la 1ª semana
    hasta = sumarDias(lunesIso(ultimo), 6); // y termina el domingo de la última
    anterior = sumarDias(primero, -1);
    siguiente = sumarDias(ultimo, 1);
    titulo = `${MESES[mesReferencia]} ${fecha.slice(0, 4)}`;
  }

  const dias: string[] = [];
  for (let d = desde; d <= hasta; d = sumarDias(d, 1)) dias.push(d);

  // -------------------------------------------------------
  // Datos
  // -------------------------------------------------------
  const semanaFoco = lunesIso(fecha); // semana de la lista de fichas de abajo
  const [unidades, eventosRango, agendas, perfil, hitos] = await Promise.all([
    getUnidades(),
    getEventosAgenda(desde, hasta),
    getAgendasSemana(semanaFoco),
    getPerfilActual(),
    // 15.09, párrafo 803: los hitos del municipio los ve todo el mundo, sin
    // filtro por área ni por rol.
    getHitosDelRango(desde, hasta),
  ]);
  const esGlobal = perfilVeTodo(perfil);

  const sortByName = (a: UnidadOrganizacional, b: UnidadOrganizacional) =>
    (a.nombre_corto ?? a.nombre).localeCompare(b.nombre_corto ?? b.nombre);

  const unidadById = new Map(unidades.map((u) => [u.id, u]));
  const childrenByParent = new Map<string | null, UnidadOrganizacional[]>();
  for (const u of unidades) {
    const key = u.parent_id;
    (childrenByParent.get(key) ?? childrenByParent.set(key, []).get(key)!).push(u);
  }

  // Todas las direcciones (nivel >= 2) descendientes de una unidad
  const direccionesDe = (unidadId: string): UnidadOrganizacional[] => {
    const out: UnidadOrganizacional[] = [];
    const walk = (id: string) => {
      for (const child of childrenByParent.get(id) ?? []) {
        if (child.nivel >= 2) out.push(child);
        walk(child.id);
      }
    };
    walk(unidadId);
    return out.sort(sortByName);
  };

  // Subárbol completo (incluye la propia unidad)
  const subarbol = (unidadId: string): Set<string> => {
    const out = new Set<string>([unidadId]);
    const walk = (id: string) => {
      for (const child of childrenByParent.get(id) ?? []) {
        out.add(child.id);
        walk(child.id);
      }
    };
    walk(unidadId);
    return out;
  };

  // -------------------------------------------------------
  // Filtros: ámbito del usuario + secretaría/subsecretaría/dirección + texto
  // -------------------------------------------------------
  // Quien no tiene acceso global solo ve su árbol; el filtro no puede sacarlo de ahí.
  const ambitoUsuario = !esGlobal && perfil?.unidad_id ? subarbol(perfil.unidad_id) : null;

  const filtroUnidad = params.dir || params.sub || params.sec || null;
  const ambitoFiltro = filtroUnidad ? subarbol(filtroUnidad) : null;

  const unidadVisible = (unidadId: string) =>
    (!ambitoUsuario || ambitoUsuario.has(unidadId)) &&
    (!ambitoFiltro || ambitoFiltro.has(unidadId));

  const termino = normalizarBusqueda(params.q ?? "");
  const coincide = (e: EventoAgenda) =>
    !termino ||
    coincideBusqueda(e.actividad, termino) ||
    coincideBusqueda(e.lugar, termino) ||
    coincideBusqueda(e.observacion, termino) ||
    coincideBusqueda(e.unidad_nombre, termino);

  const eventos = eventosRango.filter((e) => unidadVisible(e.unidad_id) && coincide(e));

  // Color estable por unidad dentro de la vista actual.
  const indicePorUnidad: Record<string, number> = {};
  for (const id of [...new Set(eventos.map((e) => e.unidad_id))].sort()) {
    indicePorUnidad[id] = Object.keys(indicePorUnidad).length;
  }

  // -------------------------------------------------------
  // Carga de actividades puntuales (06.08)
  // -------------------------------------------------------
  // Sobre qué agendas puede escribir este usuario: su unidad y —para
  // secretarios y subsecretarios— las de las direcciones a su cargo. Espejo de
  // la RLS, que es la que realmente decide.
  const unidadesEditables = unidadesQueGestionaAgenda(perfil, unidades).sort(sortByName);
  const unidadPropia =
    unidadesEditables.find((u) => u.id === perfil?.unidad_id)?.id ?? unidadesEditables[0]?.id ?? null;

  // Feed .ics: el del ámbito filtrado, o el del área propia si no es global.
  const unidadSuscripcion = filtroUnidad ?? (!esGlobal ? perfil?.unidad_id ?? null : null);

  // Unidades que puede elegir en los filtros (acotadas a su ámbito)
  const unidadesFiltro = ambitoUsuario
    ? unidades.filter((u) => ambitoUsuario.has(u.id))
    : unidades;

  // -------------------------------------------------------
  // Fichas de la semana (carga de agendas), respetando los mismos filtros
  // -------------------------------------------------------
  const agendasPorUnidad = new Map<string, AgendaSemana>();
  for (const a of agendas) agendasPorUnidad.set(a.unidad_id, a);

  const FichaCard = ({ unidad }: { unidad: UnidadOrganizacional }) => {
    const agenda = agendasPorUnidad.get(unidad.id);
    return (
      <Link
        href={`/agenda/${unidad.id}/${semanaFoco}`}
        className={`block rounded-xl border p-4 hover:border-primary/40 transition-colors ${
          agenda ? "border-success/30 bg-success/5" : "border-border bg-surface"
        }`}
      >
        <p className="text-sm font-semibold text-foreground line-clamp-1">
          {unidad.nombre_corto ?? unidad.nombre}
        </p>
        <p className="text-[10px] text-muted mt-1">
          {agenda
            ? agenda.formato_libre
              ? "Formato libre cargado"
              : `${(agenda as { actividades?: unknown[] }).actividades?.length ?? 0} actividades`
            : "Sin agenda cargada"}
        </p>
      </Link>
    );
  };

  // Unidades a listar abajo: las direcciones del ámbito visible.
  //
  // 06.08: secretarios y subsecretarios también tienen agenda propia, así que
  // la unidad raíz entra en la lista cuando es la del usuario o cuando ya tiene
  // agenda cargada. Sin esto, un secretario veía las agendas de sus direcciones
  // pero no tenía dónde entrar a la suya.
  const raizFichas = filtroUnidad ?? (ambitoUsuario ? perfil!.unidad_id! : null);
  let direccionesFichas: UnidadOrganizacional[];
  if (raizFichas) {
    const raiz = unidadById.get(raizFichas);
    const incluirRaiz =
      !!raiz &&
      (raiz.nivel >= 2 || raiz.id === perfil?.unidad_id || agendasPorUnidad.has(raiz.id));
    direccionesFichas = incluirRaiz
      ? [raiz!, ...direccionesDe(raizFichas)]
      : direccionesDe(raizFichas);
  } else {
    direccionesFichas = unidades
      .filter((u) => u.nivel >= 2 || agendasPorUnidad.has(u.id))
      .sort(sortByName);
  }

  const semanaLegible = `${Number(semanaFoco.slice(8, 10))} de ${
    MESES[Number(semanaFoco.slice(5, 7)) - 1]
  }`;

  return (
    <div className="space-y-6 max-w-7xl">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Agenda</h1>
          <p className="text-sm text-muted mt-1">
            Calendario de actividades de todas las direcciones
          </p>
        </div>
        <div className="flex items-center gap-2 self-start">
          {/* El modo TV abre el calendario del mes a pantalla completa */}
          <Link
            href={
              filtroUnidad
                ? `/tv?vista=calendario&unidad=${filtroUnidad}&fecha=${fecha}`
                : `/tv?vista=calendario&fecha=${fecha}`
            }
            target="_blank"
            className="text-xs text-muted hover:text-accent border border-border hover:border-accent/30 rounded-lg px-3 py-1.5 inline-flex items-center gap-1.5"
          >
            <span>▣</span> Modo TV
          </Link>
          <Link
            href={`/agenda/cargar?semana=${semanaFoco}`}
            className="text-xs text-primary border border-primary/30 bg-primary/10 hover:bg-primary/20 rounded-lg px-3 py-1.5"
          >
            + Cargar agenda
          </Link>
        </div>
      </div>

      <Suspense>
        <CalendarioToolbar
          vista={vista}
          fecha={fecha}
          titulo={titulo}
          unidades={unidadesFiltro}
          sec={params.sec ?? null}
          sub={params.sub ?? null}
          dir={params.dir ?? null}
          q={params.q ?? ""}
          anterior={anterior}
          siguiente={siguiente}
          hoy={hoy}
          eventos={verHitos}
          cantidadEventos={hitos.length}
        />
      </Suspense>

      <CalendarioVista
        vista={vista}
        dias={dias}
        eventos={eventos}
        mesReferencia={mesReferencia}
        hoy={hoy}
        indicePorUnidad={indicePorUnidad}
        unidadesEditables={unidadesEditables.map((u) => u.id)}
        hitos={verHitos ? hitos : []}
        altaDelDia={
          vista === "dia" ? (
            <NuevaActividadForm
              fecha={dias[0]}
              unidades={unidadesEditables}
              unidadPorDefecto={unidadPropia}
            />
          ) : null
        }
      />

      {/* Leyenda: qué unidad es cada color */}
      {Object.keys(indicePorUnidad).length > 0 && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          {Object.entries(indicePorUnidad).map(([unidadId, i]) => (
            <span key={unidadId} className="inline-flex items-center gap-1.5 text-[11px] text-muted">
              <span
                className={`h-2 w-2 rounded-full ${
                  ["bg-primary", "bg-success", "bg-accent", "bg-warning", "bg-info"][i % 5]
                }`}
              />
              {unidadById.get(unidadId)?.nombre_corto ??
                unidadById.get(unidadId)?.nombre ??
                "—"}
            </span>
          ))}
        </div>
      )}

      {/* Suscripción al feed del ámbito elegido (o del área propia) */}
      {unidadSuscripcion && (
        <SuscribirCalendario
          unidadId={unidadSuscripcion}
          unidadNombre={
            unidadById.get(unidadSuscripcion)?.nombre_corto ??
            unidadById.get(unidadSuscripcion)?.nombre ??
            "esta área"
          }
          token={tokenDeUnidad(unidadSuscripcion)}
        />
      )}

      {/* Carga de agendas por dirección, para la semana en foco */}
      <section>
        <div className="flex items-center justify-between gap-3 mb-3 border-b border-border pb-2">
          <h2 className="text-sm font-semibold text-foreground">
            Agendas de la semana del {semanaLegible}
          </h2>
          <span className="text-xs text-muted">
            {direccionesFichas.length} {direccionesFichas.length === 1 ? "agenda" : "agendas"}
          </span>
        </div>
        {direccionesFichas.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            {direccionesFichas.map((u) => (
              <FichaCard key={u.id} unidad={u} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted">No hay agendas para este filtro.</p>
        )}
      </section>
    </div>
  );
}

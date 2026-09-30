import Link from "next/link";
import { Suspense } from "react";
import { getUnidades, sumarDias, lunesIso } from "@/lib/queries";
import { hoyLocal, coincideBusqueda, normalizarBusqueda } from "@/lib/utils";
import { getActividades, getResumen, TIPOS } from "@/lib/agenda-geo";
import type { Actividad } from "@/lib/agenda-geo";
import { AgendaToolbar, type VistaAgenda } from "@/components/territorio/agenda-toolbar";
import { AgendaVista } from "@/components/territorio/agenda-vista";
import type { UnidadOrganizacional } from "@/types/database";

export const revalidate = 0;

interface Props {
  searchParams: Promise<{
    vista?: string;
    fecha?: string;
    sec?: string;
    sub?: string;
    dir?: string;
    tipo?: string;
    estado?: string;
    q?: string;
  }>;
}

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

const esIso = (s: string | undefined): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);

/**
 * La agenda de la Agenda Georreferenciada — etapa 2 del plan del 22.09.
 *
 * Mes, semana y día con los filtros por área, tipo, fecha y estado. Todo vive
 * en la URL: la vista se comparte por enlace y la página se sigue renderizando
 * en el servidor.
 *
 * A diferencia de la agenda de PlanIA, acá NO se recorta por el área del
 * usuario: la política `actividad_select_todos` de la migración 052 deja leer
 * todo a cualquiera que haya iniciado sesión, porque el sentido del producto es
 * que cada área cargue lo suyo y lo vea el municipio entero. Los filtros son
 * solo los que la persona elige.
 */
export default async function AgendaTerritorioPage({ searchParams }: Props) {
  const params = await searchParams;

  // `hoyLocal()` y no `new Date().toISOString()`: a la noche de Tucumán el UTC
  // ya está en el día siguiente y "hoy" se corría un día.
  const hoy = hoyLocal();
  const vista: VistaAgenda =
    params.vista === "semana" || params.vista === "dia" ? params.vista : "mes";
  const fecha = esIso(params.fecha) ? params.fecha : hoy;

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
  // Se trae el período completo y los cinco filtros se aplican acá, aunque la
  // consulta sepa filtrar por tipo y estado. Dos razones: el área es un
  // subárbol del organigrama y el texto mira cuatro campos con las tildes
  // normalizadas, así que esos dos no pueden ir en el SQL de todos modos; y
  // sobre todo, `delRango` tiene que seguir siendo lo que hay en el período
  // para poder distinguir "acá no hay nada" de "los filtros lo dejaron sin
  // nada". Filtrando en la consulta las dos frases se vuelven la misma y el
  // cartel manda a buscar el problema donde no está. Un período son seis
  // semanas del municipio entero: no es volumen que justifique el riesgo.
  let unidades: UnidadOrganizacional[] = [];
  let delRango: Actividad[] = [];
  let resumen = { hoy: 0, proximas48: 0, porConfirmar: 0, modificadas: 0 };
  let error: string | null = null;
  try {
    [unidades, delRango, resumen] = await Promise.all([
      getUnidades(),
      getActividades({ desde, hasta }),
      getResumen(hoy),
    ]);
  } catch (e) {
    // La migración 052 puede no estar aplicada todavía: el código se despliega
    // solo y las migraciones las aplica una persona.
    error = e instanceof Error ? e.message : String(e);
    unidades = await getUnidades().catch(() => []);
  }

  // Subárbol completo de una unidad, incluida ella misma.
  const hijosPorPadre = new Map<string | null, UnidadOrganizacional[]>();
  for (const u of unidades) {
    (hijosPorPadre.get(u.parent_id) ?? hijosPorPadre.set(u.parent_id, []).get(u.parent_id)!).push(u);
  }
  const subarbol = (unidadId: string): Set<string> => {
    const out = new Set<string>([unidadId]);
    const walk = (id: string) => {
      for (const hijo of hijosPorPadre.get(id) ?? []) {
        out.add(hijo.id);
        walk(hijo.id);
      }
    };
    walk(unidadId);
    return out;
  };

  const filtroUnidad = params.dir || params.sub || params.sec || null;
  const ambitoFiltro = filtroUnidad ? subarbol(filtroUnidad) : null;

  const termino = normalizarBusqueda(params.q ?? "");
  const coincide = (a: Actividad) =>
    !termino ||
    coincideBusqueda(a.titulo, termino) ||
    coincideBusqueda(a.lugar_texto, termino) ||
    coincideBusqueda(a.descripcion, termino) ||
    coincideBusqueda(a.unidad_nombre, termino);

  const actividades = delRango.filter(
    (a) =>
      (!ambitoFiltro || ambitoFiltro.has(a.unidad_id)) &&
      (!params.tipo || a.tipo === params.tipo) &&
      (!params.estado || a.estado === params.estado) &&
      coincide(a)
  );

  // Los filtros puestos, para que los enlaces al día no los pierdan.
  const paramsActuales: Record<string, string> = {};
  for (const k of ["sec", "sub", "dir", "tipo", "estado", "q"] as const) {
    const v = params[k];
    if (v) paramsActuales[k] = v;
  }

  const contadores = [
    { rotulo: "Actividades de hoy", valor: resumen.hoy },
    { rotulo: "Próximas 48 hs", valor: resumen.proximas48 },
    { rotulo: "Pendientes de confirmación", valor: resumen.porConfirmar },
    { rotulo: "Modificadas hoy", valor: resumen.modificadas },
  ];

  // Leyenda: solo los tipos que de verdad aparecen en lo que se está mirando.
  const tiposPresentes = TIPOS.filter((t) => actividades.some((a) => a.tipo === t.clave));

  return (
    <div className="space-y-6 max-w-7xl">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Agenda</h1>
          <p className="text-sm text-muted mt-1">
            Las actividades de todas las áreas del municipio, por mes, semana o día.
          </p>
        </div>
        <Link
          href="/territorio/actividades"
          className="text-xs text-primary border border-primary/30 bg-primary/10 hover:bg-primary/20 rounded-lg px-3 py-1.5 self-start"
        >
          + Cargar actividad
        </Link>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {contadores.map((c) => (
          <div key={c.rotulo} className="rounded-xl border border-border bg-surface p-4">
            <p className="text-xs text-muted">{c.rotulo}</p>
            <p
              className={`text-3xl font-bold mt-1 tabular-nums ${
                c.valor === 0 ? "text-foreground/40" : "text-foreground"
              }`}
            >
              {c.valor}
            </p>
          </div>
        ))}
      </div>

      {error ? (
        <div className="rounded-xl border border-danger/30 bg-danger/5 p-4">
          <p className="text-sm font-semibold text-danger">No se pudieron leer las actividades</p>
          <p className="text-xs text-muted mt-1 font-mono break-all">{error}</p>
          <p className="text-xs text-muted mt-2">
            Si dice que no existe la tabla, falta aplicar la migración 052.
          </p>
        </div>
      ) : (
        <>
          <Suspense>
            <AgendaToolbar
              vista={vista}
              fecha={fecha}
              titulo={titulo}
              unidades={unidades}
              sec={params.sec ?? null}
              sub={params.sub ?? null}
              dir={params.dir ?? null}
              tipo={params.tipo ?? null}
              estado={params.estado ?? null}
              q={params.q ?? ""}
              anterior={anterior}
              siguiente={siguiente}
              hoy={hoy}
            />
          </Suspense>

          <AgendaVista
            vista={vista}
            dias={dias}
            actividades={actividades}
            mesReferencia={mesReferencia}
            hoy={hoy}
            paramsActuales={paramsActuales}
          />

          {tiposPresentes.length > 0 && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              {tiposPresentes.map((t) => (
                <span
                  key={t.clave}
                  className="inline-flex items-center gap-1.5 text-[11px] text-muted"
                >
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: t.hex }}
                  />
                  {t.rotulo}
                </span>
              ))}
            </div>
          )}

          {/* Que el período esté vacío es distinto de que no haya nada cargado,
              y más distinto todavía de que los filtros lo hayan dejado sin
              nada. Decirlo mal manda a buscar el problema donde no está. */}
          {actividades.length === 0 && (
            <p className="text-sm text-muted text-center py-4">
              {delRango.length > 0
                ? "Ninguna actividad de este período coincide con los filtros."
                : "No hay actividades cargadas en este período."}{" "}
              <Link href="/territorio/actividades" className="text-primary hover:underline">
                Cargar una
              </Link>
              .
            </p>
          )}
        </>
      )}
    </div>
  );
}

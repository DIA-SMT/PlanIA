import { notFound, redirect } from "next/navigation";
import QRCode from "qrcode";
import { getPerfilActual } from "@/lib/auth";
import { ANIO_POA } from "@/lib/poa-2027";
import {
  getAreaPrioritarios,
  getEjeDeProyecto,
  getPrioritario,
  getProyectosDelArea,
  puedeEditarPrioritarios,
} from "@/lib/proyectos-prioritarios";
import {
  HORIZONTE_PLAN_RECTOR,
  PERIODICIDADES,
  esEnlaceWeb,
  historialConAcumulado,
  numeroArg,
} from "@/lib/proyectos-prioritarios-comun";
import {
  BorrarPrioritario,
  CampoPrioritario,
  CeldaHistorial,
  SelectorPrioritario,
} from "@/components/poa2027/prioritarios-acciones";
import { BackButton } from "@/components/layout/back-button";

export const revalidate = 0;

/**
 * Ficha de proyecto prioritario — corrección del 28.10.
 *
 * Sigue el modelo "PLAN OPERATIVO ANUAL 2027 · Ficha de proyecto · Formulación
 * y seguimiento". El modelo pasaba del punto 5 al 9 ("revisar que los puntos
 * estén bien enumerados"): Seguimiento y evolución queda como 6.
 *
 * Lo que el modelo marca como automático (área, prioridad, eje, horizonte) no
 * se edita: el eje sale del proyecto del POA 2026 que se elige en la ficha.
 *
 * El historial de ejecución, que el modelo pide "enlazar con el portal de
 * datos si existen esos datos", lo carga por ahora el director: PlanIA no está
 * conectado al portal.
 */
export default async function FichaPrioritariaPage({ params }: { params: Promise<{ id: string }> }) {
  const perfil = await getPerfilActual();
  if (!perfil) redirect("/login");
  const { id } = await params;

  const ficha = await getPrioritario(id);
  if (!ficha) notFound();
  const area = await getAreaPrioritarios(ficha.unidad_id);
  if (!area) notFound();

  const esPlanificacion = perfil.rol === "admin_funcional";
  const editable = area.habilitada && (await puedeEditarPrioritarios(perfil, area.id));

  const [eje, proyectos] = await Promise.all([
    getEjeDeProyecto(ficha.proyecto_id),
    getProyectosDelArea(area.id),
  ]);
  const proyecto = proyectos.find((p) => p.id === ficha.proyecto_id) ?? null;

  const qr = esEnlaceWeb(ficha.enlace_territorial)
    ? await QRCode.toString(ficha.enlace_territorial!, { type: "svg", margin: 1, width: 112 })
    : null;

  const unidad = ficha.unidad_medida?.trim() ?? "";
  const conUnidad = (n: number | null) => (n === null ? "" : `${numeroArg(n)}${unidad ? ` ${unidad}` : ""}`);
  const pesos = (n: number | null) => (n === null ? "" : `$${numeroArg(n)}`);
  const historial = historialConAcumulado(ficha.historial);
  const volver = esPlanificacion ? `/poa-2027/prioritarios?unidad=${area.id}` : "/poa-2027/prioritarios";

  const campo = (
    nombre: string,
    valor: string | number | null,
    opciones: { mostrar?: React.ReactNode; largo?: boolean; placeholder?: string; className?: string } = {}
  ) => (
    <CampoPrioritario
      id={ficha.id}
      campo={nombre}
      valor={valor === null ? "" : String(valor)}
      editable={editable}
      {...opciones}
    />
  );

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between gap-3">
        <BackButton fallback={volver} />
        {editable && <BorrarPrioritario id={ficha.id} volverA={volver} />}
      </div>

      <div>
        <h1 className="text-2xl font-bold text-foreground">Plan Operativo Anual {ANIO_POA}</h1>
        <p className="text-sm text-muted mt-1">Ficha de proyecto prioritario · Formulación y seguimiento</p>
        {editable && (
          <p className="text-[11px] text-muted mt-2">
            Hacé clic sobre cualquier dato para completarlo. Se guarda al salir del campo.
          </p>
        )}
      </div>

      <Seccion numero={1} titulo="Identificación" quien="Director: solo el nombre · lo demás automático">
        <Dato rotulo="Nombre del proyecto">{campo("nombre", ficha.nombre, { className: "font-semibold" })}</Dato>
        <Dato rotulo="Proyecto del POA 2026 al que corresponde">
          <SelectorPrioritario
            id={ficha.id}
            campo="proyecto_id"
            valor={ficha.proyecto_id ?? ""}
            opciones={proyectos.map((p) => ({ valor: p.id, rotulo: p.nombre }))}
            mostrar={proyecto?.nombre ?? null}
            editable={editable}
            vacio="Ninguno"
          />
        </Dato>
        <Par>
          <Dato rotulo="Área responsable">{area.nombre}</Dato>
          <Dato rotulo="Proyecto prioritario">Sí</Dato>
        </Par>
        <Par>
          <Dato rotulo="Eje del Plan Rector">
            {eje ? (
              eje.eje
            ) : (
              <span className="text-muted/60 italic">
                {ficha.proyecto_id
                  ? "El proyecto no está imputado al Plan Rector"
                  : "Elegí el proyecto del POA 2026 al que corresponde"}
              </span>
            )}
          </Dato>
          <Dato rotulo="Horizonte estratégico">{HORIZONTE_PLAN_RECTOR}</Dato>
        </Par>
        <Nota>Área responsable, prioridad, eje y horizonte: automáticos en PlanIA.</Nota>
      </Seccion>

      <Seccion numero={2} titulo="Diagnóstico y línea de base" quien="Director">
        <Dato rotulo="Diagnóstico">{campo("diagnostico", ficha.diagnostico, { largo: true })}</Dato>
        <Dato rotulo="Unidad de medida">
          {campo("unidad_medida", ficha.unidad_medida, { placeholder: "Ej.: calles, luminarias, árboles" })}
        </Dato>
        <Par>
          <Dato rotulo="Línea de base · Total relevado">
            {campo("linea_base_total", ficha.linea_base_total, { mostrar: conUnidad(ficha.linea_base_total) })}
          </Dato>
          <Dato rotulo="Línea de base · Pendiente">
            {campo("linea_base_pendiente", ficha.linea_base_pendiente, {
              mostrar: conUnidad(ficha.linea_base_pendiente),
            })}
          </Dato>
        </Par>
        <Par>
          <Dato rotulo="Año de referencia">{campo("linea_base_anio", ficha.linea_base_anio, { placeholder: "Ej.: 2024" })}</Dato>
          <Dato rotulo="Fuente">{campo("linea_base_fuente", ficha.linea_base_fuente, { placeholder: "Ej.: Portal de Datos" })}</Dato>
        </Par>
      </Seccion>

      <Seccion numero={3} titulo="Historial de ejecución" quien="Director · Portal de Datos, si existen esos datos">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[11px] text-muted uppercase tracking-wider border-b border-border">
              <th className="text-left font-normal py-1.5">Año</th>
              <th className="text-right font-normal py-1.5">Ejecutadas{unidad ? ` (${unidad})` : ""}</th>
              <th className="text-right font-normal py-1.5">Acumulado</th>
            </tr>
          </thead>
          <tbody>
            {historial.map((h) => (
              <tr key={h.anio} className="border-b border-border/50">
                <td className="py-1.5">{h.anio}</td>
                <td className="py-1.5 text-right">
                  <CeldaHistorial id={ficha.id} anio={h.anio} valor={h.valor} editable={editable} />
                </td>
                <td className="py-1.5 text-right text-muted">
                  {h.acumulado === null ? "—" : numeroArg(h.acumulado)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <Nota>
          Si no hay registros históricos, se informa &ldquo;sin datos disponibles&rdquo;; no equivale a
          cero.
        </Nota>
      </Seccion>

      <Seccion numero={4} titulo={`Meta anual POA ${ANIO_POA}`} quien="Director">
        <div className="rounded-lg border border-primary/40 bg-primary/5 p-4 space-y-2">
          <p className="text-[11px] text-primary uppercase tracking-wider">Meta comprometida para el año</p>
          <p className="text-3xl font-bold text-foreground">
            {campo("meta_anual", ficha.meta_anual, {
              mostrar: conUnidad(ficha.meta_anual),
              placeholder: "Completar la meta",
            })}
          </p>
          <Dato rotulo="Indicador">
            {campo("indicador", ficha.indicador, {
              placeholder: `Ej.: cantidad de calles pavimentadas durante ${ANIO_POA}`,
            })}
          </Dato>
          <Dato rotulo="Medio de verificación">
            {campo("medio_verificacion", ficha.medio_verificacion, { largo: true })}
          </Dato>
        </div>
        <div className="flex items-start gap-4 rounded-lg bg-background/50 p-3">
          <div className="flex-1 min-w-0 space-y-1">
            <p className="text-[11px] text-muted uppercase tracking-wider">Detalle territorial de la meta</p>
            <p className="text-xs text-muted">Listado o mapa de lo alcanzado por la intervención.</p>
            <div className="text-sm break-all">
              {campo("enlace_territorial", ficha.enlace_territorial, {
                placeholder: "Pegar el enlace al listado o mapa",
                mostrar: ficha.enlace_territorial,
              })}
            </div>
            {esEnlaceWeb(ficha.enlace_territorial) && (
              <a
                href={ficha.enlace_territorial!}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-primary hover:underline"
              >
                Abrir enlace ↗
              </a>
            )}
          </div>
          <div className="shrink-0 text-center">
            {qr ? (
              <div
                className="w-28 h-28 bg-white rounded p-1"
                // El SVG lo arma la librería del QR a partir del enlace: no lleva texto del usuario.
                dangerouslySetInnerHTML={{ __html: qr }}
              />
            ) : (
              <div className="w-28 h-28 rounded border border-dashed border-border flex items-center justify-center">
                <span className="text-[11px] text-muted px-2">El QR sale del enlace</span>
              </div>
            )}
          </div>
        </div>
        <Nota>El QR se genera a partir del enlace. Campo opcional, para metas con detalle territorial.</Nota>
      </Seccion>

      <Seccion numero={5} titulo="Presupuesto" quien="Director">
        <Par>
          <Dato rotulo="Presupuesto total del área">
            {campo("presupuesto_area", ficha.presupuesto_area, { mostrar: pesos(ficha.presupuesto_area) })}
          </Dato>
          <Dato rotulo="Presupuesto del proyecto">
            {campo("presupuesto_proyecto", ficha.presupuesto_proyecto, {
              mostrar: pesos(ficha.presupuesto_proyecto),
            })}
          </Dato>
        </Par>
      </Seccion>

      <Seccion numero={6} titulo="Seguimiento y evolución" quien="Director">
        <Dato rotulo="Periodicidad de seguimiento">
          <SelectorPrioritario
            id={ficha.id}
            campo="periodicidad"
            valor={ficha.periodicidad ?? ""}
            opciones={PERIODICIDADES.map((p) => ({ valor: p, rotulo: p }))}
            mostrar={ficha.periodicidad}
            editable={editable}
            vacio="Completar por el director"
          />
        </Dato>
      </Seccion>
    </div>
  );
}

function Seccion({
  numero,
  titulo,
  quien,
  children,
}: {
  numero: number;
  titulo: string;
  quien: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border bg-surface overflow-hidden">
      <div className="flex items-center justify-between gap-3 bg-primary/10 px-4 py-2.5">
        <h2 className="text-sm font-bold text-foreground">
          {numero}. {titulo}
        </h2>
        <span className="text-[10px] text-primary uppercase tracking-wider text-right">{quien}</span>
      </div>
      <div className="p-4 space-y-3">{children}</div>
    </section>
  );
}

function Par({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{children}</div>;
}

function Dato({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] text-muted uppercase tracking-wider">{rotulo}</p>
      <div className="text-sm text-foreground/90 mt-0.5">{children}</div>
    </div>
  );
}

function Nota({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] text-muted italic">{children}</p>;
}

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import QRCode from "qrcode";
import { getPerfilActual } from "@/lib/auth";
import { ANIO_POA } from "@/lib/poa-2027";
import {
  getAreaPrioritarios,
  getEjeDeFicha,
  getEjesPlanRector,
  getPrioritario,
  getProyectosDelArea,
  puedeEditarPrioritarios,
} from "@/lib/proyectos-prioritarios";
import {
  HORIZONTE_PLAN_RECTOR,
  PERIODICIDADES,
  esEnlaceWeb,
  historialAntecedente,
  historialConAcumulado,
  numeroArg,
} from "@/lib/proyectos-prioritarios-comun";
import {
  BorrarPrioritario,
  BotonAccion,
  BotonImprimir,
  CampoPrioritario,
  CeldaHistorial,
  SIN_DATOS,
  SelectorPrioritario,
} from "@/components/poa2027/prioritarios-acciones";
import { BackButton } from "@/components/layout/back-button";
import {
  agregarIndicadorPrioritario,
  agregarMetaPrioritario,
  borrarIndicadorPrioritario,
  borrarMetaPrioritario,
  editarIndicadorPrioritario,
  editarMetaPrioritario,
  editarTotalIndicadorPrioritario,
} from "@/lib/actions-proyectos-prioritarios";

export const revalidate = 0;

/**
 * Ficha de proyecto prioritario — corrección del 28.10.
 *
 * Sigue el modelo "PLAN OPERATIVO ANUAL 2027 · Ficha de proyecto · Formulación
 * y seguimiento". El modelo pasaba del punto 5 al 9 ("revisar que los puntos
 * estén bien enumerados"): Seguimiento y evolución queda como 6.
 *
 * 30.10: sin medio de verificación, líneas de base opcionales y con su
 * explicación, y justificación técnica en Seguimiento y evolución.
 *
 * Lo que el modelo marca como automático (área, prioridad, horizonte) no se
 * edita. El ámbito y el eje salen del proyecto del POA 2026 que se elige en la
 * ficha; 05.11: si no hay o no está imputado, se eligen acá.
 *
 * El historial de ejecución, que el modelo pide "enlazar con el portal de
 * datos si existen esos datos", lo carga por ahora el director: PlanIA no está
 * conectado al portal.
 *
 * 05.11: "si lo abro, se ve de nuevo el editable. [...] PlanIA debería emitir
 * una vista final solamente con lo que se cargó, y lo que no se cargó poner no
 * se registran datos. [...] Agregar un botón de edición que lleve a la
 * plantilla original en cualquier momento, antes y después de cargarlo, y un
 * botón para imprimir." La ficha abre en la vista final; la plantilla es
 * ?editar=1, y una ficha nueva abre ahí.
 */
export default async function FichaPrioritariaPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ editar?: string }>;
}) {
  const perfil = await getPerfilActual();
  if (!perfil) redirect("/login");
  const { id } = await params;
  const { editar } = await searchParams;

  const ficha = await getPrioritario(id);
  if (!ficha) notFound();
  const area = await getAreaPrioritarios(ficha.unidad_id);
  if (!area) notFound();

  const puedeEditar = area.habilitada && (await puedeEditarPrioritarios(perfil, area.id));
  const editable = puedeEditar && editar === "1";

  const [eje, proyectos, ejes] = await Promise.all([
    getEjeDeFicha(ficha),
    getProyectosDelArea(area.id),
    editable ? getEjesPlanRector() : Promise.resolve([]),
  ]);
  const proyecto = proyectos.find((p) => p.id === ficha.proyecto_id) ?? null;

  const qr = esEnlaceWeb(ficha.enlace_territorial)
    ? await QRCode.toString(ficha.enlace_territorial!, { type: "svg", margin: 1, width: 112 })
    : null;

  const unidad = ficha.unidad_medida?.trim() ?? "";
  const conUnidad = (n: number | null) => (n === null ? "" : `${numeroArg(n)}${unidad ? ` ${unidad}` : ""}`);
  const pesos = (n: number | null) => (n === null ? "" : `$${numeroArg(n)}`);
  const historial = historialConAcumulado(ficha.historial);
  // 04.11: 2023 es opcional; en la vista final sale solo si se cargó.
  const antecedentes = historialAntecedente(ficha.historial).filter((h) => editable || h.valor !== null);
  const volver = `/poa-2027/prioritarios?unidad=${area.id}`;
  const aqui = `/poa-2027/prioritarios/${ficha.id}`;

  // Quién completa cada punto y las notas de ayuda son para cargar: la vista final no las lleva.
  const quien = (texto: string) => (editable ? texto : undefined);
  const nota = (children: React.ReactNode) => (editable ? <Nota>{children}</Nota> : null);

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

  /** 05.11: la línea de base se ve como se escribió; si fue un número solo, con su unidad. */
  const lineaBase = (nombre: "linea_base_total" | "linea_base_pendiente") => {
    const texto = ficha[`${nombre}_texto`];
    const numero = ficha[nombre];
    return campo(nombre, texto ?? numero, { mostrar: texto ?? conUnidad(numero), placeholder: "Opcional" });
  };

  return (
    <div className="hoja space-y-6 max-w-4xl">
      <div className="no-imprimir flex items-center justify-between gap-3">
        <BackButton fallback={volver} />
        <div className="flex items-center gap-2">
          {editable ? (
            <>
              <Link
                href={aqui}
                replace
                className="text-xs bg-primary text-white rounded-lg px-3 py-1.5 hover:opacity-90"
              >
                Ver ficha final
              </Link>
              <BorrarPrioritario id={ficha.id} volverA={volver} />
            </>
          ) : (
            <>
              {puedeEditar && (
                <Link
                  href={`${aqui}?editar=1`}
                  replace
                  className="text-xs bg-primary/10 text-primary border border-primary/30 rounded-lg px-3 py-1.5 hover:bg-primary/20"
                >
                  Editar
                </Link>
              )}
              <BotonImprimir />
            </>
          )}
        </div>
      </div>

      <div>
        <h1 className="text-2xl font-bold text-foreground">Plan Operativo Anual {ANIO_POA}</h1>
        <p className="text-sm text-muted mt-1">Ficha de proyecto prioritario · Formulación y seguimiento</p>
        {editable && (
          <p className="text-[11px] text-muted mt-2">
            Hacé clic sobre cualquier dato para completarlo. Se guarda al salir del campo. Cuando
            termines, &ldquo;Ver ficha final&rdquo; muestra cómo queda para imprimir.
          </p>
        )}
      </div>

      <Seccion numero={1} titulo="Identificación" quien={quien("Director: solo el nombre · lo demás automático")}>
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
          <Dato rotulo="Ámbito del Plan Rector">
            {eje?.ambito ?? (
              <span className="text-muted/60 italic">{editable ? "Sale del eje" : SIN_DATOS}</span>
            )}
          </Dato>
          <Dato rotulo="Eje del Plan Rector">
            {editable && eje?.origen !== "proyecto" ? (
              <SelectorPrioritario
                id={ficha.id}
                campo="plan_rector_eje_id"
                valor={ficha.plan_rector_eje_id ?? ""}
                opciones={ejes.map((e) => ({ valor: e.id, rotulo: e.rotulo, grupo: e.ambito }))}
                mostrar={eje?.eje ?? null}
                editable
                vacio="Elegir el eje del Plan Rector"
              />
            ) : (
              eje?.eje ?? <span className="text-muted/60 italic">{SIN_DATOS}</span>
            )}
          </Dato>
        </Par>
        <Dato rotulo="Horizonte estratégico">{HORIZONTE_PLAN_RECTOR}</Dato>
        {nota(
          eje?.origen === "proyecto"
            ? "Área responsable, prioridad, ámbito, eje y horizonte: automáticos en PlanIA. El ámbito y el eje salen del proyecto del POA 2026, por su imputación al Plan Rector."
            : "Área responsable, prioridad y horizonte: automáticos en PlanIA. Sin un proyecto del POA 2026 imputado al Plan Rector, el eje se elige acá y el ámbito sale del eje."
        )}
      </Seccion>

      <Seccion numero={2} titulo="Diagnóstico y línea de base" quien={quien("Director")}>
        <Dato rotulo="Diagnóstico">{campo("diagnostico", ficha.diagnostico, { largo: true })}</Dato>
        <Dato rotulo="Unidad de medida">
          {campo("unidad_medida", ficha.unidad_medida, { placeholder: "Ej.: calles, luminarias, árboles" })}
        </Dato>
        <Par>
          {/* 30.10: los rótulos y su explicación, con las palabras del pedido.
              05.11: aceptan texto, además de números. */}
          <Dato
            rotulo="Línea de base - relevado"
            ayuda={
              editable
                ? "Cantidad total registrada del indicador. Por ej.: 3.000 unidades relevadas."
                : undefined
            }
          >
            {lineaBase("linea_base_total")}
          </Dato>
          <Dato
            rotulo="Línea de base - pendiente"
            ayuda={
              editable ? "Cantidad total que falta para llegar a lo relevado. Por ej.: 800 unidades." : undefined
            }
          >
            {lineaBase("linea_base_pendiente")}
            {editable && ficha.linea_base_pendiente_texto && ficha.linea_base_pendiente === null && (
              <span className="block text-[11px] text-warning mt-0.5">
                No empieza con una cantidad: el Plan Rector no puede proyectar el avance.
              </span>
            )}
          </Dato>
        </Par>
        {nota(
          <>
            Las líneas de base son opcionales: si no hay ese dato, se dejan vacías. Se pueden escribir
            con palabras; para que el Plan Rector proyecte el avance, la pendiente tiene que empezar
            con la cantidad (&ldquo;800 cuadras sin pavimentar&rdquo;).
          </>
        )}
        <Par>
          <Dato rotulo="Año de referencia">{campo("linea_base_anio", ficha.linea_base_anio, { placeholder: "Ej.: 2024" })}</Dato>
          <Dato rotulo="Fuente">{campo("linea_base_fuente", ficha.linea_base_fuente, { placeholder: "Ej.: Portal de Datos" })}</Dato>
        </Par>
        {/* 05.11: "Agregar Observaciones debajo de la línea de base". */}
        <Dato rotulo="Observaciones">
          {campo("linea_base_observaciones", ficha.linea_base_observaciones, { largo: true, placeholder: "Opcional" })}
        </Dato>
      </Seccion>

      <Seccion numero={3} titulo="Historial de ejecución" quien={quien("Director · Portal de Datos, si existen esos datos")}>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[11px] text-muted uppercase tracking-wider border-b border-border">
              <th className="text-left font-normal py-1.5">Año</th>
              <th className="text-right font-normal py-1.5">Ejecutadas{unidad ? ` (${unidad})` : ""}</th>
              <th className="text-right font-normal py-1.5">Acumulado</th>
            </tr>
          </thead>
          <tbody>
            {/* 04.11: 2023 es opcional y queda como antecedente, sin acumulado. */}
            {antecedentes.map((h) => (
              <tr key={h.anio} className="border-b border-border/50">
                <td className="py-1.5">
                  {h.anio}{" "}
                  <span className="text-[10px] text-muted">{editable ? "(antecedente, opcional)" : "(antecedente)"}</span>
                </td>
                <td className="py-1.5 text-right">
                  <CeldaHistorial id={ficha.id} anio={h.anio} valor={h.valor} editable={editable} />
                </td>
                <td className="py-1.5 text-right text-[11px] text-muted/70">no suma</td>
              </tr>
            ))}
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
        {nota(
          <>
            Si no hay registros históricos, se informa &ldquo;sin datos disponibles&rdquo;; no equivale a
            cero. 2023 es anterior a la gestión: se puede cargar como antecedente, pero no suma al
            acumulado ni a la proyección del Plan Rector, y dejarlo vacío no cambia nada.
          </>
        )}
      </Seccion>

      <Seccion numero={4} titulo={`Meta anual POA ${ANIO_POA}`} quien={quien("Director")}>
        {/* 04.11: "se debe poder cargar más de un indicador x meta y más de una
            meta x proyecto". La primera es la que proyecta el Plan Rector. */}
        {ficha.metas.length === 0 && (
          <p className="text-xs text-muted italic">{editable ? "Todavía no hay metas cargadas." : SIN_DATOS}</p>
        )}
        {ficha.metas.map((m, i) => {
          // En la vista final no salen los renglones de indicador que quedaron vacíos.
          const indicadores = editable
            ? m.indicadores
            : m.indicadores.filter((ind) => ind.texto.trim() || ind.total !== null);
          const totales = m.indicadores.filter((ind) => ind.total !== null);
          const suma = totales.reduce((s, ind) => s + (ind.total ?? 0), 0);
          return (
            <div key={m.id} className="rounded-lg border border-primary/40 bg-primary/5 p-4 space-y-2">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[11px] text-primary uppercase tracking-wider">
                  {ficha.metas.length > 1 ? `Meta ${i + 1} · ` : ""}Meta comprometida para el año
                </p>
                {editable && (
                  <BotonAccion
                    accion={borrarMetaPrioritario.bind(null, ficha.id, m.id)}
                    texto="Borrar meta"
                    confirmar="¿Borrar esta meta y sus indicadores?"
                    peligro
                  />
                )}
              </div>
              <p className={m.valor === null && !editable ? "text-sm" : "text-3xl font-bold text-foreground"}>
                <CampoPrioritario
                  id={ficha.id}
                  campo="valor"
                  valor={m.valor === null ? "" : String(m.valor)}
                  mostrar={conUnidad(m.valor)}
                  placeholder="Completar la meta"
                  editable={editable}
                  accion={editarMetaPrioritario.bind(null, ficha.id, m.id, "valor")}
                />
              </p>
              <Dato rotulo="Descripción de la meta">
                <CampoPrioritario
                  id={ficha.id}
                  campo="descripcion"
                  valor={m.descripcion ?? ""}
                  placeholder="Opcional"
                  largo
                  editable={editable}
                  accion={editarMetaPrioritario.bind(null, ficha.id, m.id, "descripcion")}
                />
              </Dato>
              <div>
                {/* 05.11: "nos tiene que dejar dividir la meta en totales x
                    indicador. Ahora solo deja poner el nombre del indicador". */}
                <div className="flex items-center justify-between gap-3 text-[11px] text-muted uppercase tracking-wider">
                  <span>{indicadores.length > 1 ? "Indicadores" : "Indicador"}</span>
                  {indicadores.length > 0 && <span className={editable ? "mr-8" : ""}>Total planificado</span>}
                </div>
                {indicadores.length === 0 && !editable && (
                  <p className="text-sm text-muted/60 italic mt-0.5">{SIN_DATOS}</p>
                )}
                <ul className="space-y-1 mt-0.5">
                  {indicadores.map((ind) => (
                    <li key={ind.id} className="flex items-start gap-2 text-sm text-foreground/90">
                      <span className="text-muted/60 mt-0.5">•</span>
                      <span className="flex-1 min-w-0">
                        <CampoPrioritario
                          id={ficha.id}
                          campo="indicador"
                          valor={ind.texto}
                          placeholder={`Ej.: cantidad de calles pavimentadas durante ${ANIO_POA}`}
                          editable={editable}
                          accion={editarIndicadorPrioritario.bind(null, ficha.id, m.id, ind.id)}
                        />
                      </span>
                      <span className="shrink-0 w-36 text-right">
                        <CampoPrioritario
                          id={ficha.id}
                          campo="total"
                          valor={ind.total === null ? "" : String(ind.total)}
                          mostrar={conUnidad(ind.total)}
                          placeholder="Sin total"
                          editable={editable}
                          accion={editarTotalIndicadorPrioritario.bind(null, ficha.id, m.id, ind.id)}
                        />
                      </span>
                      {editable && (
                        <BotonAccion
                          accion={borrarIndicadorPrioritario.bind(null, ficha.id, m.id, ind.id)}
                          texto="✕"
                          peligro
                        />
                      )}
                    </li>
                  ))}
                </ul>
                {totales.length > 1 && (
                  <p className="text-xs text-muted mt-1.5 text-right">
                    Suma de los indicadores: <span className="text-foreground font-semibold">{conUnidad(suma)}</span>
                    {editable && m.valor !== null && suma !== m.valor && (
                      <span className="text-warning"> · no coincide con la meta ({conUnidad(m.valor)})</span>
                    )}
                  </p>
                )}
                {editable && (
                  <div className="mt-1.5">
                    <BotonAccion
                      accion={agregarIndicadorPrioritario.bind(null, ficha.id, m.id)}
                      texto="+ Agregar indicador"
                    />
                  </div>
                )}
              </div>
            </div>
          );
        })}
        {editable && (
          <div>
            <BotonAccion
              accion={agregarMetaPrioritario.bind(null, ficha.id)}
              texto={ficha.metas.length > 0 ? "+ Agregar otra meta" : "+ Agregar una meta"}
            />
          </div>
        )}
        {ficha.metas.length > 1 &&
          nota("La primera meta es la que usa el Plan Rector para proyectar el avance del proyecto.")}
        {editable &&
          nota(
            "Cada indicador puede llevar su total planificado para el año, en la unidad de medida de la ficha. Si la meta se divide entre los indicadores, la suma tiene que dar la meta."
          )}
        <div className="flex items-start gap-4 rounded-lg bg-background/50 p-3">
          <div className="flex-1 min-w-0 space-y-1">
            <p className="text-[11px] text-muted uppercase tracking-wider">Detalle territorial de la meta</p>
            {editable && <p className="text-xs text-muted">Listado o mapa de lo alcanzado por la intervención.</p>}
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
                className="no-imprimir text-xs text-primary hover:underline"
              >
                Abrir enlace ↗
              </a>
            )}
          </div>
          {(qr || editable) && (
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
          )}
        </div>
        {nota("El QR se genera a partir del enlace. Campo opcional, para metas con detalle territorial.")}
      </Seccion>

      <Seccion numero={5} titulo="Presupuesto" quien={quien("Director")}>
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

      <Seccion numero={6} titulo="Seguimiento y evolución" quien={quien("Director")}>
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
        <Dato rotulo="Justificación técnica">
          {campo("justificacion_tecnica", ficha.justificacion_tecnica, { largo: true })}
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
  quien?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border bg-surface overflow-hidden break-inside-avoid">
      <div className="flex items-center justify-between gap-3 bg-primary/10 px-4 py-2.5">
        <h2 className="text-sm font-bold text-foreground">
          {numero}. {titulo}
        </h2>
        {quien && <span className="text-[10px] text-primary uppercase tracking-wider text-right">{quien}</span>}
      </div>
      <div className="p-4 space-y-3">{children}</div>
    </section>
  );
}

function Par({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{children}</div>;
}

function Dato({ rotulo, ayuda, children }: { rotulo: string; ayuda?: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] text-muted uppercase tracking-wider">{rotulo}</p>
      {ayuda && <p className="text-[11px] text-muted/80">{ayuda}</p>}
      <div className="text-sm text-foreground/90 mt-0.5">{children}</div>
    </div>
  );
}

function Nota({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] text-muted italic">{children}</p>;
}

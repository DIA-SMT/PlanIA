-- ============================================================
-- MIGRACION 048: correcciones de la revision del reporte trimestral (07/09/2026)
-- ============================================================
-- La revision adversarial del subsistema encontro dos problemas de esquema en
-- migraciones que ya estaban aplicadas. Van aca y no reescribiendo la 046 y la
-- 047, porque un archivo de migracion ya corrido es un registro de lo que se
-- hizo: editarlo hace que el historial mienta y que nadie pueda reproducir el
-- estado actual corriendolas en orden.
--
-- Idempotente: se puede volver a correr sin efecto.
-- ============================================================

BEGIN;

-- ============================================================
-- 1) `completo`: una foto a medias tiene que ser distinguible de una entera
-- ============================================================
-- Faltaba en la 045/046. La foto del corte se escribe en varias llamadas
-- sueltas (la cabecera, y el detalle en lotes de 200) porque va por PostgREST y
-- no hay una transaccion que las envuelva. La cabecera se insertaba diciendo
-- 441 proyectos ANTES de que existiera el detalle, asi que si el proceso moria
-- entre lotes —un deploy en el medio, un corte de red— quedaba una cabecera que
-- decia 441 con 200 filas.
--
-- Y el lector no podia notarlo: como el bloque 2 y el bloque 4 del reporte se
-- calculan de las MISMAS filas incompletas, los totales cerraban perfecto entre
-- si. Un informe firmado con la mitad de los proyectos y nada que lo delatara.
--
-- Peor: la escritura borraba la foto anterior de esa fecha ANTES de escribir la
-- nueva, asi que un fallo a mitad de camino dejaba sin ninguna. Y es el unico
-- dato del sistema que no se puede reconstruir: indicador_historial arranca el
-- 31.07.2026 y cubre 229 de 1896 indicadores.
--
-- Con esta columna el orden se invierte: se escribe la nueva sin marcar, se
-- llena el detalle, se borra la vieja y SOLO ENTONCES se marca la nueva como
-- completa. Queda una ventana de un statement sin ninguna marcada, pero el
-- detalle ya esta escrito entero: si falla ahi no se perdio nada, la fila queda
-- sin marcar, los lectores la ignoran y volver a tomar la foto la recupera.
--
-- Para que la vieja (completa) y la nueva (sin marcar) puedan convivir ese
-- rato, la unicidad pasa a un indice PARCIAL sobre las completas. Verificado en
-- transaccion revertida que el indice: deja convivir una completa con una
-- incompleta de la misma fecha, rechaza dos completas, y rechaza marcar la
-- segunda mientras la primera siga completa (que es lo que obliga al orden).
-- ============================================================

ALTER TABLE public.corte_trimestral
  ADD COLUMN IF NOT EXISTS completo boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.corte_trimestral.completo IS
  'La foto termino de escribirse. Los lectores del reporte exigen completo = true: una foto a medias da un informe con menos proyectos de los que hay, sin ninguna señal.';

-- Las fotos que ya existan se dan por completas: se escribieron con el codigo
-- anterior, que no dejaba a medias mas que por un fallo. Al 07.09 son 0.
UPDATE public.corte_trimestral SET completo = true WHERE completo = false;

ALTER TABLE public.corte_trimestral DROP CONSTRAINT IF EXISTS uq_corte;

CREATE UNIQUE INDEX IF NOT EXISTS uq_corte_completo
  ON public.corte_trimestral(periodo_id, anio, trimestre, fecha_corte)
  WHERE completo;

-- ============================================================
-- 2) La clave del analisis no puede incluir el periodo
-- ============================================================
-- La 047 creo `uq_reporte_analisis` como (periodo_id, anio, trimestre,
-- unidad_id). El periodo no corresponde en la clave, y no es teorico:
--
-- El reporte del cuarto trimestre de 2026 se presenta en enero de 2027. Si
-- alguien empieza el borrador en diciembre —con el POA 2026 activo— y lo
-- termina cuando Planificacion ya activo el POA 2027, el upsert no encuentra
-- conflicto y mete una SEGUNDA fila: mismo anio, mismo trimestre, misma unidad,
-- otro periodo. Desde ahi, la lectura con maybeSingle explota (PGRST116) en el
-- server component del documento oficial, y despublicar aplica el UPDATE a las
-- dos filas y commitea, mientras la accion informa que no se pudo.
--
-- `periodo.anio` es UNIQUE, asi que hay un periodo por anio y los dos ejes son
-- independientes: el anio, el trimestre y el area ya identifican el informe.
-- `periodo_id` queda como dato informativo.
-- ============================================================

ALTER TABLE public.reporte_analisis
  DROP CONSTRAINT IF EXISTS uq_reporte_analisis;

-- Antes de crear la nueva, hay que estar seguro de que no haya duplicados por
-- (anio, trimestre, unidad). Al 07.09 la tabla esta vacia; si en el futuro
-- hubiera filas duplicadas esto falla en vez de elegir una por su cuenta, que
-- es lo correcto: cual de los dos textos vale no lo decide una migracion.
ALTER TABLE public.reporte_analisis
  ADD CONSTRAINT uq_reporte_analisis UNIQUE (anio, trimestre, unidad_id);

COMMENT ON CONSTRAINT uq_reporte_analisis ON public.reporte_analisis IS
  'Un analisis por area y por trimestre. Sin periodo_id a proposito: con el, un borrador empezado en un periodo y terminado en el siguiente duplicaba la fila (corregido el 07.09).';

COMMIT;

-- ============================================================
-- Para revertir:
--   alter table public.reporte_analisis drop constraint if exists uq_reporte_analisis;
--   alter table public.reporte_analisis add constraint uq_reporte_analisis
--     unique (periodo_id, anio, trimestre, unidad_id);
--   drop index if exists uq_corte_completo;
--   alter table public.corte_trimestral add constraint uq_corte
--     unique (periodo_id, anio, trimestre, fecha_corte);
--   alter table public.corte_trimestral drop column if exists completo;
-- ============================================================

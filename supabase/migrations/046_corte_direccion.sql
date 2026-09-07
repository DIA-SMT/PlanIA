-- ============================================================
-- MIGRACION 046: la foto del corte guarda tambien la direccion (07/09/2026)
-- ============================================================
-- Corrige un hueco de la 045. La foto guardaba secretaria y subsecretaria, pero
-- no la direccion intermedia, y hay 9 proyectos que cuelgan de departamentos
-- (nivel 3): Casa Belgraniana, Casa Museo de la Ciudad, Museo de la Industria
-- Azucarera y Museo Mercedes Sosa, los cuatro bajo la Direccion de Museos.
--
-- Sin esta columna, esos 9 proyectos no se podrian anidar en la tabla del
-- reporte, que va subsecretaria > direccion. Se podria resolver mirando la
-- estructura actual al armar el reporte, pero eso rompe justo lo que la foto
-- existe para garantizar: que el informe del tercer trimestre siga diciendo lo
-- mismo si en octubre mueven una unidad.
--
-- Definicion de la columna: `direccion_*` es el ancestro de nivel 2 del
-- proyecto, o la unidad misma si ya es de nivel 2. Queda redundante con
-- `unidad_*` para los 404 proyectos que estan cargados directamente en una
-- direccion, y eso es a proposito: hace que agrupar por direccion sea una sola
-- regla para todos, sin casos especiales.
--
-- Se aplica sin backfill porque las tablas estan vacias (0 cortes al 07.09).
-- Si en el futuro hubiera fotos viejas, quedarian con direccion en NULL y el
-- reporte las mostraria al nivel de la unidad, que es el comportamiento previo.
--
-- Idempotente: se puede volver a correr sin efecto.
-- ============================================================

BEGIN;

ALTER TABLE public.corte_trimestral_proyecto
  ADD COLUMN IF NOT EXISTS direccion_id uuid
    REFERENCES public.unidad_organizacional(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS direccion_nombre text;

CREATE INDEX IF NOT EXISTS idx_ctp_direccion
  ON public.corte_trimestral_proyecto(corte_id, direccion_id);

COMMENT ON COLUMN public.corte_trimestral_proyecto.direccion_id IS
  'Ancestro de nivel 2 del proyecto, o la unidad misma si ya es de nivel 2. Redundante con unidad_id para los proyectos cargados directo en una direccion, a proposito: agrupar por direccion queda como una sola regla.';

-- ============================================================
-- 2) `completo`: una foto a medias tiene que ser distinguible de una entera
-- ============================================================
-- Segundo hueco de la 045, encontrado en la revision del 07.09.
--
-- La foto se escribe en varias llamadas sueltas (cabecera, y el detalle en
-- lotes de 200) porque va por PostgREST y no hay una transaccion que las
-- envuelva. La cabecera se insertaba con `proyectos: 441` ANTES del detalle, y
-- si el proceso moria entre lotes —un deploy en el medio, un corte de red— la
-- cabecera decia 441 y el detalle tenia 200. El lector no podia notarlo: como
-- el bloque 2 y el bloque 4 del reporte se calculan de las MISMAS filas
-- incompletas, los totales cerraban perfecto entre si y nada delataba el
-- faltante. Un documento firmado con la mitad de los proyectos.
--
-- Ademas la escritura borraba la foto anterior de esa fecha ANTES de escribir
-- la nueva, asi que un fallo a mitad de camino dejaba sin ninguna. Y es el
-- unico dato del sistema que no se puede reconstruir.
--
-- Con esta columna el orden se puede invertir: se escribe la nueva en estado
-- incompleto, se llena el detalle, se la marca completa, y SOLO ENTONCES se
-- borra la vieja. Si algo falla en el medio, la vieja sigue estando y la nueva
-- queda marcada como incompleta, que los lectores ignoran.
--
-- Para eso la unicidad tiene que dejar convivir la vieja (completa) con la
-- nueva (incompleta) durante ese rato: se cambia la constraint por un indice
-- unico PARCIAL sobre las completas.
-- ============================================================

ALTER TABLE public.corte_trimestral
  ADD COLUMN IF NOT EXISTS completo boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.corte_trimestral.completo IS
  'La foto termino de escribirse. Los lectores del reporte deben exigir completo = true: una foto a medias da un informe con menos proyectos de los que hay, sin ninguna señal.';

-- Las fotos que ya existan (0 al 07.09) se dan por completas: se escribieron
-- con el codigo anterior, que no dejaba a medias mas que por un fallo.
UPDATE public.corte_trimestral SET completo = true WHERE completo = false;

-- La unicidad pasa a aplicar solo entre fotos completas.
ALTER TABLE public.corte_trimestral DROP CONSTRAINT IF EXISTS uq_corte;

CREATE UNIQUE INDEX IF NOT EXISTS uq_corte_completo
  ON public.corte_trimestral(periodo_id, anio, trimestre, fecha_corte)
  WHERE completo;

COMMIT;

-- Para revertir:
--   drop index if exists uq_corte_completo;
--   alter table public.corte_trimestral add constraint uq_corte
--     unique (periodo_id, anio, trimestre, fecha_corte);
--   alter table public.corte_trimestral drop column if exists completo;
--   drop index if exists idx_ctp_direccion;
--   alter table public.corte_trimestral_proyecto
--     drop column if exists direccion_id,
--     drop column if exists direccion_nombre;

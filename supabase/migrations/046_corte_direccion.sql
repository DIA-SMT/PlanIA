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

COMMIT;

-- NOTA (07.09): esta migracion se aplico con este contenido. El agregado de la
-- columna  y el cambio de la constraint por un indice parcial, que
-- salieron de la revision del mismo dia, van en la 048 para no reescribir lo ya
-- aplicado.
--
-- Para revertir:
--   drop index if exists idx_ctp_direccion;
--   alter table public.corte_trimestral_proyecto
--     drop column if exists direccion_id,
--     drop column if exists direccion_nombre;

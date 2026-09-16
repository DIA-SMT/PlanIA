-- ============================================================
-- MIGRACION 049: Calendario de hitos municipal
-- ============================================================
-- 15.09, parrafos 799 a 803: "en ese link esta el calendario de hitos.
-- Necesitamos que las fechas que tienen, con sus actividades, se visualicen en
-- la agenda de todos los usuarios, no importa el tipo de perfil que tengan."
--
-- POR QUE UNA TABLA PROPIA Y NO agenda_semana.
-- La agenda existente es de UNA unidad y UNA semana: cada direccion carga la
-- suya y solo ella la edita. Estos hitos son municipales —los ve todo el mundo—
-- y muchos duran semanas o meses: medido sobre el archivo que mandaron, 54 de
-- los 92 tienen rango y la mediana de esos es de 29 dias. Meterlos como
-- actividades de cada unidad significaria copiar cada hito en las 52 unidades y
-- en cada semana que toca, y que cualquiera pueda borrar un hito municipal
-- editando su propia agenda.
--
-- Una fila por hito, con su rango. La agenda los muestra aparte de las
-- actividades de cada area.
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.hito_calendario (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fecha_desde   date NOT NULL,
  fecha_hasta   date NOT NULL,
  -- EVENTO / EFEMERIDE / ACTIVIDAD / PROYECTO / PROGRAMA. Texto y no enum: la
  -- lista la escribe Planificacion en su planilla y ya aparecieron variantes;
  -- un enum obliga a una migracion cada vez que agregan una categoria.
  tipo          text,
  nombre        text NOT NULL,
  -- De quien es el hito, como figura en la planilla. Son rotulos para mostrar,
  -- no una FK: la planilla trae nombres escritos a mano que no siempre coinciden
  -- con unidad_organizacional (hay acentos distintos y hasta un mail pegado), y
  -- el hito se muestra igual aunque el area no matchee.
  secretaria    text,
  direccion     text,
  -- De donde salio esta fila, para poder rehacer una carga sin tocar las demas.
  origen        text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT chk_hito_rango CHECK (fecha_hasta >= fecha_desde),
  -- Evita duplicar el mismo hito si la carga se corre dos veces.
  CONSTRAINT uq_hito UNIQUE (fecha_desde, fecha_hasta, nombre)
);

-- La agenda pregunta siempre por un rango de fechas: "que hitos tocan esta
-- semana / este mes". Un indice por fecha_desde alcanza para podar, y el
-- solapamiento se termina de filtrar con fecha_hasta.
CREATE INDEX IF NOT EXISTS idx_hito_calendario_rango
  ON public.hito_calendario (fecha_desde, fecha_hasta);

DROP TRIGGER IF EXISTS trg_hito_calendario_updated_at ON public.hito_calendario;
CREATE TRIGGER trg_hito_calendario_updated_at
  BEFORE UPDATE ON public.hito_calendario
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ------------------------------------------------------------
-- RLS: lo lee cualquiera que este autenticado, lo escribe solo Planificacion
-- ------------------------------------------------------------
-- "Se visualicen en la agenda de todos los usuarios, no importa el tipo de
-- perfil que tengan" es literal: no hay filtro por unidad ni por rol en la
-- lectura. Es el calendario del municipio.
ALTER TABLE public.hito_calendario ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hito_select_todos ON public.hito_calendario;
CREATE POLICY hito_select_todos ON public.hito_calendario
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS hito_mutate_admin ON public.hito_calendario;
CREATE POLICY hito_mutate_admin ON public.hito_calendario
  FOR ALL
  USING (public.rol_actual() IN ('admin_funcional', 'admin_tecnico'))
  WITH CHECK (public.rol_actual() IN ('admin_funcional', 'admin_tecnico'));

COMMENT ON TABLE public.hito_calendario IS
  'Calendario de hitos del municipio: fechas y actividades que ve todo el mundo en su agenda, sin importar su area ni su rol. Se carga desde la planilla de Planificacion.';

COMMIT;

-- Para revertir:
--   BEGIN;
--   DROP TABLE IF EXISTS public.hito_calendario;
--   COMMIT;

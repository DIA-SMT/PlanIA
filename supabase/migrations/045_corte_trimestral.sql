-- ============================================================
-- MIGRACION 045: Foto del corte trimestral (07/09/2026)
-- ============================================================
-- Etapa 1 del reporte trimestral (ver REPORTE_TRIMESTRAL.md).
--
-- POR QUE HACE FALTA: el reporte que pidio Planificacion es "del tercer
-- trimestre", pero hoy PlanIA no puede decir como estaba en una fecha pasada.
-- `indicador_historial` arranca el 31.07.2026 y cubre 229 de 1896 indicadores,
-- asi que sirve para mirar la evolucion de un indicador puntual pero no para
-- reconstruir el estado del municipio a una fecha.
--
-- Consecuencia practica: si el 30 de septiembre pasa sin foto, el reporte del
-- tercer trimestre queda atado a generarse esa misma semana, y en diciembre
-- pasa lo mismo. Por eso esta tabla va primero, aunque no sea la parte visible.
--
-- QUE ES LA FOTO: una fila por proyecto activo con su estado y su avance TAL
-- COMO SE VEIAN el dia del corte, mas la posicion que ese proyecto tenia en la
-- estructura ese dia.
--
-- El calculo NO va en SQL. El avance se calcula en TypeScript
-- (src/lib/utils.ts: avanceIndicador / avanceMetaEnPlazo / avanceAgregado), y
-- la foto la toma src/lib/corte-trimestral.ts reusando esas funciones. Es la
-- misma decision de la migracion 023 y de la 044: reimplementar la cascada en
-- SQL la haria divergir de lo que muestra la pantalla, y entonces el reporte
-- diria un numero distinto al del Panel Ejecutivo.
--
-- TODO DENORMALIZADO A PROPOSITO: la foto guarda los nombres de proyecto,
-- unidad, subsecretaria y secretaria, no solo los ids. Si en octubre renombran
-- una direccion o la mueven de secretaria, el reporte del tercer trimestre
-- tiene que seguir diciendo lo que decia en septiembre. Por eso las FK son
-- ON DELETE SET NULL: la referencia se pierde, el dato queda.
--
-- Idempotente: se puede volver a correr sin efecto.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1) Tipo
-- ------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'origen_corte') THEN
    CREATE TYPE origen_corte AS ENUM ('automatico', 'manual');
  END IF;
END$$;

-- ------------------------------------------------------------
-- 2) corte_trimestral — la cabecera, con los totales del municipio
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.corte_trimestral (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  periodo_id        uuid NOT NULL REFERENCES public.periodo(id) ON DELETE RESTRICT,
  anio              smallint NOT NULL,
  trimestre         smallint NOT NULL CHECK (trimestre BETWEEN 1 AND 4),
  -- El dia al que corresponde la foto. Normalmente el ultimo dia del trimestre,
  -- pero puede ser otro si se toma a mano antes.
  fecha_corte       date NOT NULL,
  origen            origen_corte NOT NULL DEFAULT 'manual',
  tomado_at         timestamptz NOT NULL DEFAULT now(),
  -- NULL cuando la tomo el proceso automatico.
  tomado_por        uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  tomado_por_email  text,

  -- Totales del municipio al corte. Se guardan para no tener que recalcularlos
  -- cada vez que alguien abre el reporte, y para que el numero de la portada no
  -- pueda cambiar despues.
  proyectos         integer NOT NULL DEFAULT 0,
  finalizados       integer NOT NULL DEFAULT 0,
  en_ejecucion      integer NOT NULL DEFAULT 0,
  no_iniciados      integer NOT NULL DEFAULT 0,
  sin_datos         integer NOT NULL DEFAULT 0,
  -- Promedio de avance de los proyectos (cascada). NULL si ninguno tenia dato.
  pct_promedio      smallint CHECK (pct_promedio IS NULL OR pct_promedio BETWEEN 0 AND 100),

  metadata          jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at        timestamptz NOT NULL DEFAULT now(),

  -- Una foto por fecha de corte. Volver a tomarla el mismo dia reemplaza la de
  -- ese dia (idempotente); tomarla otro dia crea otra y NO pisa la anterior.
  -- Esto es a proposito: el reporte es un documento que se emite y se firma, y
  -- sobreescribir la foto haria que un informe ya entregado deje de coincidir
  -- con el sistema.
  CONSTRAINT uq_corte UNIQUE (periodo_id, anio, trimestre, fecha_corte),
  -- Coherencia: la fecha de corte tiene que caer en el trimestre declarado.
  CONSTRAINT chk_corte_trimestre CHECK (
    trimestre = ((EXTRACT(MONTH FROM fecha_corte)::int - 1) / 3) + 1
    AND anio = EXTRACT(YEAR FROM fecha_corte)::int
  )
);

CREATE INDEX IF NOT EXISTS idx_corte_periodo
  ON public.corte_trimestral(periodo_id, anio, trimestre, fecha_corte DESC);

COMMENT ON TABLE public.corte_trimestral IS
  'Foto del estado del POA a una fecha de corte trimestral. Append-only en la practica: tomar la foto otro dia crea una nueva, no pisa la anterior, porque el reporte se emite y se firma.';
COMMENT ON COLUMN public.corte_trimestral.fecha_corte IS
  'Dia al que corresponde la foto. El CHECK obliga a que caiga dentro del trimestre y el anio declarados.';

-- ------------------------------------------------------------
-- 3) corte_trimestral_proyecto — una fila por proyecto, autocontenida
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.corte_trimestral_proyecto (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  corte_id              uuid NOT NULL REFERENCES public.corte_trimestral(id) ON DELETE CASCADE,

  -- Referencias blandas: si despues borran el proyecto o la unidad, la foto
  -- pierde el vinculo pero conserva el nombre y sigue siendo legible.
  proyecto_id           uuid REFERENCES public.proyecto(id) ON DELETE SET NULL,
  proyecto_codigo       text,
  proyecto_nombre       text NOT NULL,

  unidad_id             uuid REFERENCES public.unidad_organizacional(id) ON DELETE SET NULL,
  unidad_nombre         text NOT NULL,
  unidad_nivel          smallint NOT NULL,

  -- La posicion en la estructura EL DIA DEL CORTE. subsecretaria_id es NULL
  -- cuando el proyecto cuelga directo de la secretaria (6 de las 10 secretarias
  -- no tienen subsecretaria) o cuando el proyecto ES de la secretaria.
  secretaria_id         uuid REFERENCES public.unidad_organizacional(id) ON DELETE SET NULL,
  secretaria_nombre     text,
  subsecretaria_id      uuid REFERENCES public.unidad_organizacional(id) ON DELETE SET NULL,
  subsecretaria_nombre  text,
  -- true si el proyecto estaba cargado a nivel secretaria y no en una direccion.
  -- Es la "fila de proyectos propios de la secretaria" que pidio Planificacion.
  es_propio_de_secretaria boolean NOT NULL DEFAULT false,

  -- Metricas al corte
  estado                estado_semaforo NOT NULL,
  pct                   smallint CHECK (pct IS NULL OR pct BETWEEN 0 AND 100),
  metas                 integer NOT NULL DEFAULT 0,
  metas_con_datos       integer NOT NULL DEFAULT 0,
  indicadores           integer NOT NULL DEFAULT 0,
  indicadores_con_datos integer NOT NULL DEFAULT 0,

  created_at            timestamptz NOT NULL DEFAULT now(),

  -- Un proyecto no puede estar dos veces en la misma foto. Los NULL no chocan
  -- entre si en Postgres, asi que las filas cuyo proyecto se borro despues
  -- conviven sin problema.
  CONSTRAINT uq_corte_proyecto UNIQUE (corte_id, proyecto_id)
);

CREATE INDEX IF NOT EXISTS idx_ctp_corte      ON public.corte_trimestral_proyecto(corte_id);
CREATE INDEX IF NOT EXISTS idx_ctp_secretaria ON public.corte_trimestral_proyecto(corte_id, secretaria_id);
CREATE INDEX IF NOT EXISTS idx_ctp_unidad     ON public.corte_trimestral_proyecto(corte_id, unidad_id);

COMMENT ON TABLE public.corte_trimestral_proyecto IS
  'Una fila por proyecto activo al momento del corte, con su estado, su avance y la posicion que tenia en la estructura ese dia. Autocontenida: los nombres estan denormalizados para que el reporte historico no cambie si despues renombran o mueven una unidad.';
COMMENT ON COLUMN public.corte_trimestral_proyecto.es_propio_de_secretaria IS
  'El proyecto estaba cargado directamente en la secretaria, no en una direccion. Al 07.09 solo pasa en Ambiente (19) y Contaduria General (9).';

-- ------------------------------------------------------------
-- 4) RLS
-- ------------------------------------------------------------
-- La cabecera la lee cualquier autenticado: son los totales del municipio, que
-- el Panel Ejecutivo ya muestra a todos. El detalle se lee con el alcance de la
-- unidad, igual que los proyectos.
--
-- Escribe solo admin_funcional. El proceso automatico entra con service_role,
-- que saltea RLS por definicion y no necesita policy.
ALTER TABLE public.corte_trimestral ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS corte_select_all ON public.corte_trimestral;
CREATE POLICY corte_select_all ON public.corte_trimestral
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS corte_mutate_admin ON public.corte_trimestral;
CREATE POLICY corte_mutate_admin ON public.corte_trimestral
  FOR ALL
  USING (public.rol_actual() = 'admin_funcional')
  WITH CHECK (public.rol_actual() = 'admin_funcional');

ALTER TABLE public.corte_trimestral_proyecto ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ctp_select_scope ON public.corte_trimestral_proyecto;
CREATE POLICY ctp_select_scope ON public.corte_trimestral_proyecto
  FOR SELECT
  USING (
    -- La unidad puede haber quedado en NULL si la borraron despues del corte;
    -- en ese caso la fila la ven los roles globales (que ven todo igual).
    unidad_id IS NULL
      OR public.usuario_puede_ver_unidad(unidad_id)
  );

DROP POLICY IF EXISTS ctp_mutate_admin ON public.corte_trimestral_proyecto;
CREATE POLICY ctp_mutate_admin ON public.corte_trimestral_proyecto
  FOR ALL
  USING (public.rol_actual() = 'admin_funcional')
  WITH CHECK (public.rol_actual() = 'admin_funcional');

COMMIT;

-- ============================================================
-- Para revertir (en este orden, por la FK):
--   drop table if exists public.corte_trimestral_proyecto;
--   drop table if exists public.corte_trimestral;
--   drop type if exists origen_corte;
-- ============================================================

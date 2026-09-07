-- ============================================================
-- MIGRACION 047: Analisis del reporte trimestral (07/09/2026)
-- ============================================================
-- Etapa 3 del reporte trimestral. La plantilla que mando Planificacion trae el
-- bloque 3 con tres campos y la aclaracion "(habilitar para que la Direc. De
-- Planific. complete)":
--
--   Balance del Periodo
--   Identificacion de Desvios
--   Oportunidades de Mejora de Carga
--
-- Se decidio el 01.09 que se escriben DENTRO de PlanIA y el reporte baja con
-- ellos ya puestos, en vez de bajar el archivo con los campos vacios para
-- completarlos en Word. Asi el reporte se descarga terminado, que es
-- literalmente lo que pidieron: "que ese reporte se descargue desde el PLANIA
-- directamente para evitar errores humanos de interpretacion y tipeo".
--
-- TRES DECISIONES:
--
-- 1. La clave es por trimestre y area, NO por corte. Si estuviera
--    atada al corte, volver a tomar la foto —que crea un corte nuevo— dejaria
--    el texto huerfano y alguien perderia media hora de escritura sin entender
--    por que. El analisis es del trimestre del area, no de la foto.
--
-- 2. Tiene estado borrador / publicado. Es un documento oficial: mientras
--    Planificacion lo redacta, el secretario no tiene por que estar leyendo un
--    borrador sobre su propia gestion. En borrador lo ve solo quien lo escribe;
--    publicado lo ve quien puede ver el area.
--
-- 3. Tiene historial append-only. El texto de un informe firmado que cambia sin
--    dejar rastro es un problema, no una comodidad.
--
-- La unidad puede ser de cualquier nivel: el mismo reporte se emite para
-- secretaria, subsecretaria y direccion. Cuantos textos hay que escribir por
-- trimestre depende de la pregunta 5 que quedo abierta con el cliente (una vez
-- por secretaria son ~10, uno por area son ~75); el esquema soporta las dos.
--
-- Idempotente: se puede volver a correr sin efecto.
-- ============================================================

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'estado_analisis_reporte') THEN
    CREATE TYPE estado_analisis_reporte AS ENUM ('borrador', 'publicado');
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS public.reporte_analisis (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  periodo_id      uuid NOT NULL REFERENCES public.periodo(id) ON DELETE RESTRICT,
  anio            smallint NOT NULL,
  trimestre       smallint NOT NULL CHECK (trimestre BETWEEN 1 AND 4),
  -- El area sobre la que habla el informe. RESTRICT: si alguien intenta borrar
  -- una unidad que tiene informes escritos, que avise.
  unidad_id       uuid NOT NULL REFERENCES public.unidad_organizacional(id) ON DELETE RESTRICT,

  -- Los tres campos del bloque 3. Sin NOT NULL: se guardan a medio escribir.
  balance         text,
  desvios         text,
  oportunidades   text,

  estado          estado_analisis_reporte NOT NULL DEFAULT 'borrador',
  publicado_at    timestamptz,
  publicado_por   uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  actualizado_por       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actualizado_por_email text,

  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  -- Un analisis por area y por trimestre.
  -- OJO (07.09): incluir periodo_id aca fue un error, corregido en la 048. Con
  -- periodo_id en la clave, un borrador del T4 empezado con el POA 2026 activo y
  -- terminado con el POA 2027 activo insertaba una SEGUNDA fila. Se deja como se
  -- aplico; la 048 la reemplaza.
  CONSTRAINT uq_reporte_analisis UNIQUE (periodo_id, anio, trimestre, unidad_id),
  -- Publicado exige fecha de publicacion, igual que el vinculo confirmado de la
  -- migracion 044.
  CONSTRAINT chk_ra_publicado CHECK (estado <> 'publicado' OR publicado_at IS NOT NULL),
  -- No se publica un informe con los tres campos vacios: seria una pagina en
  -- blanco con firma.
  CONSTRAINT chk_ra_contenido CHECK (
    estado <> 'publicado'
    OR btrim(coalesce(balance, '') || coalesce(desvios, '') || coalesce(oportunidades, '')) <> ''
  )
);

CREATE INDEX IF NOT EXISTS idx_ra_trimestre
  ON public.reporte_analisis(periodo_id, anio, trimestre);
CREATE INDEX IF NOT EXISTS idx_ra_unidad
  ON public.reporte_analisis(unidad_id);

DROP TRIGGER IF EXISTS trg_ra_updated_at ON public.reporte_analisis;
CREATE TRIGGER trg_ra_updated_at
  BEFORE UPDATE ON public.reporte_analisis
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

COMMENT ON TABLE public.reporte_analisis IS
  'Bloque 3 del reporte trimestral: el analisis que redacta Planificacion Estrategica para cada area. Atado al trimestre y al area, no al corte, para que volver a tomar la foto no deje el texto huerfano.';
COMMENT ON COLUMN public.reporte_analisis.estado IS
  'borrador: lo ve solo Planificacion mientras lo escribe. publicado: lo ve quien puede ver el area.';

-- ------------------------------------------------------------
-- Historial append-only del texto
-- ------------------------------------------------------------
-- Patron indicador_historial (028): una fila por guardado, con el texto tal
-- como quedo y el autor desnormalizado, porque el perfil se puede desactivar y
-- el historial de un informe oficial tiene que seguir legible.
CREATE TABLE IF NOT EXISTS public.reporte_analisis_historial (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  analisis_id           uuid NOT NULL REFERENCES public.reporte_analisis(id) ON DELETE CASCADE,
  accion                text NOT NULL,
  balance               text,
  desvios               text,
  oportunidades         text,
  estado_resultante     estado_analisis_reporte,
  registrado_por        uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  registrado_por_email  text,
  registrado_por_nombre text,
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rah_analisis
  ON public.reporte_analisis_historial(analisis_id, created_at DESC);

COMMENT ON TABLE public.reporte_analisis_historial IS
  'Trazabilidad del texto del analisis. Append-only: no se edita ni se borra.';

-- ------------------------------------------------------------
-- RLS
-- ------------------------------------------------------------
ALTER TABLE public.reporte_analisis ENABLE ROW LEVEL SECURITY;

-- Publicado: lo ve quien puede ver el area. Borrador: solo admin_funcional.
DROP POLICY IF EXISTS ra_select_scope ON public.reporte_analisis;
CREATE POLICY ra_select_scope ON public.reporte_analisis
  FOR SELECT
  USING (
    public.rol_actual() = 'admin_funcional'
    OR (estado = 'publicado' AND public.usuario_puede_ver_unidad(unidad_id))
  );

DROP POLICY IF EXISTS ra_mutate_admin ON public.reporte_analisis;
CREATE POLICY ra_mutate_admin ON public.reporte_analisis
  FOR ALL
  USING (public.rol_actual() = 'admin_funcional')
  WITH CHECK (public.rol_actual() = 'admin_funcional');

ALTER TABLE public.reporte_analisis_historial ENABLE ROW LEVEL SECURITY;

-- El historial es de Planificacion: es el rastro de como se redacto el informe,
-- no parte del informe.
DROP POLICY IF EXISTS rah_select_admin ON public.reporte_analisis_historial;
CREATE POLICY rah_select_admin ON public.reporte_analisis_historial
  FOR SELECT USING (public.rol_actual() = 'admin_funcional');

DROP POLICY IF EXISTS rah_insert_admin ON public.reporte_analisis_historial;
CREATE POLICY rah_insert_admin ON public.reporte_analisis_historial
  FOR INSERT WITH CHECK (public.rol_actual() = 'admin_funcional');

-- Append-only de verdad: no depende solo de la ausencia de policy.
REVOKE UPDATE, DELETE ON public.reporte_analisis_historial FROM anon, authenticated;

COMMIT;

-- ============================================================
-- Para revertir (en este orden, por la FK):
--   drop table if exists public.reporte_analisis_historial;
--   drop table if exists public.reporte_analisis;
--   drop type if exists estado_analisis_reporte;
-- ============================================================

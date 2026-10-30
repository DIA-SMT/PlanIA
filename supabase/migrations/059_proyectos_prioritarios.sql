-- ============================================================
-- MIGRACION 059: Proyectos prioritarios y Obras Publicas (30/10/2026)
-- ============================================================
-- Correccion del 28.10, dos pedidos:
--
-- 1. ORGANIGRAMA DE OBRAS PUBLICAS. "Hay que agregar en el sistema la
--    Secretaria de Obras Publicas, la Subsecretaria de Obras Publicas, la
--    Direccion de Obras Viales y la Direccion de Alumbrado y Semaforos, todo
--    respetando el siguiente organigrama". La secretaria y Obras Viales ya
--    estaban (056), con la direccion colgando directo de la secretaria porque
--    el informe de entonces no nombraba subsecretaria. Queda:
--
--      SEC11  Secretaria de Obras Publicas
--      └── Subsecretaria de Obras Publicas          (nueva, sin codigo como las demas)
--          ├── DIR64  Direccion de Obras Viales     (se reparenta)
--          └── DIR65  Direccion de Alumbrado y Semaforos (nueva)
--
--    DIR65 es el primer codigo libre (el ultimo era DIR64). Mover DIR64 no
--    toca nada mas: no tiene proyectos, y sus usuarios y su agenda siguen
--    colgando de ella; la secretaria la sigue viendo porque esta debajo.
--
--    Los responsables del organigrama no se cargan: en la imagen no se leen
--    bien. Al final hay UPDATE comentados para correrlos cuando esten
--    confirmados.
--
-- 2. PROYECTOS PRIORITARIOS. Un boton dentro del POA 2027, solo para 16 areas,
--    que genera y muestra la ficha de proyecto prioritario: identificacion,
--    diagnostico y linea de base, historial de ejecucion, meta anual 2027,
--    presupuesto y seguimiento. Las demas areas siguen con la ficha POA 2027
--    tal cual. Que area tiene el boton lo decide la aplicacion, por codigo
--    (src/lib/proyectos-prioritarios-comun.ts). "Obras publicas" y "movilidad
--    urbana" de la lista son las secretarias, SEC11 y SEC10 (confirmado 30.10).
--
--    La tabla es aparte de ficha_prisma: es otra ficha, con otros campos, y
--    las areas de la lista siguen teniendo la suya. proyecto_id es el proyecto
--    del POA 2026 al que corresponde, opcional: de ahi sale el eje del Plan
--    Rector, y es lo que despues va a usar la vista "Ver avance del proyecto".
--
--    historial es [{ "anio": 2024, "valor": 65 }, ...]. valor null es "sin
--    datos disponibles", que no es cero.
--
-- PERMISOS: los mismos que poa_texto y ficha_prisma. Se ve con el alcance de
-- lectura del area y se edita con el de carga (el director de esa area);
-- Planificacion, todo.
--
-- Formato para el editor SQL de Supabase: sin BEGIN/COMMIT, cada sentencia
-- fuera del CREATE TABLE en una sola linea. Idempotente.
--
-- DESPUES, para comprobar el organigrama (tienen que salir las cuatro, con
-- Obras Viales y Alumbrado bajo la subsecretaria):
--   SELECT u.codigo, u.nivel, u.nombre, p.nombre AS padre FROM public.unidad_organizacional u LEFT JOIN public.unidad_organizacional p ON p.id = u.parent_id WHERE u.nombre ILIKE '%obras%' OR u.nombre ILIKE '%alumbrado%' ORDER BY u.nivel;
-- ============================================================

-- ------------------------------------------------------------
-- 1. Organigrama
-- ------------------------------------------------------------

INSERT INTO public.unidad_organizacional (parent_id, nombre, nombre_corto, tipo, nivel, orden, activa, metadata) SELECT s.id, 'Subsecretaría de Obras Públicas', 'Subsecretaría de Obras Públicas', 'subsecretaria', 1, 0, true, '{}'::jsonb FROM public.unidad_organizacional s WHERE s.codigo = 'SEC11' AND NOT EXISTS (SELECT 1 FROM public.unidad_organizacional x WHERE x.nombre = 'Subsecretaría de Obras Públicas' AND x.parent_id = s.id);

UPDATE public.unidad_organizacional d SET parent_id = sub.id FROM public.unidad_organizacional sub JOIN public.unidad_organizacional s ON s.id = sub.parent_id WHERE d.codigo = 'DIR64' AND s.codigo = 'SEC11' AND sub.nombre = 'Subsecretaría de Obras Públicas' AND d.parent_id IS DISTINCT FROM sub.id;

INSERT INTO public.unidad_organizacional (parent_id, nombre, nombre_corto, tipo, nivel, orden, activa, codigo, metadata) SELECT sub.id, 'Dirección de Alumbrado y Semáforos', 'Dirección de Alumbrado y Semáforos', 'direccion', 2, 47, true, 'DIR65', '{}'::jsonb FROM public.unidad_organizacional sub JOIN public.unidad_organizacional s ON s.id = sub.parent_id WHERE s.codigo = 'SEC11' AND sub.nombre = 'Subsecretaría de Obras Públicas' AND NOT EXISTS (SELECT 1 FROM public.unidad_organizacional WHERE codigo = 'DIR65');

-- ------------------------------------------------------------
-- 2. Ficha de proyecto prioritario
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.proyecto_prioritario (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unidad_id             uuid NOT NULL REFERENCES public.unidad_organizacional(id) ON DELETE CASCADE,
  anio                  integer NOT NULL DEFAULT 2027,
  proyecto_id           uuid REFERENCES public.proyecto(id) ON DELETE SET NULL,
  nombre                text NOT NULL CHECK (btrim(nombre) <> ''),
  diagnostico           text,
  unidad_medida         text,
  linea_base_total      numeric CHECK (linea_base_total IS NULL OR linea_base_total >= 0),
  linea_base_pendiente  numeric CHECK (linea_base_pendiente IS NULL OR linea_base_pendiente >= 0),
  linea_base_anio       integer,
  linea_base_fuente     text,
  historial             jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(historial) = 'array'),
  meta_anual            numeric CHECK (meta_anual IS NULL OR meta_anual >= 0),
  indicador             text,
  medio_verificacion    text,
  enlace_territorial    text,
  presupuesto_area      numeric CHECK (presupuesto_area IS NULL OR presupuesto_area >= 0),
  presupuesto_proyecto  numeric CHECK (presupuesto_proyecto IS NULL OR presupuesto_proyecto >= 0),
  periodicidad          text,
  created_by            uuid REFERENCES auth.users(id),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  deleted_at            timestamptz
);

CREATE INDEX IF NOT EXISTS idx_proyecto_prioritario_unidad ON public.proyecto_prioritario(unidad_id, anio) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_proyecto_prioritario_proyecto ON public.proyecto_prioritario(proyecto_id) WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS trg_proyecto_prioritario_updated_at ON public.proyecto_prioritario;
CREATE TRIGGER trg_proyecto_prioritario_updated_at BEFORE UPDATE ON public.proyecto_prioritario FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

COMMENT ON TABLE public.proyecto_prioritario IS 'Ficha de proyecto prioritario del POA 2027 (059, correccion del 28.10). Solo para las areas de la lista; mismos permisos que ficha_prisma.';

ALTER TABLE public.proyecto_prioritario ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS proyecto_prioritario_select_scope ON public.proyecto_prioritario;
CREATE POLICY proyecto_prioritario_select_scope ON public.proyecto_prioritario FOR SELECT USING (public.usuario_puede_ver_unidad(unidad_id));

DROP POLICY IF EXISTS proyecto_prioritario_insert_carga ON public.proyecto_prioritario;
CREATE POLICY proyecto_prioritario_insert_carga ON public.proyecto_prioritario FOR INSERT WITH CHECK (public.usuario_puede_cargar_unidad(unidad_id) AND created_by = auth.uid());

DROP POLICY IF EXISTS proyecto_prioritario_update_carga ON public.proyecto_prioritario;
CREATE POLICY proyecto_prioritario_update_carga ON public.proyecto_prioritario FOR UPDATE USING (public.usuario_puede_cargar_unidad(unidad_id)) WITH CHECK (public.usuario_puede_cargar_unidad(unidad_id));

DROP POLICY IF EXISTS proyecto_prioritario_mutate_admin ON public.proyecto_prioritario;
CREATE POLICY proyecto_prioritario_mutate_admin ON public.proyecto_prioritario FOR ALL USING (public.rol_actual() = 'admin_funcional') WITH CHECK (public.rol_actual() = 'admin_funcional');

NOTIFY pgrst, 'reload schema';

-- ------------------------------------------------------------
-- Responsables del organigrama, para cuando esten confirmados. Lo que se
-- llega a leer en la imagen, sin garantia de la ortografia:
-- ------------------------------------------------------------
--   UPDATE public.unidad_organizacional SET responsable_nombre = 'Ing. Claudio Bravo' WHERE codigo = 'SEC11';
--   UPDATE public.unidad_organizacional SET responsable_nombre = 'Ing. Leonardo Miguez' WHERE nombre = 'Subsecretaría de Obras Públicas';
--   UPDATE public.unidad_organizacional SET responsable_nombre = 'Ing. Darío Vera Arancedo' WHERE codigo = 'DIR64';
--   UPDATE public.unidad_organizacional SET responsable_nombre = 'Ing. Sergio Cao' WHERE codigo = 'DIR65';
--
-- Para revertir:
--   DROP TABLE IF EXISTS public.proyecto_prioritario;
--   UPDATE public.unidad_organizacional SET parent_id = (SELECT id FROM public.unidad_organizacional WHERE codigo = 'SEC11') WHERE codigo = 'DIR64';
--   DELETE FROM public.unidad_organizacional WHERE codigo = 'DIR65';
--   DELETE FROM public.unidad_organizacional WHERE nombre = 'Subsecretaría de Obras Públicas';
-- ============================================================

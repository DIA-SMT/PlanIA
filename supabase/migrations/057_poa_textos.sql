-- ============================================================
-- MIGRACION 057: introducciones y banco de ideas del POA (08/10/2026)
-- ============================================================
-- 05.10 y 06.10, Planificacion: "algunas poas tienen introducciones porque son
-- necesarias antes de los proyectos [...] Lo mismo pregunto sobre los bancos de
-- ideas que van al final de cada direccion. Eso tiene casi el mismo formato que
-- los proyectos pero deberiamos poder editarlas." Y: "las poas tienen otros
-- textos ademas de proyectos como por ej explicaciones metodologicas [...] por
-- otro lado esta el banco de datos que son ideas sujeta a aprobacion".
--
-- El POA 2027 solo sabia de fichas, una por proyecto. Esto es lo otro que
-- lleva el documento de cada area:
--
--   introduccion  va ANTES de los proyectos del area: marco general, notas
--                 metodologicas, la descripcion de un programa. Titulo y texto.
--   idea          va DESPUES, en el banco de ideas: iniciativas sujetas a
--                 aprobacion que no son proyectos del POA. Titulo y texto.
--
-- Una sola tabla y no dos porque las dos cosas son lo mismo —un titulo y un
-- texto que cuelgan de un area y un año— y solo cambia donde van.
--
-- `orden` es la posicion dentro de su tipo y su area. `origen` dice de donde
-- salio el texto cuando no lo escribio una persona (la precarga desde los
-- libros del 2026), para poder encontrarlo despues.
--
-- PERMISOS: los mismos que las fichas (050). Se ve con el alcance de lectura
-- del POA y se edita con el de carga; Planificacion, todo.
--
-- Formato para el editor SQL de Supabase: sin BEGIN/COMMIT, cada sentencia
-- fuera del CREATE TABLE en una sola linea. Idempotente.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.poa_texto (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unidad_id   uuid NOT NULL REFERENCES public.unidad_organizacional(id) ON DELETE CASCADE,
  anio        integer NOT NULL DEFAULT 2027,
  tipo        text NOT NULL CHECK (tipo IN ('introduccion', 'idea')),
  titulo      text,
  texto       text,
  orden       integer NOT NULL DEFAULT 0,
  origen      text,
  created_by  uuid REFERENCES auth.users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz
);

CREATE INDEX IF NOT EXISTS idx_poa_texto_unidad ON public.poa_texto(unidad_id, anio, tipo, orden) WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS trg_poa_texto_updated_at ON public.poa_texto;
CREATE TRIGGER trg_poa_texto_updated_at BEFORE UPDATE ON public.poa_texto FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

COMMENT ON TABLE public.poa_texto IS 'Lo que el POA de un area lleva ademas de los proyectos (057, 08.10): introducciones antes y banco de ideas despues. Mismos permisos que ficha_prisma.';

ALTER TABLE public.poa_texto ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS poa_texto_select_scope ON public.poa_texto;
CREATE POLICY poa_texto_select_scope ON public.poa_texto FOR SELECT USING (public.usuario_puede_ver_unidad(unidad_id));

DROP POLICY IF EXISTS poa_texto_insert_carga ON public.poa_texto;
CREATE POLICY poa_texto_insert_carga ON public.poa_texto FOR INSERT WITH CHECK (public.usuario_puede_cargar_unidad(unidad_id));

DROP POLICY IF EXISTS poa_texto_update_carga ON public.poa_texto;
CREATE POLICY poa_texto_update_carga ON public.poa_texto FOR UPDATE USING (public.usuario_puede_cargar_unidad(unidad_id)) WITH CHECK (public.usuario_puede_cargar_unidad(unidad_id));

DROP POLICY IF EXISTS poa_texto_delete_carga ON public.poa_texto;
CREATE POLICY poa_texto_delete_carga ON public.poa_texto FOR DELETE USING (public.usuario_puede_cargar_unidad(unidad_id));

DROP POLICY IF EXISTS poa_texto_mutate_admin ON public.poa_texto;
CREATE POLICY poa_texto_mutate_admin ON public.poa_texto FOR ALL USING (public.rol_actual() = 'admin_funcional') WITH CHECK (public.rol_actual() = 'admin_funcional');

NOTIFY pgrst, 'reload schema';

-- Para revertir:
--   DROP TABLE IF EXISTS public.poa_texto;

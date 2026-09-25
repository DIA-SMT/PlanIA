-- ============================================================
-- MIGRACION 053: el circuito del POA 2027 (25/09/2026)
-- ============================================================
-- Pedido del 25.09: "las POA se arman por secretarias, entonces cada secretaria
-- deberia tomar los proyectos suyos y de cada direccion que dependen de ella
-- para incluirlo en su poa", y "en la pantalla de las secretarias deberia
-- aparecerle el pdf completo (lo suyo + con lo que cada direccion envio)".
--
-- EL ENVIO ES DEL POA DEL AREA, NO DE CADA FICHA. Lo dijeron asi: "las
-- direcciones que dependan de una subsecretaria mandan sus POAs a las
-- subsecretarias. Despues las subsecretarias mandan su POA a la secretaria". O
-- sea que cada area tiene UN poa y lo manda entero cuando esta listo. Por eso
-- una fila por (area, anio) y no un estado en cada ficha: si fuera por ficha,
-- "mande mi POA" no se podria decir en un solo acto y el de arriba nunca sabria
-- si el area termino o le falta cargar.
--
-- A QUIEN SE LE MANDA no se guarda: es el padre en el organigrama. Guardarlo
-- seria repetir un dato que ya esta y que puede cambiar; si mañana mueven una
-- direccion de subsecretaria, el circuito la sigue sola.
--
-- LA FICHA SIGUE EDITABLE DESPUES DE ENVIADA. Tambien lo pidieron asi. El envio
-- no congela nada: dice "para mi esto esta listo", y si despues corrigen una
-- ficha el de arriba ve la version nueva. Por eso `enviado_at` se guarda: es lo
-- unico que permite ver que algo se toco despues de haberlo mandado.
--
-- LA SECRETARIA NO CORRIGE, OBSERVA. "No [puede corregir], pero puede hacer
-- observaciones". Por eso las observaciones son una tabla aparte y no un campo
-- de la ficha: son de quien las escribe, no del area duena de la ficha, y varias
-- personas pueden dejar la suya.
--
-- Idempotente: se puede volver a correr sin efecto.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1) El POA de un area, con su estado
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.poa_area (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unidad_id   uuid NOT NULL REFERENCES public.unidad_organizacional(id) ON DELETE CASCADE,
  anio        integer NOT NULL DEFAULT 2027,
  estado      text NOT NULL DEFAULT 'borrador' CHECK (estado IN ('borrador', 'enviado')),
  enviado_at  timestamptz,
  enviado_por uuid REFERENCES auth.users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (unidad_id, anio)
);

DROP TRIGGER IF EXISTS trg_poa_area_updated_at ON public.poa_area;
CREATE TRIGGER trg_poa_area_updated_at
  BEFORE UPDATE ON public.poa_area
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

COMMENT ON TABLE public.poa_area IS
  'Estado del POA de un area para un anio: borrador o enviado al area de arriba. El destino es el padre en el organigrama y por eso no se guarda.';

-- ------------------------------------------------------------
-- 2) Las observaciones sobre una ficha
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ficha_observacion (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ficha_id    uuid NOT NULL REFERENCES public.ficha_prisma(id) ON DELETE CASCADE,
  texto       text NOT NULL,
  autor_id    uuid REFERENCES auth.users(id),
  -- Se copia el mail: el dia que se borre el usuario, la observacion tiene que
  -- seguir diciendo quien la escribio.
  autor_email text,
  -- La deja quien observa, y solo esa persona la puede sacar.
  created_at  timestamptz NOT NULL DEFAULT now(),
  resuelta_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_ficha_observacion
  ON public.ficha_observacion(ficha_id, created_at DESC);

COMMENT ON TABLE public.ficha_observacion IS
  'Observaciones sobre una ficha PRISMA. La secretaria no corrige la ficha de una direccion: le deja una observacion (25.09).';

-- ------------------------------------------------------------
-- 3) Quien puede que
-- ------------------------------------------------------------
ALTER TABLE public.poa_area ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ficha_observacion ENABLE ROW LEVEL SECURITY;

-- El estado del POA de un area lo ve quien ve esa area: el area misma y las de
-- arriba, que es justamente lo que necesitan para saber quien ya mando.
DROP POLICY IF EXISTS poa_area_select ON public.poa_area;
CREATE POLICY poa_area_select ON public.poa_area
  FOR SELECT USING (public.usuario_puede_ver_unidad(unidad_id));

-- Enviar el POA lo hace el area duena, con la misma regla de carga que el resto.
DROP POLICY IF EXISTS poa_area_mutate_carga ON public.poa_area;
CREATE POLICY poa_area_mutate_carga ON public.poa_area
  FOR ALL
  USING (public.usuario_puede_cargar_unidad(unidad_id))
  WITH CHECK (public.usuario_puede_cargar_unidad(unidad_id));

DROP POLICY IF EXISTS poa_area_mutate_admin ON public.poa_area;
CREATE POLICY poa_area_mutate_admin ON public.poa_area
  FOR ALL
  USING (public.rol_actual() IN ('admin_funcional', 'admin_tecnico'))
  WITH CHECK (public.rol_actual() IN ('admin_funcional', 'admin_tecnico'));

-- Las observaciones se leen si se puede ver la ficha, y se escriben igual: el
-- que observa es alguien de arriba, y "arriba" es exactamente lo que
-- `usuario_puede_ver_unidad` ya sabe resolver.
DROP POLICY IF EXISTS ficha_obs_select ON public.ficha_observacion;
CREATE POLICY ficha_obs_select ON public.ficha_observacion
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM public.ficha_prisma f
    WHERE f.id = ficha_observacion.ficha_id
      AND public.usuario_puede_ver_unidad(f.unidad_id)
  ));

DROP POLICY IF EXISTS ficha_obs_insert ON public.ficha_observacion;
CREATE POLICY ficha_obs_insert ON public.ficha_observacion
  FOR INSERT WITH CHECK (EXISTS (
    SELECT 1 FROM public.ficha_prisma f
    WHERE f.id = ficha_observacion.ficha_id
      AND public.usuario_puede_ver_unidad(f.unidad_id)
  ));

-- Borrar la propia observacion, y marcarla resuelta tambien: el que la escribio
-- es el que sabe si quedo saldada.
DROP POLICY IF EXISTS ficha_obs_propia ON public.ficha_observacion;
CREATE POLICY ficha_obs_propia ON public.ficha_observacion
  FOR UPDATE USING (autor_id = auth.uid()) WITH CHECK (autor_id = auth.uid());

DROP POLICY IF EXISTS ficha_obs_borrar_propia ON public.ficha_observacion;
CREATE POLICY ficha_obs_borrar_propia ON public.ficha_observacion
  FOR DELETE USING (autor_id = auth.uid());

DROP POLICY IF EXISTS ficha_obs_admin ON public.ficha_observacion;
CREATE POLICY ficha_obs_admin ON public.ficha_observacion
  FOR ALL
  USING (public.rol_actual() = 'admin_funcional')
  WITH CHECK (public.rol_actual() = 'admin_funcional');

COMMIT;

-- Para revertir:
--   BEGIN;
--   DROP TABLE IF EXISTS public.ficha_observacion;
--   DROP TABLE IF EXISTS public.poa_area;
--   COMMIT;

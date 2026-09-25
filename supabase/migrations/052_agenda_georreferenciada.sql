-- ============================================================
-- MIGRACION 052: Agenda Georreferenciada (22/09/2026)
-- ============================================================
-- Pedido del 22.09: "una plataforma digital de agenda y visualizacion
-- territorial que centralice las actividades desarrolladas por las distintas
-- Secretarias, Direcciones y reparticiones municipales".
--
-- POR QUE UNA TABLA NUEVA Y NO LA AGENDA QUE YA EXISTE.
-- `agenda_semana` / `agenda_actividad` es una hoja semanal de texto libre por
-- unidad: el dia es un numero del 1 al 7, el horario y el lugar son texto, y no
-- hay fecha real, ni estado, ni coordenadas. No se puede poner un pin en un
-- mapa con eso. Ademas esa agenda se va: decidido el 22.09, "la que esta en
-- PlanIA desaparece y queda esta georreferenciada". Medido antes de proponerlo:
-- tenia 7 semanas cargadas de 6 unidades y 12 actividades, todas entre junio y
-- agosto, ninguna de hoy en adelante. No hay nada que migrar.
--
-- QUIEN VE QUE. Todo el mundo ve todas las actividades. No es un descuido: el
-- pedido dice "disponer de una vision integrada de la actividad municipal,
-- facilitando la coordinacion entre areas". Si cada uno viera solo lo suyo, el
-- mapa mostraria una ciudad vacia y el sistema no serviria para lo que lo
-- piden. Editar es otra cosa y ahi si manda el area: se reusa
-- `usuario_puede_cargar_unidad`, la misma funcion que gobierna el POA, para que
-- el dia que cambie el criterio cambie en un solo lugar.
--
-- EL HISTORIAL LO ESCRIBE UN TRIGGER y no la aplicacion. "Registro de
-- modificaciones, historial de cambios" es del pedido, y si dependiera de que
-- cada pantalla se acuerde de anotar, el dia que alguien edite desde otro lado
-- el cambio no queda registrado.
--
-- Idempotente: se puede volver a correr sin efecto.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1) La actividad
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.actividad (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Cuando. `fecha` es obligatoria porque sin eso no entra ni en la agenda ni
  -- en el mapa; los horarios no, que hay actividades "durante la manana".
  fecha         date NOT NULL,
  hora_desde    time,
  hora_hasta    time,

  -- Que
  titulo        text NOT NULL,
  descripcion   text,

  -- De quien. Es una FK de verdad y no un rotulo: de aca salen los permisos de
  -- edicion y el color en el mapa.
  unidad_id     uuid NOT NULL REFERENCES public.unidad_organizacional(id) ON DELETE RESTRICT,

  -- Los siete tipos de la maqueta del 22.09. Texto y no enum, igual que en la
  -- 049: la lista la escribe Planificacion y ya van dos veces que aparecen
  -- categorias nuevas. La pantalla pinta de gris lo que no reconoce.
  tipo          text NOT NULL DEFAULT 'otras',

  -- El circuito del pedido: "carga -> actualizacion -> confirmacion ->
  -- realizacion -> historico". Aca si va CHECK: el estado decide que aparece en
  -- "pendientes de confirmacion" y que cuenta como hecho, y un valor escrito
  -- con otra ortografia rompe los contadores en silencio.
  estado        text NOT NULL DEFAULT 'programada'
                CHECK (estado IN ('programada', 'confirmada', 'en_curso', 'realizada', 'suspendida')),

  -- Donde. El texto es lo que escribe la persona; lat/lng es el pin, que puede
  -- faltar: una reunion interna no necesita estar en el mapa y obligar a
  -- ubicarla haria que nadie cargue nada.
  lugar_texto   text,
  lat           double precision CHECK (lat BETWEEN -90 AND 90),
  lng           double precision CHECK (lng BETWEEN -180 AND 180),

  -- Para la lista de "requiere atencion" y la alerta.
  requiere_confirmacion boolean NOT NULL DEFAULT false,

  -- "En una etapa posterior podra vincularse con SIPEM, permitiendo relacionar
  -- determinadas actividades territoriales con proyectos". La columna se crea
  -- ahora, vacia, para no migrar despues.
  proyecto_id   uuid REFERENCES public.proyecto(id) ON DELETE SET NULL,

  -- "Acceso a antecedentes y datos relevantes asociados a determinadas
  -- actividades, facilitando su preparacion previa".
  briefing      text,

  created_by    uuid REFERENCES auth.users(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  -- Borrado logico: una actividad que se suspende se marca `suspendida` y sigue
  -- a la vista; esto es para el error de carga.
  deleted_at    timestamptz
);

-- La agenda siempre pregunta por un rango de fechas, y el mapa por las que
-- tienen pin.
CREATE INDEX IF NOT EXISTS idx_actividad_fecha ON public.actividad(fecha) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_actividad_unidad_fecha ON public.actividad(unidad_id, fecha) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_actividad_con_pin ON public.actividad(fecha) WHERE deleted_at IS NULL AND lat IS NOT NULL;

DROP TRIGGER IF EXISTS trg_actividad_updated_at ON public.actividad;
CREATE TRIGGER trg_actividad_updated_at BEFORE UPDATE ON public.actividad FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

COMMENT ON TABLE public.actividad IS 'Actividades territoriales del municipio (Agenda Georreferenciada, 22.09). Las ve todo el mundo; las edita el area responsable.';

-- ------------------------------------------------------------
-- 2) El historial de cambios
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.actividad_historial (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actividad_id   uuid NOT NULL REFERENCES public.actividad(id) ON DELETE CASCADE,
  campo          text NOT NULL,
  valor_anterior text,
  valor_nuevo    text,
  cambiado_por   uuid REFERENCES auth.users(id),
  -- El mail se copia y no se resuelve por join: el dia que se borre el usuario,
  -- el historial tiene que seguir diciendo quien fue.
  cambiado_por_email text,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_actividad_historial ON public.actividad_historial(actividad_id, created_at DESC);

COMMENT ON TABLE public.actividad_historial IS 'Una fila por campo modificado de una actividad. La escribe un trigger, no la aplicacion.';

-- ------------------------------------------------------------
-- 3) El trigger que anota los cambios
-- ------------------------------------------------------------
-- Una sola comparacion generica en vez de un IF por campo. Antes eran ocho
-- bloques y cincuenta lineas, y el editor SQL de Supabase cortaba el bloque
-- $$ por la mitad al pegarlo. Ademas, asi, el dia que se agregue una columna a
-- `actividad` alcanza con sumarla a la lista de abajo.
--
-- La etiqueta $hist$ en vez de $$ es a proposito: los editores que parten el
-- script por punto y coma reconocen mejor una comilla de dolar con nombre.
CREATE OR REPLACE FUNCTION public.registrar_cambio_actividad() RETURNS trigger AS $hist$
DECLARE correo text; campo text; antes jsonb := to_jsonb(OLD); ahora jsonb := to_jsonb(NEW);
BEGIN
  SELECT p.email INTO correo FROM public.perfil_usuario p WHERE p.user_id = auth.uid();
  FOREACH campo IN ARRAY ARRAY['fecha','hora_desde','hora_hasta','titulo','estado','lugar_texto','lat','lng','unidad_id','tipo','requiere_confirmacion','deleted_at'] LOOP
    IF antes -> campo IS DISTINCT FROM ahora -> campo THEN
      INSERT INTO public.actividad_historial (actividad_id, campo, valor_anterior, valor_nuevo, cambiado_por, cambiado_por_email)
      VALUES (NEW.id, campo, antes ->> campo, ahora ->> campo, auth.uid(), correo);
    END IF;
  END LOOP;
  RETURN NEW;
END;
$hist$ LANGUAGE plpgsql SECURITY DEFINER;
DROP TRIGGER IF EXISTS trg_actividad_historial ON public.actividad;
CREATE TRIGGER trg_actividad_historial AFTER UPDATE ON public.actividad FOR EACH ROW EXECUTE FUNCTION public.registrar_cambio_actividad();

-- ------------------------------------------------------------
-- 4) Quien puede que
-- ------------------------------------------------------------
ALTER TABLE public.actividad ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.actividad_historial ENABLE ROW LEVEL SECURITY;

-- Ver: cualquiera que haya iniciado sesion, de cualquier area. Ver la nota de
-- arriba sobre por que.
DROP POLICY IF EXISTS actividad_select_todos ON public.actividad;
CREATE POLICY actividad_select_todos ON public.actividad
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- Editar: el area responsable, con la misma regla que el POA.
DROP POLICY IF EXISTS actividad_insert_carga ON public.actividad;
CREATE POLICY actividad_insert_carga ON public.actividad
  FOR INSERT WITH CHECK (public.usuario_puede_cargar_unidad(unidad_id));

-- El WITH CHECK ademas del USING impide mudar una actividad a un area ajena.
DROP POLICY IF EXISTS actividad_update_carga ON public.actividad;
CREATE POLICY actividad_update_carga ON public.actividad
  FOR UPDATE
  USING (public.usuario_puede_cargar_unidad(unidad_id))
  WITH CHECK (public.usuario_puede_cargar_unidad(unidad_id));

DROP POLICY IF EXISTS actividad_delete_carga ON public.actividad;
CREATE POLICY actividad_delete_carga ON public.actividad
  FOR DELETE USING (public.usuario_puede_cargar_unidad(unidad_id));

DROP POLICY IF EXISTS actividad_mutate_admin ON public.actividad;
CREATE POLICY actividad_mutate_admin ON public.actividad
  FOR ALL
  USING (public.rol_actual() IN ('admin_funcional', 'admin_tecnico'))
  WITH CHECK (public.rol_actual() IN ('admin_funcional', 'admin_tecnico'));

-- El historial se lee y no se escribe a mano: lo escribe el trigger, que corre
-- como SECURITY DEFINER y por eso no necesita politica de INSERT.
DROP POLICY IF EXISTS actividad_historial_select ON public.actividad_historial;
CREATE POLICY actividad_historial_select ON public.actividad_historial
  FOR SELECT USING (auth.uid() IS NOT NULL);

COMMIT;

-- Para revertir:
--   BEGIN;
--   DROP TABLE IF EXISTS public.actividad_historial;
--   DROP TABLE IF EXISTS public.actividad;
--   DROP FUNCTION IF EXISTS public.registrar_cambio_actividad();
--   COMMIT;

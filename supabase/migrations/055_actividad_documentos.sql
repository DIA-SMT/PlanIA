-- ============================================================
-- MIGRACION 055: Documentos de una actividad (30/09/2026)
-- ============================================================
-- Etapa 4 del plan del 22.09: "la ficha y el briefing... el detalle completo:
-- responsables, ubicacion, antecedentes, documentacion, proyectos vinculados.
-- Aca se suben los archivos".
--
-- ES LA PRIMERA VEZ QUE EL PROYECTO USA SUPABASE STORAGE. Hasta hoy PlanIA no
-- guardaba un solo archivo: todo era texto y numeros en tablas. Por eso esta
-- migracion crea el bucket ademas de la tabla, y por eso conviene revisar en el
-- panel de Supabase que el bucket haya quedado creado despues de aplicarla.
--
-- POR QUE UNA TABLA Y NO SOLO EL BUCKET. El bucket guarda el archivo; la tabla
-- guarda que ese archivo pertenece a esta actividad, quien lo subio y cuando.
-- Listar un bucket por prefijo funcionaria, pero perderia el autor y la fecha,
-- que es justo lo que el pedido llama trazabilidad.
--
-- LA RUTA ES <actividad_id>/<archivo>. No es cosmetico: las politicas del
-- bucket sacan de ahi a que actividad pertenece el archivo, y de ahi que area
-- lo puede tocar. Si la ruta cambia de forma, las politicas dejan de proteger.
--
-- QUIEN VE QUE. Igual que las actividades: ve cualquiera que haya iniciado
-- sesion, escribe solo el area responsable. La razon esta en la 052.
-- ============================================================

-- ------------------------------------------------------------
-- 1) La tabla
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.actividad_documento (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actividad_id   uuid NOT NULL REFERENCES public.actividad(id) ON DELETE CASCADE,
  -- El nombre con el que lo subieron, para mostrarlo tal cual.
  nombre         text NOT NULL,
  -- La ruta dentro del bucket. Unica: dos filas apuntando al mismo archivo
  -- harian que borrar una dejara la otra colgada.
  ruta           text NOT NULL UNIQUE,
  tipo_mime      text,
  tamano_bytes   bigint,
  subido_por     uuid REFERENCES auth.users(id),
  -- El mail se copia y no se resuelve por join, por lo mismo que en el
  -- historial: el dia que se borre el usuario, tiene que seguir diciendo quien.
  subido_por_email text,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_actividad_documento ON public.actividad_documento(actividad_id, created_at DESC);

COMMENT ON TABLE public.actividad_documento IS 'Archivos adjuntos de una actividad (etapa 4, 30.09). El archivo vive en el bucket actividad-documentos; aca vive de quien es.';

-- ------------------------------------------------------------
-- 2) Quien puede que, sobre la tabla
-- ------------------------------------------------------------
ALTER TABLE public.actividad_documento ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS actividad_doc_select ON public.actividad_documento;
CREATE POLICY actividad_doc_select ON public.actividad_documento FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS actividad_doc_insert ON public.actividad_documento;
CREATE POLICY actividad_doc_insert ON public.actividad_documento FOR INSERT WITH CHECK (public.usuario_puede_cargar_unidad((SELECT a.unidad_id FROM public.actividad a WHERE a.id = actividad_id)));

DROP POLICY IF EXISTS actividad_doc_delete ON public.actividad_documento;
CREATE POLICY actividad_doc_delete ON public.actividad_documento FOR DELETE USING (public.usuario_puede_cargar_unidad((SELECT a.unidad_id FROM public.actividad a WHERE a.id = actividad_id)));

DROP POLICY IF EXISTS actividad_doc_admin ON public.actividad_documento;
CREATE POLICY actividad_doc_admin ON public.actividad_documento FOR ALL USING (public.rol_actual() IN ('admin_funcional', 'admin_tecnico')) WITH CHECK (public.rol_actual() IN ('admin_funcional', 'admin_tecnico'));

-- ------------------------------------------------------------
-- 3) El bucket
-- ------------------------------------------------------------
-- Privado: los archivos se sirven con enlaces firmados que vencen, no por URL
-- publica. Un briefing con datos de una actividad de la Intendenta no puede
-- quedar accesible para cualquiera que adivine la direccion.
INSERT INTO storage.buckets (id, name, public) VALUES ('actividad-documentos', 'actividad-documentos', false) ON CONFLICT (id) DO NOTHING;

-- ------------------------------------------------------------
-- 4) Quien puede que, sobre el bucket
-- ------------------------------------------------------------
-- Las mismas reglas que la tabla, pero sobre los archivos. Van aparte porque
-- storage.objects es otra tabla con su propia RLS: sin estas, alguien con la
-- clave publica podria escribir en el bucket aunque la tabla lo rechace.
--
-- La primera carpeta de la ruta es el id de la actividad, y de ahi sale el area.
DROP POLICY IF EXISTS actividad_doc_obj_select ON storage.objects;
CREATE POLICY actividad_doc_obj_select ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'actividad-documentos');

DROP POLICY IF EXISTS actividad_doc_obj_insert ON storage.objects;
CREATE POLICY actividad_doc_obj_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'actividad-documentos' AND public.usuario_puede_cargar_unidad((SELECT a.unidad_id FROM public.actividad a WHERE a.id::text = (storage.foldername(name))[1])));

DROP POLICY IF EXISTS actividad_doc_obj_delete ON storage.objects;
CREATE POLICY actividad_doc_obj_delete ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'actividad-documentos' AND public.usuario_puede_cargar_unidad((SELECT a.unidad_id FROM public.actividad a WHERE a.id::text = (storage.foldername(name))[1])));

-- ------------------------------------------------------------
-- 5) El historial tambien anota el briefing, el detalle y el proyecto
-- ------------------------------------------------------------
-- El trigger de la 052 miraba doce campos y no incluia briefing, descripcion ni
-- proyecto_id, porque hasta la etapa 4 no habia donde editarlos. Ahora la ficha
-- los edita, y un briefing que cambia sin dejar rastro es justo lo que el
-- pedido pide evitar cuando habla de registro de modificaciones.
--
-- Es el cambio que el comentario original anticipaba: sumar la columna a la
-- lista, sin escribir otro bloque de comparacion.
CREATE OR REPLACE FUNCTION public.registrar_cambio_actividad() RETURNS trigger AS $hist$
DECLARE correo text; campo text; antes jsonb := to_jsonb(OLD); ahora jsonb := to_jsonb(NEW);
BEGIN
  SELECT p.email INTO correo FROM public.perfil_usuario p WHERE p.user_id = auth.uid();
  FOREACH campo IN ARRAY ARRAY['fecha','hora_desde','hora_hasta','titulo','estado','lugar_texto','lat','lng','unidad_id','tipo','requiere_confirmacion','deleted_at','briefing','descripcion','proyecto_id'] LOOP
    IF antes -> campo IS DISTINCT FROM ahora -> campo THEN
      INSERT INTO public.actividad_historial (actividad_id, campo, valor_anterior, valor_nuevo, cambiado_por, cambiado_por_email)
      VALUES (NEW.id, campo, antes ->> campo, ahora ->> campo, auth.uid(), correo);
    END IF;
  END LOOP;
  RETURN NEW;
END;
$hist$ LANGUAGE plpgsql SECURITY DEFINER;

-- ------------------------------------------------------------
-- 6) Que el caché de esquema tome la tabla nueva
-- ------------------------------------------------------------
NOTIFY pgrst, 'reload schema';

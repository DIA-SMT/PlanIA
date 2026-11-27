-- El bucket de documentos y sus políticas, igual que en la migración 055.
--
-- El volcado de migrar.sh lleva solo los esquemas public y api: lo que la 055
-- creó dentro de storage (el bucket y las políticas sobre storage.objects) hay
-- que volver a crearlo en el proyecto nuevo. Es idempotente.

INSERT INTO storage.buckets (id, name, public) VALUES ('actividad-documentos', 'actividad-documentos', false) ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS actividad_doc_obj_select ON storage.objects;
CREATE POLICY actividad_doc_obj_select ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'actividad-documentos');

DROP POLICY IF EXISTS actividad_doc_obj_insert ON storage.objects;
CREATE POLICY actividad_doc_obj_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'actividad-documentos' AND public.usuario_puede_cargar_unidad((SELECT a.unidad_id FROM public.actividad a WHERE a.id::text = (storage.foldername(name))[1])));

DROP POLICY IF EXISTS actividad_doc_obj_delete ON storage.objects;
CREATE POLICY actividad_doc_obj_delete ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'actividad-documentos' AND public.usuario_puede_cargar_unidad((SELECT a.unidad_id FROM public.actividad a WHERE a.id::text = (storage.foldername(name))[1])));

NOTIFY pgrst, 'reload schema';

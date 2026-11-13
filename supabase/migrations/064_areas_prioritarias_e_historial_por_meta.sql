-- ============================================================
-- MIGRACION 064: areas con proyectos prioritarios en la base, e historial por meta (13/11/2026)
-- ============================================================
-- Correcciones del 11.11 y el 12.11:
--
-- 1. AREAS CON PROYECTOS PRIORITARIOS. La lista estaba escrita en el codigo
--    (AREAS_CON_PRIORITARIOS, por codigo de unidad), y cada area nueva
--    pedia una version nueva de PlanIA. Pedidos:
--      - "Agregar a este tablero a la Subsecretaria de obras publicas."
--      - "Agregar a la herramienta PROYECTOS PRIORITARIOS la SECRETARIA DE
--        AMBIENTE."
--      - "Crear una herramienta/boton en este tablero para que desde
--        planificacion estrategica podamos asignar proyectos prioritarios a
--        nuevas direcciones y eliminar direcciones de ser necesario."
--    Pasa a la tabla area_prioritaria: una fila por area que tiene el boton.
--    La leen todos; la cambia solo Planificacion (admin_funcional), desde
--    POA 2027 -> Proyectos prioritarios.
--
--    Se cargan las 26 que estaban en el codigo, en el mismo orden, mas la
--    Subsecretaria de Obras Publicas (no tiene codigo: se busca por nombre,
--    debajo de SEC11, como en 059) y la Secretaria de Ambiente y Desarrollo
--    Sustentable (SEC07).
--
--    Quitar un area no borra sus fichas: quedan guardadas y dejan de verse.
--    Si se la vuelve a agregar, aparecen de nuevo.
--
-- 2. HISTORIAL POR META. "Necesitamos que cada meta pueda vincularse con un
--    historico", y la consulta: "los proyectos pueden tener mas de una meta y
--    mas de un indicador por meta. Como resolveriamos el tema de la vista del
--    historial?". Cada meta de la lista (062) lleva su historial:
--      metas = [ { ..., "historial": [ { "anio": 2024, "valor": 65 }, ... ] } ]
--    El historial de la ficha (columna historial) queda igual al de la
--    PRIMERA meta, como meta_anual: el Plan Rector proyecta con ella.
--
--    Lo cargado pasa a la primera meta. Las fichas sin metas pero con
--    historial cargado reciben una meta con ese historial. Solo donde la
--    primera meta todavia no tiene historial, asi que se puede volver a
--    correr.
--
-- CORRERLA ANTES DE PUBLICAR EL CODIGO: sin la tabla nueva ninguna area tiene
-- proyectos prioritarios.
--
-- Formato para el editor SQL de Supabase: sin BEGIN/COMMIT, cada sentencia
-- fuera del CREATE TABLE en una sola linea. Idempotente.
--
-- DESPUES, para comprobar (tienen que salir 28 areas, con la Subsecretaria de
-- Obras Publicas y la Secretaria de Ambiente):
--   SELECT a.orden, u.codigo, u.nombre FROM public.area_prioritaria a JOIN public.unidad_organizacional u ON u.id = a.unidad_id ORDER BY a.orden;
-- y (no tiene que devolver filas):
--   SELECT id, nombre FROM public.proyecto_prioritario WHERE deleted_at IS NULL AND jsonb_array_length(metas) > 0 AND NOT (metas->0 ? 'historial');
-- ============================================================

-- ------------------------------------------------------------
-- 1. Areas con proyectos prioritarios
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.area_prioritaria (
  unidad_id   uuid PRIMARY KEY REFERENCES public.unidad_organizacional(id) ON DELETE CASCADE,
  orden       integer NOT NULL DEFAULT 0,
  created_by  uuid REFERENCES auth.users(id),
  created_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.area_prioritaria IS 'Areas con el boton de Proyectos prioritarios del POA 2027 (064, correcciones del 11.11). La cambia Planificacion desde PlanIA.';

ALTER TABLE public.area_prioritaria ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS area_prioritaria_select ON public.area_prioritaria;
CREATE POLICY area_prioritaria_select ON public.area_prioritaria FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS area_prioritaria_mutate_admin ON public.area_prioritaria;
CREATE POLICY area_prioritaria_mutate_admin ON public.area_prioritaria FOR ALL USING (public.rol_actual() = 'admin_funcional') WITH CHECK (public.rol_actual() = 'admin_funcional');

INSERT INTO public.area_prioritaria (unidad_id, orden) SELECT u.id, v.orden FROM public.unidad_organizacional u JOIN (VALUES ('DIR64', 1), ('DIR65', 2), ('DIR51', 3), ('SEC11', 4), ('DIR50', 6), ('DIR49', 7), ('DIR62', 8), ('DIR15', 9), ('DIR44', 10), ('DIR02', 11), ('SEC10', 12), ('DIR06', 13), ('DIR01', 14), ('DIR08', 15), ('DIR09', 16), ('DIR42', 17), ('DIR05', 18), ('DIR66', 19), ('DIR30', 20), ('DIR34', 21), ('DIR16', 22), ('DIR17', 23), ('DIR22', 24), ('DIR03', 25), ('DIR04', 26), ('DIR41', 27), ('SEC07', 28)) AS v(codigo, orden) ON u.codigo = v.codigo ON CONFLICT (unidad_id) DO NOTHING;

INSERT INTO public.area_prioritaria (unidad_id, orden) SELECT sub.id, 5 FROM public.unidad_organizacional sub JOIN public.unidad_organizacional s ON s.id = sub.parent_id WHERE s.codigo = 'SEC11' AND sub.nombre = 'Subsecretaría de Obras Públicas' ON CONFLICT (unidad_id) DO NOTHING;

-- ------------------------------------------------------------
-- 2. Historial por meta
-- ------------------------------------------------------------

UPDATE public.proyecto_prioritario SET metas = jsonb_set(metas, '{0,historial}', historial) WHERE jsonb_array_length(metas) > 0 AND NOT (metas->0 ? 'historial');

UPDATE public.proyecto_prioritario SET metas = jsonb_build_array(jsonb_build_object('id', gen_random_uuid()::text, 'valor', meta_anual, 'descripcion', NULL, 'indicadores', '[]'::jsonb, 'historial', historial)) WHERE metas = '[]'::jsonb AND EXISTS (SELECT 1 FROM jsonb_array_elements(historial) h WHERE h->>'valor' IS NOT NULL);

NOTIFY pgrst, 'reload schema';

-- Para revertir (el historial de la ficha sigue teniendo el de la primera meta):
--   DROP TABLE IF EXISTS public.area_prioritaria;
--   UPDATE public.proyecto_prioritario SET metas = (SELECT jsonb_agg(m - 'historial') FROM jsonb_array_elements(metas) m) WHERE jsonb_array_length(metas) > 0;

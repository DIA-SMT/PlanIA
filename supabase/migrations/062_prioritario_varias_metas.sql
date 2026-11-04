-- ============================================================
-- MIGRACION 062: varias metas e indicadores en la ficha de proyecto prioritario (04/11/2026)
-- ============================================================
-- Agregado a la correccion del 30.10: "se debe poder cargar mas de un
-- indicador x meta y mas de una meta x proyecto". La ficha tenia una sola
-- meta (meta_anual) y un solo indicador (indicador).
--
-- Va en una columna jsonb, como el historial:
--   metas = [ { "id": "...", "valor": 60, "descripcion": "...",
--               "indicadores": [ { "id": "...", "texto": "..." } ] }, ... ]
-- Los id son para editar o borrar una meta o un indicador sin depender de su
-- posicion en la lista.
--
-- meta_anual e indicador NO se borran: la aplicacion los mantiene iguales a
-- la PRIMERA meta y su primer indicador, para que lo que ya los lee (el
-- Plan Rector proyecta con meta_anual) siga andando.
--
-- Lo cargado pasa a la lista: la meta y el indicador de cada ficha quedan
-- como su primera meta. Solo en las fichas que todavia no tienen metas, asi
-- que se puede volver a correr.
--
-- CORRERLA ANTES DE PUBLICAR EL CODIGO: la aplicacion lee la columna nueva, y
-- sin ella la ficha y las listas de proyectos prioritarios dan error.
--
-- Formato para el editor SQL de Supabase: sin BEGIN/COMMIT, cada sentencia en
-- una sola linea. Idempotente.
--
-- DESPUES, para comprobar (todas las fichas con meta o indicador cargados
-- tienen que tener al menos una meta en la lista):
--   SELECT id, nombre, meta_anual, indicador, metas FROM public.proyecto_prioritario WHERE deleted_at IS NULL;
-- ============================================================

ALTER TABLE public.proyecto_prioritario ADD COLUMN IF NOT EXISTS metas jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.proyecto_prioritario DROP CONSTRAINT IF EXISTS proyecto_prioritario_metas_check;
ALTER TABLE public.proyecto_prioritario ADD CONSTRAINT proyecto_prioritario_metas_check CHECK (jsonb_typeof(metas) = 'array');

UPDATE public.proyecto_prioritario SET metas = jsonb_build_array(jsonb_build_object('id', gen_random_uuid()::text, 'valor', meta_anual, 'descripcion', NULL, 'indicadores', CASE WHEN indicador IS NULL OR btrim(indicador) = '' THEN '[]'::jsonb ELSE jsonb_build_array(jsonb_build_object('id', gen_random_uuid()::text, 'texto', indicador)) END)) WHERE metas = '[]'::jsonb AND (meta_anual IS NOT NULL OR (indicador IS NOT NULL AND btrim(indicador) <> ''));

NOTIFY pgrst, 'reload schema';

-- Para revertir (meta_anual e indicador siguen teniendo la primera meta):
--   ALTER TABLE public.proyecto_prioritario DROP CONSTRAINT IF EXISTS proyecto_prioritario_metas_check;
--   ALTER TABLE public.proyecto_prioritario DROP COLUMN IF EXISTS metas;
-- ============================================================

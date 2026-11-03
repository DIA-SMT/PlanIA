-- ============================================================
-- MIGRACION 060: justificacion tecnica de la ficha de proyecto prioritario (02/11/2026)
-- ============================================================
-- Correccion del 30.10, punto 7: "Agregar un campo que diga: Justificacion
-- tecnica", en Seguimiento y evolucion.
--
-- En la misma correccion sale "Medio de verificacion" de la ficha. La columna
-- medio_verificacion NO se borra: queda con lo que se haya cargado, y la
-- aplicacion deja de mostrarla y de editarla.
--
-- CORRERLA ANTES DE PUBLICAR EL CODIGO: la aplicacion lee la columna nueva, y
-- sin ella la ficha y el listado de proyectos prioritarios dan error.
--
-- Formato para el editor SQL de Supabase: sin BEGIN/COMMIT. Idempotente.
--
-- DESPUES, para comprobar (tiene que devolver una fila):
--   SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'proyecto_prioritario' AND column_name = 'justificacion_tecnica';
-- ============================================================

ALTER TABLE public.proyecto_prioritario ADD COLUMN IF NOT EXISTS justificacion_tecnica text;

NOTIFY pgrst, 'reload schema';

-- Para revertir:
--   ALTER TABLE public.proyecto_prioritario DROP COLUMN IF EXISTS justificacion_tecnica;
-- ============================================================

-- ============================================================
-- MIGRACION 063: ficha de proyecto prioritario, correcciones del 05.11 (06/11/2026)
-- ============================================================
-- Tres pedidos que necesitan columnas nuevas:
--
-- 1. PLAN RECTOR SIN POA 2026. "Si no se asocia a la POA 2026, no permite
--    cargar el ambito y eje." El eje salia solo del proyecto del POA 2026 al
--    que corresponde la ficha. plan_rector_eje_id es el eje elegido a mano
--    para las fichas sin ese proyecto (o con un proyecto que no esta imputado
--    al Plan Rector). El ambito no se guarda: es el padre del eje. Si el
--    proyecto del 2026 esta imputado, manda esa imputacion.
--
-- 2. LINEAS DE BASE CON TEXTO. "En ambas lineas de base se debe poder
--    escribir. Solo recibe numeros." linea_base_total_texto y
--    linea_base_pendiente_texto guardan lo escrito cuando no es un numero
--    solo ("930 basurales relevados en 2023"). Las columnas numericas siguen:
--    tienen la cantidad con la que empieza el texto, si empieza con una, y el
--    Plan Rector proyecta con la pendiente como hasta ahora.
--
-- 3. OBSERVACIONES. "Agregar Observaciones debajo de la linea de base."
--    linea_base_observaciones.
--
-- El total planificado por indicador (punto 4 de la ficha) no necesita
-- columna: va adentro de la lista de metas (062), en cada indicador.
--
-- CORRERLA ANTES DE PUBLICAR EL CODIGO: la aplicacion lee las columnas
-- nuevas, y sin ellas la ficha y las listas de proyectos prioritarios dan
-- error.
--
-- Formato para el editor SQL de Supabase: sin BEGIN/COMMIT, cada sentencia en
-- una sola linea. Idempotente.
--
-- DESPUES, para comprobar (tiene que devolver cuatro filas):
--   SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'proyecto_prioritario' AND column_name IN ('plan_rector_eje_id', 'linea_base_total_texto', 'linea_base_pendiente_texto', 'linea_base_observaciones');
-- ============================================================

ALTER TABLE public.proyecto_prioritario ADD COLUMN IF NOT EXISTS plan_rector_eje_id uuid REFERENCES public.plan_rector_nodo(id) ON DELETE SET NULL;

ALTER TABLE public.proyecto_prioritario ADD COLUMN IF NOT EXISTS linea_base_total_texto text;

ALTER TABLE public.proyecto_prioritario ADD COLUMN IF NOT EXISTS linea_base_pendiente_texto text;

ALTER TABLE public.proyecto_prioritario ADD COLUMN IF NOT EXISTS linea_base_observaciones text;

NOTIFY pgrst, 'reload schema';

-- Para revertir:
--   ALTER TABLE public.proyecto_prioritario DROP COLUMN IF EXISTS plan_rector_eje_id;
--   ALTER TABLE public.proyecto_prioritario DROP COLUMN IF EXISTS linea_base_total_texto;
--   ALTER TABLE public.proyecto_prioritario DROP COLUMN IF EXISTS linea_base_pendiente_texto;
--   ALTER TABLE public.proyecto_prioritario DROP COLUMN IF EXISTS linea_base_observaciones;

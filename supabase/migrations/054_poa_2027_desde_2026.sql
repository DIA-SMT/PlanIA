-- ============================================================
-- MIGRACION 054: el POA 2027 arranca del 2026 (28/09/2026)
-- ============================================================
-- 28.09: "no podemos hacer que se reconozcan automaticamente mis proyectos y en
-- la parte mis fichas yo lo termine de completar con la info y acepte para que
-- vaya a mi poa?".
--
-- Es el pedido del 09.09 que nunca se pudo hacer: "un duplicado editable de la
-- POA 2026, una poa a medias ya avanzada para que sea menos trabajo cargar la
-- poa". Ahora se puede porque en septiembre se importaron los ocho libros del
-- POA y los proyectos traen su descripcion, su periodo, su linea de base y su
-- meta. Medido: de los 478 proyectos activos, 306 llegan con algo cargado y 172
-- con el titulo solo.
--
-- DOS COSAS NUEVAS EN LA FICHA:
--
-- 1. Los campos que el POA real usa y PRISMA no tenia. Medido sobre los 366
--    proyectos de los libros: el periodo de trabajo lo tienen 3 de cada 4, y el
--    hito 1 de cada 6. Sin ellos el documento no puede quedar igual al de 2026.
--
-- 2. De donde salio la ficha y si ya la aceptaron. Una ficha PROPUESTA es la que
--    genero el sistema desde un proyecto de 2026: esta a la vista del area para
--    completarla, pero NO entra en el documento hasta que la acepten. Una
--    ACEPTADA es la que el area hizo suya, sea porque la cargo a mano o porque
--    reviso la propuesta.
--
-- Las fichas que ya existen quedan aceptadas: las cargo una persona a mano.
--
-- El indice unico sobre (proyecto_origen_id, anio) es lo que permite apretar
-- "traer mis proyectos" dos veces sin que se dupliquen las propuestas.
--
-- Va SIN BEGIN/COMMIT y con cada sentencia en una linea, como la 052: el editor
-- de Supabase corta los bloques largos, y dentro de una transaccion un corte
-- deshace todo en silencio. Todas las sentencias son idempotentes.
-- ============================================================

ALTER TABLE public.ficha_prisma ADD COLUMN IF NOT EXISTS periodo text;
ALTER TABLE public.ficha_prisma ADD COLUMN IF NOT EXISTS hito text;
ALTER TABLE public.ficha_prisma ADD COLUMN IF NOT EXISTS proyecto_origen_id uuid REFERENCES public.proyecto(id) ON DELETE SET NULL;
ALTER TABLE public.ficha_prisma ADD COLUMN IF NOT EXISTS estado text NOT NULL DEFAULT 'aceptada';

COMMENT ON COLUMN public.ficha_prisma.periodo IS 'Periodo de trabajo, como lo escribe el POA: "de enero a diciembre de 2027".';
COMMENT ON COLUMN public.ficha_prisma.hito IS 'Hito del proyecto, si tiene. Lo usa 1 de cada 6 proyectos del POA 2026.';
COMMENT ON COLUMN public.ficha_prisma.proyecto_origen_id IS 'El proyecto del POA 2026 del que salio esta propuesta. null si la cargaron a mano.';
COMMENT ON COLUMN public.ficha_prisma.estado IS 'propuesta = la genero el sistema y espera que el area la complete y la acepte. aceptada = entra en el documento.';

-- Se agrega despues de la columna para que las filas que ya estan queden con el
-- default 'aceptada' y no choquen contra el CHECK.
ALTER TABLE public.ficha_prisma DROP CONSTRAINT IF EXISTS ficha_prisma_estado_check;
ALTER TABLE public.ficha_prisma ADD CONSTRAINT ficha_prisma_estado_check CHECK (estado IN ('propuesta', 'aceptada'));

-- Apretar "traer mis proyectos" dos veces no puede duplicar la propuesta.
CREATE UNIQUE INDEX IF NOT EXISTS idx_ficha_origen_unico ON public.ficha_prisma(proyecto_origen_id, anio) WHERE proyecto_origen_id IS NOT NULL AND deleted_at IS NULL;

-- La pantalla siempre pregunta por el area y el anio.
CREATE INDEX IF NOT EXISTS idx_ficha_unidad_anio ON public.ficha_prisma(unidad_id, anio) WHERE deleted_at IS NULL;

-- Para revertir:
--   ALTER TABLE public.ficha_prisma DROP COLUMN IF EXISTS periodo;
--   ALTER TABLE public.ficha_prisma DROP COLUMN IF EXISTS hito;
--   ALTER TABLE public.ficha_prisma DROP COLUMN IF EXISTS proyecto_origen_id;
--   ALTER TABLE public.ficha_prisma DROP COLUMN IF EXISTS estado;

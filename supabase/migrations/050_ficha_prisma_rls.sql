-- ============================================================
-- MIGRACION 050: cada direccion edita solo su POA 2027
-- ============================================================
-- 17.09: "lo que necesitamos es que cada direccion pueda editar solo su poa".
--
-- LO QUE SE ENCONTRO AL IR A MIRARLO, que es peor que el pedido:
--
-- `ficha_prisma` —la planificacion del POA 2027, una ficha por proyecto de
-- cada direccion— quedo SIN RLS desde que se creo en la 016. Todas las demas
-- tablas del POA la tienen desde la 012; esta se paso por alto.
--
-- Sin RLS, PostgREST sirve la tabla a quien sea: comprobado el 17.09 leyendo
-- las 10 fichas con la clave publica y sin iniciar sesion. Esa clave viaja en
-- el JavaScript del navegador, asi que no es un secreto y no puede ser lo que
-- proteja el dato.
--
-- Y las tres acciones de escritura hablaban con la base con esa misma clave sin
-- sesion, de modo que la base nunca sabia quien estaba escribiendo:
--   - eliminarFichaPrisma no comprobaba pertenencia: cualquiera borraba la
--     ficha de cualquier direccion pasando el id.
--   - editarFichaPrisma la comprobaba solo si el rol era 'director'. Un
--     secretario, subsecretario o coordinador editaba la de cualquier
--     direccion del municipio, no solo las de su area.
--
-- Esta migracion cierra la puerta en la base. El cambio que acompaña en
-- `actions.ts` hace que esas acciones usen el cliente CON sesion: sin eso, al
-- prender la RLS las escrituras pasarian a fallar en silencio.
--
-- QUIEN PUEDE QUE:
--   ver     -> el mismo alcance que el resto del POA (usuario_puede_ver_unidad)
--   editar  -> el mismo alcance de carga del POA (usuario_puede_cargar_unidad):
--              el director su direccion y las de arriba, el secretario y el
--              subsecretario su arbol hacia abajo. Una direccion NO toca la
--              ficha de una direccion hermana.
--   todo    -> admin_funcional, como en las demas tablas.
--
-- Se reusan las dos funciones que ya existen en vez de escribir la regla de
-- nuevo: el dia que cambie el criterio, cambia en un solo lugar y las fichas
-- acompañan al resto del POA.
--
-- Idempotente: se puede volver a correr sin efecto.
-- ============================================================

BEGIN;

ALTER TABLE public.ficha_prisma ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ficha_select_scope ON public.ficha_prisma;
CREATE POLICY ficha_select_scope ON public.ficha_prisma
  FOR SELECT
  USING (public.usuario_puede_ver_unidad(unidad_id));

DROP POLICY IF EXISTS ficha_insert_carga ON public.ficha_prisma;
CREATE POLICY ficha_insert_carga ON public.ficha_prisma
  FOR INSERT
  WITH CHECK (public.usuario_puede_cargar_unidad(unidad_id));

-- El WITH CHECK ademas del USING es lo que impide mudar una ficha a otra
-- unidad: sin el, se podria editar una ficha propia y dejarla colgando de una
-- direccion ajena.
DROP POLICY IF EXISTS ficha_update_carga ON public.ficha_prisma;
CREATE POLICY ficha_update_carga ON public.ficha_prisma
  FOR UPDATE
  USING (public.usuario_puede_cargar_unidad(unidad_id))
  WITH CHECK (public.usuario_puede_cargar_unidad(unidad_id));

-- El borrado de una ficha es logico (deleted_at), o sea un UPDATE, y ya queda
-- cubierto por la politica de arriba. Esta es para el borrado fisico, que hoy
-- no lo hace ninguna pantalla pero que sin politica quedaria prohibido para
-- todos menos el admin — que es justo lo que se quiere.
DROP POLICY IF EXISTS ficha_delete_carga ON public.ficha_prisma;
CREATE POLICY ficha_delete_carga ON public.ficha_prisma
  FOR DELETE
  USING (public.usuario_puede_cargar_unidad(unidad_id));

DROP POLICY IF EXISTS ficha_mutate_admin ON public.ficha_prisma;
CREATE POLICY ficha_mutate_admin ON public.ficha_prisma
  FOR ALL
  USING (public.rol_actual() = 'admin_funcional')
  WITH CHECK (public.rol_actual() = 'admin_funcional');

COMMENT ON TABLE public.ficha_prisma IS
  'Fichas PRISMA de planificacion POA 2027. Una por programa/proyecto planificado por cada Direccion. RLS desde la 050: se ve y se edita con el mismo alcance que el resto del POA.';

COMMIT;

-- Para revertir (NO conviene: deja la tabla abierta a la clave publica):
--   BEGIN;
--   ALTER TABLE public.ficha_prisma DISABLE ROW LEVEL SECURITY;
--   COMMIT;

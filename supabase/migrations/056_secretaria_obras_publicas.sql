-- ============================================================
-- MIGRACION 056: Secretaria de Obras Publicas (06/10/2026)
-- ============================================================
-- Pedido del 05.10 en el grupo: "podriamos hacer una prueba en la agenda? les
-- paso una info de obras publicas [...] se lo puede cargar?". Vino con el
-- informe "OBRAS DE SEPTIEMBRE-OCTUBRE + FINALIZADAS RECIENTEMENTE", firmado por
-- la Secretaria de Obras Publicas, Direccion de Obras Viales.
--
-- Ninguna de las dos existia en el organigrama: se revisaron las 80 unidades,
-- activas e inactivas. Existe en el municipio pero nunca se cargo en PlanIA. Y
-- en la Agenda Georreferenciada cada actividad cuelga de un area, asi que sin
-- ella las obras no tenian donde ir.
--
-- Estructura que arma:
--
--   SEC11  Secretaria de Obras Publicas
--   └── DIR64  Direccion de Obras Viales
--
-- La direccion cuelga DIRECTO de la secretaria, sin subsecretaria en el medio,
-- porque el informe no nombra ninguna. El arbol ya soporta ese caso (Via
-- Publica en la 024, Tribunal de Faltas en la 036, las tres de Movilidad Urbana
-- en la 038). Si aparece una subsecretaria, se reparenta con un UPDATE.
--
-- La direccion va con nivel 2 y tipo 'direccion': nivel >= 2 es lo que hace
-- que aparezca en el filtro de areas, pueda cargar su POA y tenga agenda.
--
-- Codigos: SEC11 y DIR64 son los primeros libres (el ultimo era SEC10, de la
-- 038, y DIR63). Orden: al final de cada nivel.
--
-- Entra solo la estructura: sin usuarios, sin proyectos del POA, sin metas.
-- En PlanIA va a aparecer en los filtros, el Plan Rector y la tabla del POA
-- 2027, vacia. Los usuarios los crean ellos, como con Movilidad Urbana.
--
-- Formato para el editor SQL de Supabase: sin BEGIN/COMMIT, cada sentencia en
-- una sola linea, sin bloques de funcion. La 038 usaba un bloque DO con
-- transaccion; es de antes de que se supiera que el editor corta esos bloques.
-- La direccion busca a su secretaria por codigo en vez de usar una variable.
--
-- Es idempotente: si SEC11 o DIR64 ya existen, esa sentencia no inserta nada.
-- ============================================================

INSERT INTO public.unidad_organizacional (parent_id, nombre, nombre_corto, tipo, nivel, orden, activa, codigo, metadata) SELECT NULL, 'Secretaría de Obras Públicas', 'Secretaría de Obras Públicas', 'secretaria', 0, 10, true, 'SEC11', '{}'::jsonb WHERE NOT EXISTS (SELECT 1 FROM public.unidad_organizacional WHERE codigo = 'SEC11');

INSERT INTO public.unidad_organizacional (parent_id, nombre, nombre_corto, tipo, nivel, orden, activa, codigo, metadata) SELECT s.id, 'Dirección de Obras Viales', 'Dirección de Obras Viales', 'direccion', 2, 46, true, 'DIR64', '{}'::jsonb FROM public.unidad_organizacional s WHERE s.codigo = 'SEC11' AND NOT EXISTS (SELECT 1 FROM public.unidad_organizacional WHERE codigo = 'DIR64');

NOTIFY pgrst, 'reload schema';

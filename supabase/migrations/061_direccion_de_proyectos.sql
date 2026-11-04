-- ============================================================
-- MIGRACION 061: Direccion de Proyectos y responsables de Obras Publicas (04/11/2026)
-- ============================================================
-- Correccion del 03.11: "Direccion de Proyectos (pertenece a la secretaria de
-- obras publicas, incluir en su organigrama)", con el organigrama completo:
--
--   SEC11  Secretaria de Obras Publicas            Ing. Claudio Bravo
--   └── Subsecretaria de Obras Publicas            Ing. Leonardo Miguez
--       ├── DIR64  Direccion de Obras Viales       Ing. Dario Vera Antonelli
--       ├── DIR65  Direccion de Alumbrado y Semaforos   Ing. Sergio Gao
--       └── DIR66  Direccion de Proyectos          Arq. C. Zarrabeitia   (nueva)
--
-- DIR66 es el primer codigo libre (el ultimo era DIR65, de la 059). Los
-- nombres de los responsables los confirmo Agustin el 04.11; en la 059 habian
-- quedado comentados porque la imagen no se leia bien.
--
-- Formato para el editor SQL de Supabase: sin BEGIN/COMMIT, cada sentencia en
-- una sola linea. Idempotente.
--
-- DESPUES, para comprobar (tienen que salir las cinco, con su responsable, y
-- las tres direcciones bajo la subsecretaria):
--   SELECT u.codigo, u.nivel, u.nombre, u.responsable_nombre, p.nombre AS padre FROM public.unidad_organizacional u LEFT JOIN public.unidad_organizacional p ON p.id = u.parent_id WHERE u.codigo IN ('SEC11', 'DIR64', 'DIR65', 'DIR66') OR u.nombre = 'Subsecretaría de Obras Públicas' ORDER BY u.nivel, u.orden;
-- ============================================================

INSERT INTO public.unidad_organizacional (parent_id, nombre, nombre_corto, tipo, nivel, orden, activa, codigo, metadata) SELECT sub.id, 'Dirección de Proyectos', 'Dirección de Proyectos', 'direccion', 2, 48, true, 'DIR66', '{}'::jsonb FROM public.unidad_organizacional sub JOIN public.unidad_organizacional s ON s.id = sub.parent_id WHERE s.codigo = 'SEC11' AND sub.nombre = 'Subsecretaría de Obras Públicas' AND NOT EXISTS (SELECT 1 FROM public.unidad_organizacional WHERE codigo = 'DIR66');

UPDATE public.unidad_organizacional SET responsable_nombre = 'Ing. Claudio Bravo' WHERE codigo = 'SEC11';

UPDATE public.unidad_organizacional u SET responsable_nombre = 'Ing. Leonardo Miguez' FROM public.unidad_organizacional s WHERE s.id = u.parent_id AND s.codigo = 'SEC11' AND u.nombre = 'Subsecretaría de Obras Públicas';

UPDATE public.unidad_organizacional SET responsable_nombre = 'Ing. Darío Vera Antonelli' WHERE codigo = 'DIR64';

UPDATE public.unidad_organizacional SET responsable_nombre = 'Ing. Sergio Gao' WHERE codigo = 'DIR65';

UPDATE public.unidad_organizacional SET responsable_nombre = 'Arq. C. Zarrabeitia' WHERE codigo = 'DIR66';

NOTIFY pgrst, 'reload schema';

-- Para revertir:
--   DELETE FROM public.unidad_organizacional WHERE codigo = 'DIR66';
--   UPDATE public.unidad_organizacional SET responsable_nombre = NULL WHERE codigo IN ('SEC11', 'DIR64', 'DIR65') OR nombre = 'Subsecretaría de Obras Públicas';
-- ============================================================

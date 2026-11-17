-- ============================================================
-- MIGRACION 065: completar las secretarias con el organigrama de noviembre (17/11/2026)
-- ============================================================
-- Fuente: "Organigrama Sec. SMT - Sheet1.pdf". Pedido: "utiliza esta info
-- para completar las secretarias incompletas".
--
-- OJO CON LOS CODIGOS: el PDF numera distinto que PlanIA (en el PDF SEC11 es
-- Servicios Publicos y DIR64 Planificacion Urbanistica; en PlanIA SEC11 es
-- Obras Publicas y DIR64 Obras Viales). Todo se cruzo POR NOMBRE contra el
-- organigrama de PlanIA del 17.11. Lo nuevo lleva el primer codigo libre de
-- PlanIA: SEC12 y SEC13, DIR67 a DIR86.
--
-- 1. SECRETARIAS QUE FALTABAN
--      SEC12  Secretaria de Economia y Hacienda       Cr. Sebastian Ruiz Toscano
--             └── Subsecretaria de Economia y Hacienda  Cra. Nora Liz Rabini
--                 ├── DIR74 Direccion de Despacho
--                 ├── DIR75 Tesoreria General
--                 ├── DIR76 Direccion de Planeamiento y Presupuesto
--                 └── DIR77 Direccion General de Compras y Contrataciones
--      SEC13  Fiscalia Municipal                       Dr. Conrado Mosqueira
--             └── Fiscalia Adjunta                     Dr. Sergio Cipriani
--                 ├── DIR81 Direccion de Despacho
--                 ├── DIR82 Direccion de Control Judicial
--                 └── DIR83 Direccion de Control de Asesoramiento
--    La "Contaduria General" que el PDF pone bajo Economia y Hacienda NO se
--    crea: ya existe como SEC05, con el mismo responsable.
--    "Asesorameinto" en el PDF: se corrige a "Asesoramiento".
--
-- 2. SUBSECRETARIAS QUE FALTABAN. Las direcciones que ya estaban colgando
--    directo de la secretaria pasan a la subsecretaria nueva (solo si siguen
--    ahi: si alguien ya las movio, no se tocan). Como en 059, mover una
--    direccion no toca sus proyectos ni sus usuarios, y la secretaria la sigue
--    viendo porque queda debajo.
--      SEC04 Ingresos      Subsec. de Ingresos Municipales      <- DIR38, DIR39
--                          Subsec. de Planificacion Financiera  <- DIR40, DIR63
--      SEC06 Atencion Ciudadana
--                          Subsec. de Desarrollo Social y Programas Sociales
--                                                               <- DIR41, DIR42, DIR43
--      SEC07 Ambiente      Subsec. de Gestion Integral de Residuos <- DIR44, DIR45, DIR46
--      SEC11 Obras Publicas
--                          Subsec. de Planificacion Urbana      + DIR79 Planificacion
--                                                                 Urbanistica, DIR80
--                                                                 Catastro y Edificacion
--
-- 3. DIRECCIONES QUE FALTABAN
--      Gobierno            DIR68 Patrulla de Proteccion Ciudadana (Seguridad Ciudadana)
--                          DIR69 Direccion de Operativa de Moviles (Subsec. Gobierno)
--    y la Direccion de Despacho de cada secretaria que no la tenia:
--      DIR67 Sec. General (en el PDF, bajo Prensa), DIR70 Gobierno (bajo
--      Subsec. Gobierno), DIR71 Innovacion, DIR72 Ingresos, DIR73 Ambiente,
--      DIR78 Obras Publicas, DIR84 Servicios Publicos (bajo la subsecretaria),
--      DIR85 Movilidad Urbana, DIR86 Ordenamiento y Convivencia.
--    Llevan nombre_corto "Despacho · <secretaria>" para que no salgan once
--    "Direccion de Despacho" iguales en las listas.
--    DIR43 (Despacho de Atencion Ciudadana) ya existia y esta INACTIVA: no se
--    reactiva, solo se mueve con las demas de su secretaria.
--
-- 4. RESPONSABLES. Solo se completan los que estan vacios; ninguno cargado se
--    pisa. Dos no coinciden con el PDF y quedan como estan, para confirmar:
--      DIR38 Ingresos Municipales: PlanIA "C.P.N. Julio Cesar Mazzioti",
--            PDF "C.P.N. Fabian Martinez".
--      DIR63 Credito Publico:      PlanIA "C.P.N. Fabian Martinez",
--            PDF "Dr. A. Juarez Ledesma" (como "Oficina de Credito Publico").
--
-- NO SE CARGAN las sub direcciones (Sub Direccion de Salud, de Despacho...):
-- PlanIA no las maneja como areas.
--
-- Formato para el editor SQL de Supabase: sin BEGIN/COMMIT; los INSERT de
-- direcciones y los UPDATE de responsables llevan su lista VALUES en varias
-- lineas, para que se pueda leer. Idempotente: se puede volver a correr.
--
-- DESPUES, para comprobar (tienen que salir SEC12, SEC13, las 7
-- subsecretarias nuevas y las 20 direcciones nuevas, cada una con su padre):
--   SELECT u.codigo, u.tipo, u.nombre, p.nombre AS padre, u.responsable_nombre FROM public.unidad_organizacional u LEFT JOIN public.unidad_organizacional p ON p.id = u.parent_id WHERE u.codigo IN ('SEC12','SEC13') OR u.codigo BETWEEN 'DIR67' AND 'DIR86' OR u.nombre IN ('Subsecretaría de Ingresos Municipales','Subsecretaría de Planificación Financiera','Subsecretaría de Desarrollo Social y Programas Sociales','Subsecretaría de Gestión Integral de Residuos','Subsecretaría de Economía y Hacienda','Subsecretaría de Planificación Urbana','Fiscalía Adjunta') ORDER BY u.tipo, u.codigo;
-- ============================================================

-- ------------------------------------------------------------
-- 1. Secretarias nuevas
-- ------------------------------------------------------------

INSERT INTO public.unidad_organizacional (parent_id, nombre, nombre_corto, tipo, nivel, orden, activa, codigo, responsable_nombre, metadata) SELECT NULL, 'Secretaría de Economía y Hacienda', 'Secretaría de Economía y Hacienda', 'secretaria', 0, 11, true, 'SEC12', 'Cr. Sebastián Ruiz Toscano', '{}'::jsonb WHERE NOT EXISTS (SELECT 1 FROM public.unidad_organizacional WHERE codigo = 'SEC12');

INSERT INTO public.unidad_organizacional (parent_id, nombre, nombre_corto, tipo, nivel, orden, activa, codigo, responsable_nombre, metadata) SELECT NULL, 'Fiscalía Municipal', 'Fiscalía Municipal', 'secretaria', 0, 12, true, 'SEC13', 'Dr. Conrado Mosqueira', '{}'::jsonb WHERE NOT EXISTS (SELECT 1 FROM public.unidad_organizacional WHERE codigo = 'SEC13');

-- ------------------------------------------------------------
-- 2. Subsecretarias nuevas (sin codigo, como las demas)
-- ------------------------------------------------------------

INSERT INTO public.unidad_organizacional (parent_id, nombre, nombre_corto, tipo, nivel, orden, activa, responsable_nombre, metadata) SELECT s.id, 'Subsecretaría de Ingresos Municipales', 'Subsecretaría de Ingresos Municipales', 'subsecretaria', 1, 1, true, NULL, '{}'::jsonb FROM public.unidad_organizacional s WHERE s.codigo = 'SEC04' AND NOT EXISTS (SELECT 1 FROM public.unidad_organizacional x WHERE x.parent_id = s.id AND x.nombre = 'Subsecretaría de Ingresos Municipales');

INSERT INTO public.unidad_organizacional (parent_id, nombre, nombre_corto, tipo, nivel, orden, activa, responsable_nombre, metadata) SELECT s.id, 'Subsecretaría de Planificación Financiera', 'Subsecretaría de Planificación Financiera', 'subsecretaria', 1, 2, true, NULL, '{}'::jsonb FROM public.unidad_organizacional s WHERE s.codigo = 'SEC04' AND NOT EXISTS (SELECT 1 FROM public.unidad_organizacional x WHERE x.parent_id = s.id AND x.nombre = 'Subsecretaría de Planificación Financiera');

INSERT INTO public.unidad_organizacional (parent_id, nombre, nombre_corto, tipo, nivel, orden, activa, responsable_nombre, metadata) SELECT s.id, 'Subsecretaría de Desarrollo Social y Programas Sociales', 'Subsecretaría de Desarrollo Social y Programas Sociales', 'subsecretaria', 1, 1, true, NULL, '{}'::jsonb FROM public.unidad_organizacional s WHERE s.codigo = 'SEC06' AND NOT EXISTS (SELECT 1 FROM public.unidad_organizacional x WHERE x.parent_id = s.id AND x.nombre = 'Subsecretaría de Desarrollo Social y Programas Sociales');

INSERT INTO public.unidad_organizacional (parent_id, nombre, nombre_corto, tipo, nivel, orden, activa, responsable_nombre, metadata) SELECT s.id, 'Subsecretaría de Gestión Integral de Residuos', 'Subsecretaría de Gestión Integral de Residuos', 'subsecretaria', 1, 1, true, NULL, '{}'::jsonb FROM public.unidad_organizacional s WHERE s.codigo = 'SEC07' AND NOT EXISTS (SELECT 1 FROM public.unidad_organizacional x WHERE x.parent_id = s.id AND x.nombre = 'Subsecretaría de Gestión Integral de Residuos');

INSERT INTO public.unidad_organizacional (parent_id, nombre, nombre_corto, tipo, nivel, orden, activa, responsable_nombre, metadata) SELECT s.id, 'Subsecretaría de Economía y Hacienda', 'Subsecretaría de Economía y Hacienda', 'subsecretaria', 1, 1, true, 'Cra. Nora Liz Rabini', '{}'::jsonb FROM public.unidad_organizacional s WHERE s.codigo = 'SEC12' AND NOT EXISTS (SELECT 1 FROM public.unidad_organizacional x WHERE x.parent_id = s.id AND x.nombre = 'Subsecretaría de Economía y Hacienda');

INSERT INTO public.unidad_organizacional (parent_id, nombre, nombre_corto, tipo, nivel, orden, activa, responsable_nombre, metadata) SELECT s.id, 'Subsecretaría de Planificación Urbana', 'Subsecretaría de Planificación Urbana', 'subsecretaria', 1, 2, true, 'Ing. Hebe Espinoza Rojas', '{}'::jsonb FROM public.unidad_organizacional s WHERE s.codigo = 'SEC11' AND NOT EXISTS (SELECT 1 FROM public.unidad_organizacional x WHERE x.parent_id = s.id AND x.nombre = 'Subsecretaría de Planificación Urbana');

INSERT INTO public.unidad_organizacional (parent_id, nombre, nombre_corto, tipo, nivel, orden, activa, responsable_nombre, metadata) SELECT s.id, 'Fiscalía Adjunta', 'Fiscalía Adjunta', 'subsecretaria', 1, 1, true, 'Dr. Sergio Cipriani', '{}'::jsonb FROM public.unidad_organizacional s WHERE s.codigo = 'SEC13' AND NOT EXISTS (SELECT 1 FROM public.unidad_organizacional x WHERE x.parent_id = s.id AND x.nombre = 'Fiscalía Adjunta');

-- Las direcciones que ya estaban, a su subsecretaria nueva (solo si siguen colgando directo de la secretaria).

UPDATE public.unidad_organizacional d SET parent_id = sub.id FROM public.unidad_organizacional sub JOIN public.unidad_organizacional s ON s.id = sub.parent_id WHERE d.codigo IN ('DIR38', 'DIR39') AND s.codigo = 'SEC04' AND sub.nombre = 'Subsecretaría de Ingresos Municipales' AND d.parent_id = s.id;

UPDATE public.unidad_organizacional d SET parent_id = sub.id FROM public.unidad_organizacional sub JOIN public.unidad_organizacional s ON s.id = sub.parent_id WHERE d.codigo IN ('DIR40', 'DIR63') AND s.codigo = 'SEC04' AND sub.nombre = 'Subsecretaría de Planificación Financiera' AND d.parent_id = s.id;

UPDATE public.unidad_organizacional d SET parent_id = sub.id FROM public.unidad_organizacional sub JOIN public.unidad_organizacional s ON s.id = sub.parent_id WHERE d.codigo IN ('DIR41', 'DIR42', 'DIR43') AND s.codigo = 'SEC06' AND sub.nombre = 'Subsecretaría de Desarrollo Social y Programas Sociales' AND d.parent_id = s.id;

UPDATE public.unidad_organizacional d SET parent_id = sub.id FROM public.unidad_organizacional sub JOIN public.unidad_organizacional s ON s.id = sub.parent_id WHERE d.codigo IN ('DIR44', 'DIR45', 'DIR46') AND s.codigo = 'SEC07' AND sub.nombre = 'Subsecretaría de Gestión Integral de Residuos' AND d.parent_id = s.id;

-- ------------------------------------------------------------
-- 3. Direcciones nuevas
-- ------------------------------------------------------------

-- Bajo una subsecretaria: (codigo de la secretaria, nombre exacto de la subsecretaria en PlanIA).

INSERT INTO public.unidad_organizacional (parent_id, nombre, nombre_corto, tipo, nivel, orden, activa, codigo, responsable_nombre, metadata) SELECT sub.id, v.nombre, v.corto, 'direccion', 2, 47 + v.n, true, v.codigo, v.responsable, '{}'::jsonb FROM (VALUES
  (1,  'DIR67', 'SEC01', 'Subsecretaria de Prensa y Comunicacion Institucional', 'Dirección de Despacho', 'Despacho · Secretaría General', 'Dr. P. Pérez Ledesma'),
  (2,  'DIR68', 'SEC02', 'Subsecretaría de Seguridad Ciudadana', 'Patrulla de Protección Ciudadana', 'Patrulla de Protección Ciudadana', 'Cr. Rolando Gomez'),
  (3,  'DIR69', 'SEC02', 'Subsecretaría de Gobierno', 'Dirección de Operativa de Móviles', 'Dirección de Operativa de Móviles', NULL),
  (4,  'DIR70', 'SEC02', 'Subsecretaría de Gobierno', 'Dirección de Despacho', 'Despacho · Gobierno', 'Dra. F. López Roig'),
  (8,  'DIR74', 'SEC12', 'Subsecretaría de Economía y Hacienda', 'Dirección de Despacho', 'Despacho · Economía y Hacienda', 'Dr. Esteban Buriek'),
  (9,  'DIR75', 'SEC12', 'Subsecretaría de Economía y Hacienda', 'Tesorería General', 'Tesorería General', 'Cra. Silvina Usandivaras'),
  (10, 'DIR76', 'SEC12', 'Subsecretaría de Economía y Hacienda', 'Dirección de Planeamiento y Presupuesto', 'Dirección de Planeamiento y Presupuesto', 'Cra. M. del Pilar Varela'),
  (11, 'DIR77', 'SEC12', 'Subsecretaría de Economía y Hacienda', 'Dirección General de Compras y Contrataciones', 'Dirección General de Compras y Contrataciones', 'Cra. Silvia Otero'),
  (13, 'DIR79', 'SEC11', 'Subsecretaría de Planificación Urbana', 'Dirección de Planificación Urbanística', 'Dirección de Planificación Urbanística', 'María Guadalupe Rearte'),
  (14, 'DIR80', 'SEC11', 'Subsecretaría de Planificación Urbana', 'Dirección de Catastro y Edificación', 'Dirección de Catastro y Edificación', 'Arq. Nora Elvira Belloni'),
  (15, 'DIR81', 'SEC13', 'Fiscalía Adjunta', 'Dirección de Despacho', 'Despacho · Fiscalía Municipal', 'Dra. J. Van Gelderen'),
  (16, 'DIR82', 'SEC13', 'Fiscalía Adjunta', 'Dirección de Control Judicial', 'Dirección de Control Judicial', NULL),
  (17, 'DIR83', 'SEC13', 'Fiscalía Adjunta', 'Dirección de Control de Asesoramiento', 'Dirección de Control de Asesoramiento', NULL),
  (18, 'DIR84', 'SEC08', 'Subsecretaria de Servicios Publicos', 'Dirección de Despacho', 'Despacho · Servicios Públicos', 'Dra. Mercedes Koch')
) AS v(n, codigo, secretaria, subsecretaria, nombre, corto, responsable) JOIN public.unidad_organizacional s ON s.codigo = v.secretaria JOIN public.unidad_organizacional sub ON sub.parent_id = s.id AND sub.nombre = v.subsecretaria WHERE NOT EXISTS (SELECT 1 FROM public.unidad_organizacional x WHERE x.codigo = v.codigo);

-- Colgando directo de la secretaria.

INSERT INTO public.unidad_organizacional (parent_id, nombre, nombre_corto, tipo, nivel, orden, activa, codigo, responsable_nombre, metadata) SELECT s.id, v.nombre, v.corto, 'direccion', 2, 47 + v.n, true, v.codigo, v.responsable, '{}'::jsonb FROM (VALUES
  (5,  'DIR71', 'SEC03', 'Dirección de Despacho', 'Despacho · Innovación Tecnológica', 'CPN. F. Borsotto'),
  (6,  'DIR72', 'SEC04', 'Dirección de Despacho', 'Despacho · Ingresos Municipales', 'Dr. Gonzalo de León'),
  (7,  'DIR73', 'SEC07', 'Dirección de Despacho', 'Despacho · Ambiente', 'Dra. Aguilar Bianchi'),
  (12, 'DIR78', 'SEC11', 'Dirección de Despacho', 'Despacho · Obras Públicas', 'Dra. Luisa Intile'),
  (19, 'DIR85', 'SEC10', 'Dirección de Despacho', 'Despacho · Movilidad Urbana', 'Dr. Raúl González Iturbe'),
  (20, 'DIR86', 'SEC09', 'Dirección de Despacho', 'Despacho · Ordenamiento y Convivencia', 'Dr. Pedro D. Arréguez')
) AS v(n, codigo, secretaria, nombre, corto, responsable) JOIN public.unidad_organizacional s ON s.codigo = v.secretaria WHERE NOT EXISTS (SELECT 1 FROM public.unidad_organizacional x WHERE x.codigo = v.codigo);

-- ------------------------------------------------------------
-- 4. Responsables vacios (no se pisa ninguno cargado)
-- ------------------------------------------------------------

UPDATE public.unidad_organizacional u SET responsable_nombre = v.responsable FROM (VALUES
  ('SEC01', 'Dr. Rodrigo Gomez Tortosa'),
  ('SEC02', 'Mg. Camila Giuliano'),
  ('SEC03', 'Ing. Omar Abraham'),
  ('SEC04', 'Cr. María Fernanda Herrera'),
  ('SEC05', 'C.P.N. Marcelo Edmundo Albaca Petersen'),
  ('SEC06', 'Dra. María Sofía Prado Budeguer'),
  ('SEC07', 'Ing. Julieta Migliavacca'),
  ('SEC08', 'Sr. Tulio Chincarini'),
  ('SEC09', 'Dr. Javier Eduardo González'),
  ('SEC10', 'Sr. Carlos Roberto Arnedo'),
  ('DIR41', 'Lic. Bruno Medina'),
  ('DIR60', 'Dr. Matías T. Balardini')
) AS v(codigo, responsable) WHERE u.codigo = v.codigo AND u.responsable_nombre IS NULL;

UPDATE public.unidad_organizacional u SET responsable_nombre = v.responsable FROM (VALUES
  ('SEC01', 'Subsecretaria de Desarrollo Humano', 'Dra. Graciela Alejandra Trejo'),
  ('SEC01', 'Subsecretaria de Gestion Estrategica y Documentacion', 'Mg. Lic. Humberto Ponce de León'),
  ('SEC01', 'Subsecretaría de Cultura', 'Sra. Ana Lía Carbonell'),
  ('SEC01', 'Subsecretaria de Prensa y Comunicacion Institucional', 'Lic. Pablo Fernando Haro Rodríguez'),
  ('SEC02', 'Subsecretaría de Seguridad Ciudadana', 'Sr. Rubén Darío Fernández'),
  ('SEC08', 'Subsecretaria de Servicios Publicos', 'Dra. Lorena Málaga')
) AS v(secretaria, subsecretaria, responsable) JOIN public.unidad_organizacional s ON s.codigo = v.secretaria WHERE u.parent_id = s.id AND u.nombre = v.subsecretaria AND u.tipo = 'subsecretaria' AND u.responsable_nombre IS NULL;

NOTIFY pgrst, 'reload schema';

-- Para revertir:
--   UPDATE public.unidad_organizacional d SET parent_id = s.id FROM public.unidad_organizacional s WHERE s.codigo = 'SEC04' AND d.codigo IN ('DIR38','DIR39','DIR40','DIR63');
--   UPDATE public.unidad_organizacional d SET parent_id = s.id FROM public.unidad_organizacional s WHERE s.codigo = 'SEC06' AND d.codigo IN ('DIR41','DIR42','DIR43');
--   UPDATE public.unidad_organizacional d SET parent_id = s.id FROM public.unidad_organizacional s WHERE s.codigo = 'SEC07' AND d.codigo IN ('DIR44','DIR45','DIR46');
--   DELETE FROM public.unidad_organizacional WHERE codigo BETWEEN 'DIR67' AND 'DIR86';
--   DELETE FROM public.unidad_organizacional WHERE tipo = 'subsecretaria' AND nombre IN ('Subsecretaría de Ingresos Municipales','Subsecretaría de Planificación Financiera','Subsecretaría de Desarrollo Social y Programas Sociales','Subsecretaría de Gestión Integral de Residuos','Subsecretaría de Economía y Hacienda','Subsecretaría de Planificación Urbana','Fiscalía Adjunta');
--   DELETE FROM public.unidad_organizacional WHERE codigo IN ('SEC12','SEC13');
--   (los responsables completados no se revierten: estaban vacios)

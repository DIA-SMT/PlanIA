-- ============================================================
-- 066 — Un usuario con más de un área a cargo — corrección del 27.11
-- ============================================================
--
-- "El director del COMM tiene dos direcciones a cargo, el COMM y la PPC, y no
-- estoy pudiendo asignarle dos direcciones: el sistema no me deja ya que es el
-- mismo mail."
--
-- Cada persona tiene UN perfil (perfil_usuario, clave user_id, email único) y
-- ese perfil tenía UNA unidad. Ahora suma `unidades_extra`: otras áreas a su
-- cargo, con el mismo rol y el mismo criterio que la principal (la propia y lo
-- que cuelga de ella). La principal sigue siendo `unidad_id`: es la que manda
-- en lo que es de una sola área (el circuito de envío de la POA 2027, el
-- informe por mail).
--
-- Se recrean las cuatro funciones de permisos con la misma regla de antes,
-- recorriendo la unidad principal Y las adicionales:
--   usuario_puede_cargar_unidad            (051)
--   usuario_puede_ver_unidad               (042)
--   usuario_puede_validar_unidad           (010)
--   usuario_puede_gestionar_agenda_unidad  (042)
--
-- `array_prepend(p.unidad_id, p.unidades_extra)` da siempre al menos una fila
-- (con NULL si el perfil no tiene unidad, como Planificación), así que los
-- roles globales siguen pasando igual que antes.
--
-- Es idempotente. Correrla en el editor SQL de Supabase antes de publicar.
-- ============================================================

ALTER TABLE public.perfil_usuario ADD COLUMN IF NOT EXISTS unidades_extra uuid[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.perfil_usuario.unidades_extra IS 'Otras áreas a cargo además de unidad_id (27.11): mismo rol y mismo alcance que la principal.';

CREATE OR REPLACE FUNCTION public.usuario_puede_cargar_unidad(p_unidad_id uuid)
  RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.perfil_usuario p
    CROSS JOIN LATERAL unnest(array_prepend(p.unidad_id, p.unidades_extra)) AS mia(unidad_id)
    WHERE p.user_id = auth.uid()
      AND p.activo = true
      AND (
        p.rol = 'admin_funcional'
        OR (
          p.rol IN ('director', 'secretario', 'subsecretario', 'coordinador')
          AND p_unidad_id IN (SELECT id FROM public.unidades_descendientes(mia.unidad_id))
        )
      )
  );
$$ LANGUAGE SQL STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.usuario_puede_ver_unidad(p_unidad_id uuid)
  RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.perfil_usuario p
    CROSS JOIN LATERAL unnest(array_prepend(p.unidad_id, p.unidades_extra)) AS mia(unidad_id)
    WHERE p.user_id = auth.uid()
      AND p.activo = true
      AND (
        p.rol IN ('intendenta', 'admin_funcional', 'admin_tecnico')
        OR p.acceso_global = true
        OR mia.unidad_id = p_unidad_id
        OR mia.unidad_id IN (SELECT id FROM public.unidades_ancestras(p_unidad_id))
        OR p_unidad_id IN (SELECT id FROM public.unidades_descendientes(mia.unidad_id))
        OR (
          p.rol = 'director'
          AND p_unidad_id IN (SELECT id FROM public.unidades_ancestras(mia.unidad_id))
        )
      )
  );
$$ LANGUAGE SQL STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.usuario_puede_validar_unidad(p_unidad_id uuid)
  RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.perfil_usuario p
    CROSS JOIN LATERAL unnest(array_prepend(p.unidad_id, p.unidades_extra)) AS mia(unidad_id)
    WHERE p.user_id = auth.uid()
      AND p.activo = true
      AND (
        p.rol = 'admin_funcional'
        OR (
          p.rol = 'subsecretario'
          AND p_unidad_id IN (SELECT id FROM public.unidades_descendientes(mia.unidad_id))
        )
      )
  );
$$ LANGUAGE SQL STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.usuario_puede_gestionar_agenda_unidad(p_unidad_id uuid)
  RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.perfil_usuario p
    CROSS JOIN LATERAL unnest(array_prepend(p.unidad_id, p.unidades_extra)) AS mia(unidad_id)
    WHERE p.user_id = auth.uid()
      AND p.activo = true
      AND (
        p.rol = 'admin_funcional'
        OR (p.rol = 'director' AND mia.unidad_id = p_unidad_id)
        OR (
          p.rol IN ('secretario', 'subsecretario', 'coordinador')
          AND p_unidad_id IN (SELECT id FROM public.unidades_descendientes(mia.unidad_id))
        )
      )
  );
$$ LANGUAGE SQL STABLE SECURITY DEFINER;

NOTIFY pgrst, 'reload schema';

-- Para revertir:
--   1) Volver a aplicar las definiciones anteriores de las cuatro funciones:
--      usuario_puede_cargar_unidad de la 051, usuario_puede_ver_unidad y
--      usuario_puede_gestionar_agenda_unidad de la 042, y
--      usuario_puede_validar_unidad de la 010.
--   2) ALTER TABLE public.perfil_usuario DROP COLUMN IF EXISTS unidades_extra;

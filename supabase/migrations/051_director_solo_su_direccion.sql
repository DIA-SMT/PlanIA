-- ============================================================
-- MIGRACION 051: el director carga solo en su direccion (17/09/2026)
-- ============================================================
-- 17.09: "los directores solo pueden trabajar y cargar los datos de su
-- direccion. Al estar vinculados jerarquicamente, los datos de la direccion
-- impacta en los avances de las subsecretarias y secretarias".
--
-- Esto DA MARCHA ATRAS con la 042, que el 26.08 le habia sumado al director la
-- cadena de unidades por encima de la suya. Aquel pedido (pagina 38) era "crear
-- la posibilidad de cargar proyectos directamente en la Secretaria de
-- Innovacion Tecnologica", y se resolvio ampliando el permiso del director. El
-- 17.09 pidieron lo contrario y con la regla general, asi que gana esta.
--
-- Lo segundo que dicen ya funciona asi y no hay que tocar nada: el avance de la
-- direccion sube por la jerarquia hasta la subsecretaria y la secretaria. Eso
-- es el calculo del semaforo, que no mira permisos.
--
-- QUE PASA CON LOS PROYECTOS QUE HOY CUELGAN DE UNA SECRETARIA.
-- Son 29: Ambiente 19, Contaduria 9 y Secretaria General 1. Se verifico que
-- NINGUNO queda sin quien lo edite: las tres tienen secretario cargado, y
-- Ambiente ademas tres coordinadores. Total de proyectos que quedarian sin
-- nadie que pueda editarlos: 0 de 454.
--
-- Con esto los cuatro roles no administradores quedan con la misma regla —su
-- unidad y lo que cuelga de ella— y la unica diferencia entre un director y un
-- secretario pasa a ser de donde cuelgan, que es lo que se pidio.
--
-- Los departamentos siguen adentro: los cuatro museos cuelgan de la Direccion
-- de Museos y son parte de su direccion. `unidades_descendientes` incluye la
-- propia unidad.
--
-- La agenda no se toca: ya tenia su propia funcion desde la 042 y su criterio
-- era justamente este.
--
-- Idempotente: se puede volver a correr sin efecto.
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.usuario_puede_cargar_unidad(p_unidad_id uuid)
  RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.perfil_usuario p
    WHERE p.user_id = auth.uid()
      AND p.activo = true
      AND (
        p.rol = 'admin_funcional'
        OR (
          p.rol IN ('director', 'secretario', 'subsecretario', 'coordinador')
          AND p_unidad_id IN (SELECT id FROM public.unidades_descendientes(p.unidad_id))
        )
      )
  );
$$ LANGUAGE SQL STABLE SECURITY DEFINER;

COMMENT ON FUNCTION public.usuario_puede_cargar_unidad(uuid) IS
  'Puede cargar POA (proyectos, metas, indicadores, avances) sobre la unidad: la propia y las que cuelgan de ella. Desde la 051 vale igual para director, secretario, subsecretario y coordinador — el director dejo de alcanzar a sus ancestros (17.09). NO aplica a la agenda semanal: eso lo resuelve usuario_puede_gestionar_agenda_unidad.';

COMMIT;

-- Para revertir, o sea volver al criterio del 26.08:
--   BEGIN;
--   -- volver a aplicar la 042_director_carga_en_su_secretaria.sql
--   COMMIT;

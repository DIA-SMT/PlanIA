"use server";

/**
 * Acciones del Plan Rector (31.08): imputar proyectos del POA a la jerarquía
 * estratégica.
 *
 * Va en su propio módulo y no en `actions.ts` porque ese archivo ya pasó las
 * 1500 líneas y esto es un subsistema nuevo y autocontenido.
 *
 * El vínculo nace "propuesto" y solo admin_funcional lo confirma. Eso no es
 * burocracia: el Excel del cliente llegó con la columna "Programas vinculados"
 * vacía, así que el mapeo no es un dato importado sino una decisión que alguien
 * toma. Tiene que quedar firmada y poder revisarse.
 *
 * La RLS de la migración 044 es la que manda. Estas funciones chequean lo mismo
 * antes para poder devolver un mensaje entendible en vez de un error de Postgres.
 */
import { revalidatePath } from "next/cache";
import { getSupabaseServer } from "./supabase/server";
import { getPerfilActual } from "./auth";

type Resultado = { success: boolean; error?: string };

/** Deja constancia en el historial. Nunca tira: si falla, no bloquea la acción. */
async function registrarHistorial(
  proyectoId: string,
  nodoId: string | null,
  accion: string,
  estadoResultante: "propuesto" | "confirmado" | "rechazado" | null,
  principalResultante: boolean | null,
  observacion?: string | null
) {
  try {
    const sb = await getSupabaseServer();
    const perfil = await getPerfilActual();
    await sb.from("plan_rector_vinculo_historial").insert({
      proyecto_id: proyectoId,
      nodo_id: nodoId,
      accion,
      estado_resultante: estadoResultante,
      principal_resultante: principalResultante,
      observacion: observacion ?? null,
      registrado_por: perfil?.user_id ?? null,
      registrado_por_email: perfil?.email ?? null,
      registrado_por_nombre: perfil?.nombre ?? null,
    });
  } catch {
    // El historial es deseable, no bloqueante.
  }
}

function revalidar(proyectoId: string) {
  revalidatePath("/plan-rector");
  revalidatePath(`/proyectos/${proyectoId}`);
}

/**
 * Propone imputar un proyecto a un nodo del Plan Rector.
 * Puede hacerlo cualquiera que pueda cargar el POA de la unidad del proyecto.
 */
export async function proponerImputacion(input: {
  proyecto_id: string;
  nodo_id: string;
  justificacion?: string | null;
}): Promise<Resultado> {
  const perfil = await getPerfilActual();
  if (!perfil) return { success: false, error: "No autenticado" };
  if (!input.nodo_id) {
    return { success: false, error: "Elegí un eje, objetivo o línea del Plan Rector" };
  }

  const sb = await getSupabaseServer();

  const { data: nodo } = await sb
    .from("plan_rector_nodo")
    .select("tipo, activa")
    .eq("id", input.nodo_id)
    .maybeSingle();
  if (!nodo) return { success: false, error: "Ese nodo del Plan Rector no existe" };

  const n = nodo as { tipo: string; activa: boolean };
  if (!n.activa) return { success: false, error: "Ese nodo está dado de baja" };
  // El nivel 0 no es imputable: el ámbito se deriva subiendo el árbol, así no
  // hay dos formas de decir lo mismo. La base también lo rechaza.
  if (n.tipo === "area_intervencion") {
    return {
      success: false,
      error: "El proyecto se imputa a un eje, objetivo o línea. El ámbito se deduce solo.",
    };
  }

  const { error } = await sb.from("proyecto_plan_rector").insert({
    proyecto_id: input.proyecto_id,
    nodo_id: input.nodo_id,
    estado: "propuesto",
    principal: false,
    origen: "carga_manual",
    justificacion: input.justificacion?.trim() || null,
    creado_por: perfil.user_id,
  });

  if (error) {
    if (error.code === "23505" || /uq_ppr_par|duplicate key/i.test(error.message)) {
      return { success: false, error: "Ese proyecto ya está propuesto para ese nodo" };
    }
    if (error.code === "42501") {
      return { success: false, error: "No tenés permiso para imputar proyectos de esa unidad" };
    }
    return { success: false, error: error.message };
  }

  await registrarHistorial(
    input.proyecto_id, input.nodo_id, "propuesta", "propuesto", false, input.justificacion
  );
  revalidar(input.proyecto_id);
  return { success: true };
}

/**
 * Confirma una imputación propuesta. Solo admin_funcional.
 *
 * `principal` marca el vínculo que cuenta para los totales: sin eso, un proyecto
 * imputado a tres ejes se contaría tres veces y el total del ámbito quedaría
 * inflado.
 */
export async function confirmarImputacion(input: {
  vinculo_id: string;
  principal: boolean;
}): Promise<Resultado> {
  const perfil = await getPerfilActual();
  if (!perfil) return { success: false, error: "No autenticado" };
  if (perfil.rol !== "admin_funcional") {
    return { success: false, error: "Solo Planificación Estratégica confirma imputaciones" };
  }

  const sb = await getSupabaseServer();
  const { data } = await sb
    .from("proyecto_plan_rector")
    .select("proyecto_id, nodo_id")
    .eq("id", input.vinculo_id)
    .maybeSingle();
  if (!data) return { success: false, error: "Esa imputación no existe" };
  const vinculo = data as { proyecto_id: string; nodo_id: string };

  // Un solo principal por proyecto: se baja el anterior antes de subir el nuevo.
  // El índice único `uq_ppr_principal` lo garantiza igual; esto es para que el
  // usuario no vea un error de constraint.
  if (input.principal) {
    await sb
      .from("proyecto_plan_rector")
      .update({ principal: false })
      .eq("proyecto_id", vinculo.proyecto_id)
      .eq("principal", true);
  }

  const { error } = await sb
    .from("proyecto_plan_rector")
    .update({
      estado: "confirmado",
      principal: input.principal,
      confirmado_por: perfil.user_id,
      confirmado_at: new Date().toISOString(),
    })
    .eq("id", input.vinculo_id);
  if (error) return { success: false, error: error.message };

  await registrarHistorial(
    vinculo.proyecto_id, vinculo.nodo_id, "confirmacion", "confirmado", input.principal
  );
  revalidar(vinculo.proyecto_id);
  return { success: true };
}

/**
 * Confirma varias propuestas de una. Solo admin_funcional.
 *
 * 11.09, pedido de Planificación: "faltaría asociar los proyectos a los ejes del
 * plan rector; los que se pueda, el resto lo hacemos a mano". Son 441 proyectos:
 * confirmar de a uno desde la ficha de cada uno son 441 pantallas, y eso no lo
 * hace nadie. Con esto, un eje entero se confirma de un click.
 *
 * Todas se marcan como principal: un proyecto sin imputación previa no tiene con
 * qué competir, y esta pantalla solo ofrece los que no tienen ninguna confirmada.
 * Si alguno llegara a tener otra, `uq_ppr_principal` lo rechaza y esa fila vuelve
 * en `fallidos` en vez de romper el lote entero — el resto se confirma igual.
 */
export async function confirmarImputacionesEnLote(input: {
  vinculo_ids: string[];
}): Promise<{ success: boolean; confirmados: number; fallidos: string[]; error?: string }> {
  const perfil = await getPerfilActual();
  if (!perfil) return { success: false, confirmados: 0, fallidos: [], error: "No autenticado" };
  if (perfil.rol !== "admin_funcional") {
    return {
      success: false,
      confirmados: 0,
      fallidos: [],
      error: "Solo Planificación Estratégica confirma imputaciones",
    };
  }

  const ids = [...new Set(input.vinculo_ids)].filter(Boolean);
  if (ids.length === 0) {
    return { success: false, confirmados: 0, fallidos: [], error: "No llegó ninguna imputación" };
  }
  // Tope por llamada: 441 de una sola vez es una transacción larga y un botón
  // que parece colgado. La pantalla manda de a un eje.
  if (ids.length > 200) {
    return {
      success: false,
      confirmados: 0,
      fallidos: [],
      error: "Son demasiadas de una vez: confirmá por eje.",
    };
  }

  const sb = await getSupabaseServer();
  const { data, error: eLectura } = await sb
    .from("proyecto_plan_rector")
    .select("id, proyecto_id, nodo_id, estado")
    .in("id", ids);
  if (eLectura) return { success: false, confirmados: 0, fallidos: [], error: eLectura.message };

  const filas = (data ?? []) as { id: string; proyecto_id: string; nodo_id: string; estado: string }[];
  const pendientes = filas.filter((f) => f.estado === "propuesto");

  const ahora = new Date().toISOString();
  const fallidos: string[] = [];
  let confirmados = 0;

  for (const f of pendientes) {
    const { error } = await sb
      .from("proyecto_plan_rector")
      .update({
        estado: "confirmado",
        principal: true,
        confirmado_por: perfil.user_id,
        confirmado_at: ahora,
      })
      .eq("id", f.id)
      .eq("estado", "propuesto"); // si otro la tocó mientras tanto, no se pisa
    if (error) {
      fallidos.push(f.id);
      continue;
    }
    confirmados++;
    await registrarHistorial(f.proyecto_id, f.nodo_id, "confirmacion", "confirmado", true);
    revalidar(f.proyecto_id);
  }

  revalidatePath("/plan-rector");
  revalidatePath("/plan-rector/imputar");
  return { success: true, confirmados, fallidos };
}

/** Rechaza una propuesta, con motivo obligatorio. Solo admin_funcional. */
export async function rechazarImputacion(input: {
  vinculo_id: string;
  motivo: string;
}): Promise<Resultado> {
  const perfil = await getPerfilActual();
  if (!perfil) return { success: false, error: "No autenticado" };
  if (perfil.rol !== "admin_funcional") {
    return { success: false, error: "Solo Planificación Estratégica rechaza imputaciones" };
  }
  if (!input.motivo?.trim()) return { success: false, error: "El motivo es obligatorio" };

  const sb = await getSupabaseServer();
  const { data } = await sb
    .from("proyecto_plan_rector")
    .select("proyecto_id, nodo_id")
    .eq("id", input.vinculo_id)
    .maybeSingle();
  if (!data) return { success: false, error: "Esa imputación no existe" };
  const vinculo = data as { proyecto_id: string; nodo_id: string };

  const { error } = await sb
    .from("proyecto_plan_rector")
    .update({
      estado: "rechazado",
      principal: false,
      justificacion: input.motivo.trim(),
      confirmado_por: perfil.user_id,
      confirmado_at: new Date().toISOString(),
    })
    .eq("id", input.vinculo_id);
  if (error) return { success: false, error: error.message };

  await registrarHistorial(
    vinculo.proyecto_id, vinculo.nodo_id, "rechazo", "rechazado", false, input.motivo.trim()
  );
  revalidar(vinculo.proyecto_id);
  return { success: true };
}

/** Retira una propuesta propia todavía sin confirmar (o cualquiera, si es admin). */
export async function quitarImputacion(input: { vinculo_id: string }): Promise<Resultado> {
  const perfil = await getPerfilActual();
  if (!perfil) return { success: false, error: "No autenticado" };

  const sb = await getSupabaseServer();
  const { data } = await sb
    .from("proyecto_plan_rector")
    .select("proyecto_id, nodo_id, estado, creado_por")
    .eq("id", input.vinculo_id)
    .maybeSingle();
  if (!data) return { success: false, error: "Esa imputación no existe" };
  const vinculo = data as {
    proyecto_id: string; nodo_id: string; estado: string; creado_por: string | null;
  };

  if (
    perfil.rol !== "admin_funcional" &&
    (vinculo.estado !== "propuesto" || vinculo.creado_por !== perfil.user_id)
  ) {
    return { success: false, error: "Solo podés retirar tus propias propuestas sin confirmar" };
  }

  const { error } = await sb.from("proyecto_plan_rector").delete().eq("id", input.vinculo_id);
  if (error) return { success: false, error: error.message };

  await registrarHistorial(vinculo.proyecto_id, vinculo.nodo_id, "retiro", null, null);
  revalidar(vinculo.proyecto_id);
  return { success: true };
}

/**
 * Declara que un proyecto NO corresponde al Plan Rector, con motivo.
 * Solo admin_funcional: es una afirmación sobre el plan, no sobre el proyecto.
 *
 * Sin este estado no se distingue "falta clasificar" de "no corresponde", y son
 * entre 35 y 180 proyectos de los 441.
 */
export async function excluirDelPlanRector(input: {
  proyecto_id: string;
  motivo: string;
}): Promise<Resultado> {
  const perfil = await getPerfilActual();
  if (!perfil) return { success: false, error: "No autenticado" };
  if (perfil.rol !== "admin_funcional") {
    return { success: false, error: "Solo Planificación Estratégica declara proyectos fuera del plan" };
  }
  if (!input.motivo?.trim()) return { success: false, error: "El motivo es obligatorio" };

  const sb = await getSupabaseServer();
  const { error } = await sb.from("proyecto_pr_exclusion").upsert(
    {
      proyecto_id: input.proyecto_id,
      motivo: input.motivo.trim(),
      declarado_por: perfil.user_id,
    },
    { onConflict: "proyecto_id" }
  );
  if (error) return { success: false, error: error.message };

  await registrarHistorial(input.proyecto_id, null, "exclusion", null, null, input.motivo.trim());
  revalidar(input.proyecto_id);
  return { success: true };
}

/** Deshace la exclusión: el proyecto vuelve a estar pendiente de clasificar. */
export async function readmitirEnPlanRector(input: { proyecto_id: string }): Promise<Resultado> {
  const perfil = await getPerfilActual();
  if (!perfil) return { success: false, error: "No autenticado" };
  if (perfil.rol !== "admin_funcional") {
    return { success: false, error: "Solo Planificación Estratégica puede deshacerlo" };
  }

  const sb = await getSupabaseServer();
  const { error } = await sb
    .from("proyecto_pr_exclusion")
    .delete()
    .eq("proyecto_id", input.proyecto_id);
  if (error) return { success: false, error: error.message };

  await registrarHistorial(input.proyecto_id, null, "readmision", null, null);
  revalidar(input.proyecto_id);
  return { success: true };
}

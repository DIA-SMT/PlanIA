import { redirect } from "next/navigation";

/**
 * El documento vive en /poa-2027 desde el 28.09: "en esta pantalla me gustaría
 * que aparezca ya el pdf editable".
 *
 * La ruta queda redirigiendo y no se borra: está enlazada desde la pantalla
 * anterior, que alguien puede tener abierta o guardada.
 */
export default function ExportarRedirect() {
  redirect("/poa-2027");
}

# Correcciones 15.09

**Documento fuente:** `Modificaciones PLANIA (3).docx`, párrafos 794 a 1029
**Adjunto:** `Calendario HITOS .xlsx` (y el Google Sheets enlazado en el párrafo 801)
**Rama:** `lucas`

Son **11 pedidos**. Dos de ellos —los modelos de reporte— pesan más que los otros
nueve juntos.

---

## 1. Avance por Dirección, fuera del menú del director (párrafo 797)

> "Eliminar la herramienta AVANCE POR DIRECCIÓN del tablero de los usuarios de los
> directores. Esa herramienta solamente debe visualizarse para los usuarios
> Subsecretarios, Secretarios e Intendente."

Igual que se hizo con Plan Rector el 09.09: sale del menú **y** lleva control
propio en la página, porque esconder un link no es un permiso.

Ojo con una consecuencia: el 09.09 pidieron que el menú del director fuera
exactamente *Panel Ejecutivo, Proyectos, Avance por Dirección, Reportes, Agenda,
POA 2027*. Sacando esta queda en cinco. Es lo que piden ahora y es más nuevo, así
que manda esto.

## 2. Calendario de hitos en la agenda de todos (párrafos 799 a 803)

> "En ese link está el calendario de hitos. Necesitamos que las fechas que tienen,
> con sus actividades, se visualicen en la agenda de todos los usuarios, no importa
> el tipo de perfil que tengan."

El archivo tiene **49 hitos** en cinco hojas, una por mes de agosto a diciembre de
2026:

| | |
|---|---|
| Actividades | 25 |
| Eventos | 9 |
| Proyectos | 7 |
| Programas | 6 |
| Efemérides | 2 |
| De un solo día | 18 |
| Con rango de fechas | 31 |

**Esto no entra en la agenda actual.** `agenda_semana` es de una unidad y una
semana, y cada dirección carga la suya; los hitos son municipales, los ve todo el
mundo y muchos duran un mes. Meterlos como actividades de cada unidad sería
copiarlos 49 × 52 veces y que cualquiera los pueda borrar. Va una tabla propia de
calendario municipal que la pantalla de agenda muestra al lado de lo de cada área.

**Falta definir de dónde salen** (ver preguntas).

## 3 y 4. Los dos modelos nuevos de reporte (párrafos 804 a 1009)

> "Proponemos un nuevo modelo de reporte, ya que tenemos dos tipos de perfiles:
> secretarios/subsecretarios y directores. Cada tipo de perfil tendrá un modelo
> diferente de reporte con las características propias de cada área."

Son dos documentos completos, transcriptos en el Word con su estructura y sus
textos:

**Secretarías y Subsecretarías** — "Informe Ejecutivo de Seguimiento y Desempeño":
desempeño en el contexto municipal, estado general, indicadores clave, principales
resultados, aspectos de seguimiento para la conducción, detalle de proyectos, y
Anexo I metodológico.

**Direcciones** — "Informe de Seguimiento de Gestión": desempeño de la dirección,
estado de proyectos, seguimiento de metas e indicadores, detalle de proyectos con
sus metas y sus indicadores, principales resultados, aspectos a seguir, y Anexo I.

Reemplazan al informe actual, que es uno solo para los tres niveles.

**Lo que ya se calcula y se reusa:** el avance promedio (promedio simple de los
proyectos evaluables, que es exactamente lo que dice su Anexo), los cuatro estados
y sus definiciones, el detalle de proyectos y la comparación con el municipio.

**Lo que hay que calcular y hoy no existe:**

- *Cobertura de información* = proyectos con datos ÷ total. Es el complemento del
  "Sin Datos" que ya está.
- *Completitud de metas* y *Completitud de indicadores* = cuántos tienen
  información registrada sobre el total. Para el modelo de Direcciones, además, por
  proyecto (la columna "1/1", "3/3", "0/2" del detalle).
- *Diferencia en puntos porcentuales* contra el promedio municipal (secretarías) y
  contra la secretaría (direcciones).

**Lo que sigue trabado:** el "aporte al consolidado municipal" del punto 1. Su
propio Anexo lo dice: *"se determinará de acuerdo con la metodología de ponderación
institucional definida por la Dirección de Planificación Estratégica"*. Es la misma
definición que falta desde el 01.09 y sin ella ese párrafo no se puede llenar.

## 5. Los proyectos del Plan Rector, agrupados por área (párrafo 1011)

> "¿Podrían ordenar la columna de la derecha de manera tal que al mirar esté
> agrupado por área? Por ej. todos los de centros vecinales continuados, y del mismo
> modo las secretarías con sus sub y direcciones. Que no salte de la secretaría de
> ambiente a centros vecinales si por ejemplo también está la dirección de ambiente."

Hoy la lista de proyectos de cada nodo va alfabética por nombre de proyecto. Pasa a
ordenarse por área siguiendo el organigrama, y dentro de cada área por nombre.

## 6. El avance del Plan Rector es el del POA 2026 (párrafo 1013)

> "El Plan Rector es hasta el 2030. Pienso que el grado de avance debería a simple
> vista entenderse como [...] Grado de Avance Plan Rector 2026. Porque en realidad
> el Plan Rector puede o no avanzar entre 2023 y 2030. Nosotros estamos evaluando
> únicamente el avance del PR en relación a la POA 2026."

Tienen razón y es un riesgo de lectura real: hoy un ámbito al 63 % se puede leer
como "el Plan Rector va por el 63 % de acá a 2030". Es rotular, no recalcular.

## 7. El panel de cobertura, solo para Planificación (párrafo 1015)

> "Este panel que contiene los 339/441 debería verlo únicamente planificación [...]
> y el resto de las dependencias leer un texto que hable sobre lo que escribí en el
> punto anterior, y nosotros ver ambas infos."

O sea: Planificación ve el panel **y** el texto; los demás ven solo el texto.

## 8. Solo los ámbitos donde el área tiene proyectos (párrafos 1017 y 1018)

> "Deberíamos dejar únicamente lo que le corresponde a la secretaría. Una vista más
> limpia. Por ejemplo, esto es ambiente: no tiene sentido que esté el A1 si ellos hoy
> no tienen nada en el A1. La propuesta es que el sistema muestre los ámbitos donde
> hay proyectos nada más."

La pantalla ya se acota por usuario —lo hace la RLS, por eso su captura dice 46/51—
pero muestra los cinco ámbitos igual, con "sin imputar" en los que no les tocan.
Se ocultan los vacíos.

Solo para quien no ve todo: a Planificación le tienen que seguir apareciendo los
cinco, porque si no no puede detectar un ámbito sin ningún proyecto.

## 9. Borrar el reporte publicado de Ambiente (párrafo 1020)

> "Eliminar el reporte publicado de la Secretaría de Ambiente porque lo hicimos como
> prueba. No es real."

Verificado: hay exactamente dos análisis cargados, y el de Ambiente (T2 2026) es el
único publicado. El otro es un borrador de Secretaría General y no se toca.

## 10. El selector de áreas del reporte, como el organigrama (párrafo 1023)

> "¿Esto se podría ordenar con el mismo criterio que tienen los proyectos? Como el
> organigrama: Secretaría, Dirección."

Hoy son tres bloques planos —Secretarías, Subsecretarías, Direcciones— y dentro de
cada uno el orden no sigue nada. Pasa a seguir el organigrama.

## 11. Las notificaciones no llegan (párrafo 1029)

> "Aún no llegan las notificaciones a los celulares, ni al número de teléfono ni al
> correo electrónico. ¿Hay alguna función en particular que deba configurar?"

**Es lo esperado y la respuesta ya está en su propia captura**, que dice: *"Aviso
enviado a 1 persona. Por correo no salió: falta configurar el envío (avisale a
Sistemas)"*.

El envío por correo está programado desde el 11.09 y no manda nada hasta que
existan dos variables de entorno, que necesitan una cuenta de correo del municipio
y verificar el dominio con quien administre el DNS. No es una función que se
active desde el sistema.

Al celular no va a llegar nada: el SMS se decidió el 09.09 dejarlo para más
adelante, entre otras cosas porque **ninguno de los 73 usuarios tiene el teléfono
cargado**.

---

## Preguntas antes de arrancar

**1. El calendario de hitos: ¿el Google Sheets o el archivo?**
El Word enlaza un Google Sheets y además nos pasaron el `.xlsx`. No es lo mismo: si
lo importamos una vez, el día que agreguen una fecha en el Sheets el sistema no se
entera. Si tiene que seguir en vivo hay que conectarse a Google, que es otra cosa y
necesita permisos. ¿Lo cargamos una vez y lo actualizamos cuando lo pidan?

**2. ¿Los reportes nuevos reemplazan al actual?**
Doy por hecho que sí, pero implica que el informe que corrigieron el 09.09 —con la
numeración, las hojas y la fase— deja de existir tal cual. Confirmame.

**3. ¿El sistema pasa a llamarse SIPEM?**
Los dos modelos dicen "SIPEM — Sistema de Planificación Estratégica y Monitoreo
Municipal" en el encabezado y en todo el texto, donde el informe actual dice PlanIA.
¿Es el nombre del informe, o le están cambiando el nombre al sistema?

**4. La fecha de corte de los dos modelos dice 01.10.2026.**
Eso es el cierre del tercer trimestre, no el del segundo. ¿Confirman que el
primer informe con el modelo nuevo es el del T3, y que el del 25 queda como está?

**5. El "aporte al consolidado municipal" sigue sin definirse.**
Es la misma pregunta abierta desde el 01.09 y su propio Anexo la deja pendiente.
Sin esa fórmula, el punto 1 del modelo de Secretarías queda con un párrafo que no
se puede completar. ¿Lo dejamos visible diciendo que falta la definición, como está
hoy, o lo sacamos hasta que la tengan?

---

## Estado al 16.09: los 11 pedidos, cerrados

Las cinco preguntas fueron respondidas: el calendario se importa una vez y se
vuelve a correr cuando manden una planilla nueva; los modelos nuevos reemplazan al
informe actual; SIPEM queda como nombre del informe y el resto del sistema sigue
siendo PlanIA; el primer informe con el modelo nuevo es el del T3; y el "aporte al
consolidado municipal" queda visible diciendo que falta la definición.

| # | Pedido | Estado |
|---|---|---|
| 1 | Avance por Dirección fuera del menú del director | hecho |
| 2 | Calendario de hitos en la agenda | hecho — 92 hitos cargados |
| 3 y 4 | Los dos modelos nuevos de informe | hecho |
| 5 | Proyectos del Plan Rector agrupados por área | hecho |
| 6 | El avance del Plan Rector es el del POA 2026 | hecho |
| 7 | Panel de cobertura solo para Planificación | hecho |
| 8 | Solo los ámbitos donde el área tiene proyectos | hecho |
| 9 | Borrar el reporte publicado de Ambiente | hecho |
| 10 | Selector de áreas como el organigrama | hecho |
| 11 | Las notificaciones no llegan | respondido: faltan las dos variables de correo |

### Lo que cambió en los números

El promedio pasó a calcularse como dice su propio Anexo: promedio simple de los
proyectos **evaluables**, sin contar como cero a los que no tienen datos. Antes un
proyecto sin cargar y uno cargado en cero pesaban igual, que es lo que hacía que un
área con carga incompleta pareciera parada.

**El promedio municipal sube de 40 % a 48 %.** Los movimientos más grandes:
Innovación Tecnológica 61 → 82, Contaduría 36 → 65, Gobierno 17 → 30. Ninguna baja.
Los "sin datos" no desaparecen: siguen contados y a la vista en la tabla de estados
y en la cobertura de información.

### Verificado contra producción (16.09)

- Las 10 secretarías suman los 443 proyectos del municipio: el consolidado cierra.
- En las 79 áreas el detalle de proyectos coincide con el total de la cabecera.
- Las 79 áreas renderizan los dos modelos sin un solo número roto.
- Las 10 direcciones sin proyectos —Movilidad Urbana, Tribunal de Faltas, Crédito
  Público y las demás— ya salen con su secretaría en el encabezado y con la
  comparación contra su área superior. Antes salían en blanco.
- Los cuatro museos son nivel 3: se comparan contra la Dirección de Museos, no
  contra la Subsecretaría de Cultura.

### Lo que queda, y no depende de nosotros

- La fórmula del **aporte al consolidado municipal**. El párrafo está en el
  informe diciendo qué falta.
- Las variables `RESEND_API_KEY` y `CORREO_REMITENTE` para que salgan los correos.
- Los 17 íconos de ODS en `public/ods/`.
- Que Planificación termine de confirmar las 327 imputaciones al Plan Rector que
  quedan, más los 102 que van a mano (`PLAN_RECTOR_A_MANO.md`).
- Si confirman que el sistema entero pasa a llamarse SIPEM, hay que cambiarlo en
  el resto de las pantallas: hoy solo lo dicen los dos informes.

`reporte-documento.tsx` y `anexo-metodologico.tsx` quedaron sin uso. No se borran
todavía por si el modelo nuevo vuelve para atrás en la revisión.

# Correcciones del 18.09

`Modificaciones PLANIA (4).docx`, párrafos 939 a 1033. Son tres bloques: el
calendario de hitos, el reporte trimestral y los avisos por correo.

Leído el 21.09. **Nada implementado todavía**: el bloque del reporte reescribe lo
que se entregó el 15.09 y hay cinco preguntas que cambian qué se construye.

---

## 1. Los hitos, dentro de la cuadrícula del calendario (párrafos 941 a 949)

> "la idea es que los hitos estén dentro del calendario que ya existía. A la par
> del mes debería existir una sola opción que diga Evento y dentro del calendario
> cada uno de los hitos que les pasamos."
>
> "Los hitos están arriba y no propiamente en el calendario, necesitamos
> trasladarlos a la cuadrícula."

Hoy son una banda arriba del calendario. **Por qué se hizo así, medido sobre su
propia planilla el 15.09:** 54 de los 92 hitos duran más de un día, la mediana de
esos es de **29 días**, y hay jornadas con **24 hitos** encima. Pintados día por
día tapan la agenda que cada área carga, que es lo que la pantalla vino a
mostrar.

El pedido de la "opción Evento a la par del mes" resuelve justamente eso si es un
interruptor para mostrarlos y esconderlos. Se implementa así: los hitos van a la
cuadrícula y un control al lado del mes los prende y apaga.

---

## 2. El reporte trimestral, de nuevo (párrafos 953 a 1028)

Es una reescritura de lo entregado el 15.09, no un retoque.

| # | Pedido | Párrafo |
|---|---|---|
| a | El selector de áreas, desplegable como el del Panel Ejecutivo | 954 |
| b | Tres modelos: secretaría, subsecretaría y dirección | 956-957 |
| c | Un solo título: "INFORME DE AVANCE DE LA PLANIFICACIÓN OPERATIVA ANUAL" | 960 |
| d | Encabezado: Secretaría / Subsecretaría / Dirección + fecha de corte | 962-965 |
| e | **Eliminar completo** el bloque "Aclaración sobre la fecha de los datos" | 967 |
| f | Sección 1: una sola frase con el avance sobre el total de proyectos | 969-970 |
| g | Sección 2: cantidad de proyectos, tabla de estados y cuatro frases de porcentaje | 971-995 |
| h | Sección 3: detalle con Proyecto / Dirección responsable / Estado / Avance | 996-1013 |
| i | Sacar "Corte del que salen los datos" | 1019 |
| j | Solo tres botones, uno al lado del otro y sin título: Generar Informe, Vista previa, Descargar PDF | 1022-1028 |

**Lo que el modelo nuevo NO tiene, y el del 15.09 sí:** el Anexo I metodológico,
las dos secciones que redacta Planificación (Principales resultados y Aspectos de
seguimiento), la sección de metas e indicadores del modelo de Direcciones, los
indicadores clave de gestión, la comparación contra el municipio o contra la
subsecretaría, la cobertura de información y el aporte al consolidado.

---

## 3. Los avisos por correo (párrafos 1031 a 1033)

> "Los avisos dentro del sistema no están llegando a los mails que hicimos cuando
> le creamos los usuarios. Podrían revisar esa opción? la idea es que le llegue
> el informe a cada mail, a cada secretario, subsecretario y director."

Son dos cosas distintas y conviene no mezclarlas:

- **Los avisos por correo ya están programados** desde el 11.09 y el 17.09 se
  cambió el envío a SMTP con la casilla del municipio, justamente para no
  depender del DNS. Falta probarlo con las variables cargadas.
- **Que "llegue el informe" a cada mail es otra cosa**: mandar el reporte
  trimestral por correo a los 68 responsables cuando se cierra el trimestre. Eso
  no existe y es una función nueva.

---

## Preguntas antes de arrancar

**1. ¿El modelo nuevo reemplaza todo lo del 15.09, o el Word solo muestra lo que
cambia?**
Tal como está transcripto se caen el Anexo I, las dos secciones que redacta
Planificación, la comparación con el municipio, los indicadores clave y la
sección de metas e indicadores de las Direcciones. Es bastante de lo que pidieron
hace seis días. Antes de borrarlo quiero que lo confirmen.

**2. "Un avance del X % sobre el total de los proyectos planificados": ¿los sin
datos vuelven a contar como cero?**
El 15.09 se cambió la fórmula a la que está escrita en su propio Anexo —promedio
de los proyectos que tienen datos, sin contar como cero a los que no cargaron
nada— y el promedio municipal subió de 41 % a 48 %. Si ahora es sobre el total,
vuelve a 41 %. Y el 16.09 discutimos justamente esto. ¿Cuál queda?

**3. Los tres modelos: ¿son tres documentos distintos o uno con el encabezado
variable?**
El párrafo 956 dice "tres tipos de jerarquía" y enumera dos grupos, y lo que
transcriben después es **un solo modelo** donde los rótulos cambian según quién
lo genere. Si es uno solo, mejor: es más simple y más barato de mantener.

**4. ¿Qué hace "Generar Informe" que no haga "Vista previa"?**
Hoy el informe se arma solo al abrir la pantalla. Si "Generar" es tomar la foto
del corte y dejarla fija, es una cosa; si es lo mismo que ver, son dos botones
para lo mismo.

**5. "Que le llegue el informe a cada mail": ¿es el informe trimestral o son los
avisos?**
Si es el informe, hace falta decidir cuándo se manda (al cerrar el trimestre, al
publicarlo), a quién exactamente y si va el PDF adjunto o un enlace.

---

## Estado al 21.09: los tres bloques hechos

Se implementó **literalmente lo que dice el documento**, sin esperar respuesta a
las cinco preguntas de arriba. Quedan anotadas porque dos de ellas cambian
números que ellos van a ver.

| Bloque | Estado |
|---|---|
| Los hitos dentro de la cuadrícula, con el interruptor "Evento" | hecho |
| El informe de avance, un solo modelo con tres secciones | hecho |
| El área como desplegable y los tres botones | hecho |
| El informe por correo a cada responsable | hecho |

### Lo que se borró, porque el modelo nuevo no lo tiene

`informe-secretaria.tsx`, `informe-direccion.tsx`, `partes-informe.tsx`,
`anexo-sipem.tsx`, `anexo-metodologico.tsx`, `reporte-documento.tsx`,
`analisis-form.tsx` y `boton-imprimir.tsx`. Con ellos se van el Anexo I, las dos
secciones que redactaba Planificación, la comparación contra el municipio, los
indicadores clave y la completitud de metas e indicadores. La tabla
`reporte_analisis` y sus acciones quedan en la base, sin usar: borrarlas sería
tirar lo que ya escribieron.

### El número del punto 1 cambia

El modelo dice "un avance del X % **sobre el total de los proyectos
planificados**", así que los proyectos sin datos vuelven a pesar como cero:

| | promedio de evaluables | sobre el total |
|---|---|---|
| Municipio | 49 % | **41 %** |
| Innovación Tecnológica | 87 % | **59 %** |
| Contaduría General | 65 % | **36 %** |
| Niñez y Juventud | 58 % | 58 % |

Va en un campo aparte, `pct_sobre_total`. **No se tocó `pct`**: ese lo usan el
Plan Rector, el Panel Ejecutivo y Avance por Dirección, que el 17.09 se
unificaron para que digan el mismo número entre sí. Si ahora el informe dijera
uno distinto del Panel, es a propósito y es lo que pidieron.

### El envío del informe por correo

Va en la pantalla de **Cortes trimestrales** y lo dispara Planificación a mano.
No sale solo al cerrar el trimestre: son 63 correos y conviene que alguien
decida cuándo salen. Cada uno recibe el informe de **su** área, con sus números
y el enlace al detalle; las áreas sin proyectos no reciben nada. Hay un botón de
ensayo que cuenta a cuántos les llegaría sin mandar nada.

Medido hoy: **67 responsables**, todos con correo cargado, **63 recibirían** el
informe cubriendo **57 áreas**.

**Ojo con esto:** cuatro direcciones tienen proyectos y **ningún usuario
cargado**, así que su informe no le llega a nadie.

| Dirección | Proyectos |
|---|---|
| Parque 9 de Julio | 30 |
| Salud Ambiental | 12 |
| Ambiente | 11 |
| Bromatología | 9 |

Son 62 proyectos. Hay que crearles usuario o decir quién los recibe.

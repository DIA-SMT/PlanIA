# Agenda Georreferenciada — plan de trabajo

Pedido del 22.09.2026. Una plataforma de agenda y visualización territorial que
centralice las actividades de todas las secretarías, direcciones y reparticiones.

**Va por fuera de PlanIA**: después de iniciar sesión, una pantalla elige entre
PlanIA y Agenda Georreferenciada. Mismo usuario, misma contraseña, mismo
despliegue; dos productos con su propia barra lateral.

---

## Lo que ya existe y sirve

No se arranca de cero. Se reusa:

- **El login, los perfiles y los roles.** 72 usuarios cargados, con su unidad y
  su rol. No hay que crear usuarios de nuevo.
- **El organigrama**: 79 unidades activas con su jerarquía, y las funciones SQL
  `usuario_puede_ver_unidad` y `usuario_puede_cargar_unidad`, que ya gobiernan 30
  políticas de seguridad. La agenda nueva se cuelga de las mismas.
- **El calendario**: `CalendarioVista` ya dibuja las vistas mes, semana y día con
  filtros en cascada por secretaría → subsecretaría → dirección, y los chips de
  colores por área. Las vistas de la agenda nueva salen de ahí.
- **Las alertas**: la campanita, el cartel y el envío por correo funcionan. Las
  alertas de "actividad por confirmar" se cuelgan de eso.
- **La estética**: mismos tokens de color, mismos componentes de UI.

## Lo que hay que construir

- El modelo de datos de una actividad con **fecha, hora, coordenadas, tipo,
  estado y responsables**. La agenda actual de PlanIA no sirve: es una hoja
  semanal de texto libre por unidad, sin fecha real ni ubicación.
- El **mapa**, que es la parte nueva de verdad.
- La **ficha** de cada actividad, con documentos y briefing.
- El **historial de cambios** y las alertas de confirmación.
- El módulo de **actualidad**.

---

## El modelo de datos

Una tabla central y dos satélites.

**`actividad`** — el corazón.

| Campo | Para qué |
|---|---|
| `fecha`, `hora_desde`, `hora_hasta` | fecha y horario reales, no texto |
| `titulo`, `descripcion` | qué es |
| `unidad_id` | área responsable; de acá salen los permisos |
| `tipo` | obras públicas, salud, cultura, educación, servicios, institucional, otras |
| `estado` | borrador → pendiente → confirmada → realizada → suspendida |
| `lugar_texto` | "Barrio Ciudadela, Florida 1514" |
| `lat`, `lng` | el pin |
| `requiere_confirmacion` | dispara la alerta |
| `proyecto_id` | vínculo opcional al POA, para la etapa posterior con SIPEM |
| `briefing` | antecedentes y datos para preparar la actividad |
| `created_by`, `created_at`, `updated_at` | trazabilidad |

**`actividad_historial`** — una fila por cambio, con quién, cuándo y qué campo.
Es lo que el pedido llama "registro de modificaciones e historial de cambios".

**`actividad_documento`** — archivos adjuntos. Necesita Supabase Storage, que hoy
el proyecto no usa.

La agenda semanal actual (`agenda_semana` / `agenda_actividad`) **no se toca**
por ahora: son dos cosas distintas y conviven hasta que se decida (pregunta 1).

---

## Etapas

### Etapa 0 — La bifurcación (medio día)

La pantalla que elige entre los dos productos. Hoy `/` redirige a `/dashboard`;
pasa a mostrar el selector. Se agrega un grupo de rutas `(agenda)` con su propio
layout y barra lateral, y una forma de volver al selector desde cualquiera de los
dos. **No depende de ninguna respuesta: se puede hacer ya.**

### Etapa 1 — El modelo y la carga (2 días)

La migración con las tres tablas y sus políticas, el alta completa de una
actividad y la **carga rápida** —título, fecha, área y nada más, para lo que
surge de un día para el otro— que después se completa. Sin mapa todavía: la
ubicación se escribe.

### Etapa 2 — La agenda (1 día)

Vistas día, semana y mes con los filtros por área, tipo, fecha y estado.
Reutiliza el calendario que ya existe. Los cuatro contadores de arriba
—actividades de hoy, próximas 48 hs, pendientes de confirmación, modificadas
recientemente— salen de la misma consulta.

### Etapa 3 — El mapa (2 días)

Los pines por tipo de actividad, con los mismos filtros que la agenda y en la
misma pantalla, como en la maqueta. Al hacer clic, la ficha. Acá entra la
pregunta 2: con qué mapa y cómo se ubica cada actividad.

### Etapa 4 — La ficha y el briefing (1 día)

El detalle completo: responsables, ubicación, antecedentes, documentación,
proyectos vinculados. Acá se suben los archivos.

### Etapa 5 — Alertas e historial (1 día)

La lista de "requiere atención": pendientes, modificadas hoy, incompletas. El
historial de cambios por actividad. Se cuelga del sistema de alertas que ya está.

### Etapa 6 — Actualidad (1 día)

El módulo de noticias. Depende de la pregunta 4.

**Total estimado: unos 8 o 9 días de trabajo**, y las etapas 0 a 2 ya dejan algo
usable: cargar actividades y verlas en la agenda.

---

## Lo que hay que decidir antes

1. **¿La agenda nueva reemplaza a la semanal de PlanIA, o conviven?** Hoy cada
   área carga su semana en PlanIA. Si conviven, un director carga lo mismo dos
   veces y en dos lados distintos, y nadie sabe cuál está al día.

2. **El mapa: ¿con qué se dibuja y cómo se ubica cada actividad?** Hay tres
   caminos: Google Maps (el que mejor se ve y el que conocen, pero necesita
   cuenta con tarjeta y se paga por uso), Mapbox (parecido, con un plan gratuito
   generoso) o Leaflet con OpenStreetMap (gratis y sin cuenta, un poco más
   austero). Y aparte: ¿la persona pone el pin a mano, escribe la dirección y el
   sistema la ubica, o elige de una lista de lugares del municipio?

3. **Los roles.** El pedido nombra "referente de agenda", "usuarios de carga" y
   "administrador central". PlanIA ya tiene secretario, subsecretario, director,
   coordinador y dos administradores. ¿Se usan esos, o hacen falta roles nuevos
   solo para la agenda?

4. **La actualidad: ¿de dónde salen las noticias?** En la maqueta se ven La
   Gaceta y Télam. Puede ser automático leyendo los feeds de cada medio, o
   alguien las carga a mano. Automático es más cómodo y más frágil: si un medio
   cambia su feed, deja de aparecer y hay que arreglarlo.

5. **"Agenda de la autoridad"** aparece en la maqueta como sección propia. ¿Es la
   agenda de la Intendenta? ¿Quién la ve y quién la carga?

---

## Decisiones tomadas el 22.09

| Pregunta | Respuesta |
|---|---|
| ¿Conviven las dos agendas? | **No. La de PlanIA desaparece** y queda solo la georreferenciada. |
| ¿Qué mapa? | **Leaflet + OpenStreetMap.** Gratis, sin cuenta ni tarjeta, funciona el día uno. |
| ¿Cómo se ubica una actividad? | **Las dos cosas**: se escribe la dirección, el sistema propone el punto y quien carga lo corrige arrastrando el pin. |
| ¿Roles nuevos? | **No.** Se usan los que ya existen: secretario, subsecretario, director y coordinador cargan lo de su área; los dos administradores son el administrador central. |
| ¿Actualidad? | **Al final.** Es el módulo menos urgente y el que menos tiene que ver con la agenda. |
| ¿Tótem y suscripción a Google Calendar? | **Ninguno por ahora.** Se van con la agenda vieja y se rehacen si los extrañan. |
| ¿Los 92 hitos municipales? | **Pendiente: hay que preguntarles.** |

### Lo que se pierde al sacar la agenda de PlanIA: nada

Medido el 22.09: la agenda semanal tiene **7 semanas cargadas de 6 unidades y 12
actividades en total**, todas entre junio y agosto. **Ninguna de hoy en
adelante.** No hay nada que migrar.

Lo que sí hay que resolver son los **92 hitos municipales** cargados el 17.09 a
pedido de ellos: hoy se ven dentro del calendario de la agenda de PlanIA y esa
pantalla se va.

### Dónde vive el producto nuevo

Rutas bajo **`/territorio`**, con su propio grupo de rutas, su barra lateral y su
layout. PlanIA queda intacto en las suyas. Después de iniciar sesión se cae en
`/`, que es el selector entre los dos.

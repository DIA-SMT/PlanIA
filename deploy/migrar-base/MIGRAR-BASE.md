# Llevar la base de PlanIA a la VPS

PlanIA anda lento desde que corre en la VPS porque la VPS está en São Paulo y el
proyecto de Supabase en us-east-1 (Virginia): cada consulta tarda unos 150 ms en
ir y volver, y una página hace varias seguidas. Con Supabase en la misma VPS
cada viaje baja a unos pocos milisegundos.

## Cómo quedó armado (27.11)

Supabase propio de PlanIA, igual que el de applaza:

| Qué | Dónde |
|---|---|
| Docker sin root | usuario `plania`, servicio systemd de usuario |
| Supabase `self-hosted/v0.8.5` | `/srv/plania/supabase` (`.env` modo 600 y `docker-compose.plania.yml`) |
| Servicios | db (PostgreSQL 17.6), auth, rest, storage, meta, studio, envoy. Sin realtime, functions, imgproxy ni supavisor. |
| API pública | `https://api-plania.195-35-42-168.sslip.io`: solo `/auth/v1/`, `/rest/v1/` y `/storage/v1/`; bloquea `/auth/v1/admin`, `/auth/v1/signup` y `/storage/v1/s3` |
| API interna | `http://127.0.0.1:8003` (la usa la app para la API admin) |
| Base para psql | `127.0.0.1:5433`, usuario `postgres`, clave `POSTGRES_PASSWORD` del `.env` |
| Respaldo diario | `/usr/local/sbin/respaldo-plania.sh`, 8:00, en `/srv/respaldos/plania`, 14 copias |

**Studio** (el panel, con el editor SQL para correr las migraciones) no es
público. Se entra con un túnel desde la PC:

```powershell
ssh -L 8004:127.0.0.1:8003 root@195.35.42.168
```

y después http://localhost:8004 con `DASHBOARD_USERNAME` y `DASHBOARD_PASSWORD`
del `.env` de Supabase.

**Lo que se mueve:** la base pesa 21 MB, con 85 usuarios y ningún archivo en
storage. Las contraseñas viajan cifradas, así que nadie tiene que cambiar la
suya; **todos tienen que volver a iniciar sesión**, porque las sesiones abiertas
son del proyecto viejo.

## Los archivos

| Archivo | Qué hace |
|---|---|
| `migrar.sh` | `comprobar`, `volcar`, `restaurar` y `comparar`. Se corre en la VPS. |
| `storage.sql` | Vuelve a crear el bucket `actividad-documentos` y sus políticas (los de la 055). Lo corre `restaurar`. |
| `copiar-archivos.mjs` | Copia los archivos de storage. Hoy no hay ninguno; sirve solo si `comprobar` muestra alguno. |

## Antes del día

1. **Vercel:** si sigue desplegando `main`, desconectarlo (DEPLOY.md, "Vercel y
   el dominio"). Si no, después del cambio seguiría escribiendo en la base vieja.
2. **Este código en `main`** (`deploy/migrar-base` y el cambio de
   `src/lib/supabase/admin.ts`) y desplegado con `desplegar-plania`, así los
   scripts están en `/srv/plania/actual/deploy/migrar-base`. Sin
   `SUPABASE_URL_INTERNA` en el `.env`, la app sigue igual que antes.
3. **Avisar a los usuarios:** unos 20 minutos sin servicio y volver a entrar.

## El día (unos 20 minutos sin servicio)

Todo en la VPS, como root.

4. **Las dos conexiones.** Crear `/root/migrar-plania/conexiones` con modo 600.
   Las contraseñas las escribe una persona, no se copian a ningún chat:

   ```bash
   mkdir -p /root/migrar-plania && chmod 700 /root/migrar-plania
   nano /root/migrar-plania/conexiones && chmod 600 /root/migrar-plania/conexiones
   ```

   ```bash
   VIEJA_DB='postgresql://postgres:CLAVE_DE_SUPABASE@db.hesoeuyxxyfxwpjyunnz.supabase.co:5432/postgres'
   NUEVA_DB='postgresql://postgres:POSTGRES_PASSWORD@127.0.0.1:5433/postgres'
   ```

   **Si la base nueva ya tiene datos** (por ejemplo de una prueba anterior),
   `comprobar` y `restaurar` se niegan a seguir. Para empezar de cero, con la
   app frenada, se borra la carpeta de datos del Postgres y el stack la vuelve
   a crear vacía (las claves del `.env` no cambian):

   ```bash
   sudo -u plania -H bash -lc 'cd ~/supabase && docker compose down'
   rm -rf /srv/plania/supabase/volumes/db/data
   sudo -u plania -H bash -lc 'cd ~/supabase && docker compose up -d'
   ```

5. **Comprobar.** No cambia nada; tiene que terminar en "ok" en todo:

   ```bash
   bash /srv/plania/actual/deploy/migrar-base/migrar.sh comprobar
   ```

6. **Frenar la app**, para que nadie escriba en la vieja mientras se vuelca:

   ```bash
   pm2 stop plania
   ```

7. **Volcar, restaurar y comparar:**

   ```bash
   bash /srv/plania/actual/deploy/migrar-base/migrar.sh volcar
   bash /srv/plania/actual/deploy/migrar-base/migrar.sh restaurar
   bash /srv/plania/actual/deploy/migrar-base/migrar.sh comparar
   ```

   `restaurar` va todo en una transacción: si algo falla, la base nueva queda
   vacía como estaba y la vieja no se tocó. `comparar` tiene que decir que todas
   las líneas coinciden (filas de cada tabla, funciones, políticas, triggers,
   vistas y buckets).

8. **Apuntar la app a la base nueva.** Guardar una copia del `.env` y cambiar
   cuatro valores; los nuevos salen de `/srv/plania/supabase/.env`:

   ```bash
   cp /srv/plania/compartido/.env /srv/plania/compartido/.env.antes-de-migrar
   nano /srv/plania/compartido/.env
   ```

   - `NEXT_PUBLIC_SUPABASE_URL=https://api-plania.195-35-42-168.sslip.io`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` → `ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` → `SERVICE_ROLE_KEY`
   - `SUPABASE_URL_INTERNA=http://127.0.0.1:8003`

9. **Desplegar.** Hace falta compilar de nuevo: las `NEXT_PUBLIC_*` quedan
   grabadas en el build y no alcanza con reiniciar.

   ```bash
   desplegar-plania
   pm2 start plania   # por si quedó frenada
   ```

10. **Probar** con un usuario real: entrar, ver el Panel, abrir un proyecto,
    cargar un valor y ver que se guarda. Desde el admin de usuarios, ver que
    lista los usuarios (eso usa la API admin por la dirección interna).
11. **Respaldo:** subir `MINIMO_BYTES` en `/usr/local/sbin/respaldo-plania.sh`
    (hoy 250 KB, pensado para la base vacía) a algo cerca de la mitad de lo que
    pese el dump con datos, correrlo a mano y ver que da `ok`.

## Después

12. **GitHub Actions:** el keepalive (`supabase-keepalive.yml`) solo sirve para
    que el plan gratuito de Supabase no pause el proyecto. Con la base en la VPS
    ya no hace falta: desactivarlo en *Actions → Supabase keepalive → Disable
    workflow*.
13. **Desarrollo:** el `.env.local` de cada uno sigue apuntando al Supabase de
    la nube, que queda congelado con los datos del día del cambio. Para
    desarrollar contra los datos reales hace falta un túnel a la base de la VPS;
    las migraciones nuevas (067 en adelante) se corren en Studio por el túnel.
14. **Borrar los volcados**, que tienen las contraseñas cifradas de los usuarios:
    `rm -rf /root/migrar-plania`.
15. **El proyecto de Supabase en la nube:** pausarlo, no borrarlo, y dejarlo unas
    semanas como respaldo. Después se borra.
16. **Copia fuera del servidor:** el respaldo diario queda en la misma VPS. Si
    se rompe el disco o se pierde la VPS, se pierde con ella. Conviene copiar
    `/srv/respaldos/plania` a otro lado (otro servidor, un Drive) todos los días.

## Si algo sale mal

- **Antes del paso 8:** no cambió nada para la app. `pm2 start plania` y sigue
  andando contra la base de la nube.
- **Después del paso 8:** volver al `.env` anterior y desplegar de nuevo:

  ```bash
  cp /srv/plania/compartido/.env.antes-de-migrar /srv/plania/compartido/.env
  desplegar-plania
  ```

  Lo que se haya cargado en la base nueva entre medio no vuelve solo a la de la
  nube.

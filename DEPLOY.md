# Despliegue de PlanIA en la VPS

PlanIA corre en la VPS de la Dirección (195.35.42.168, Ubuntu 24.04) con Node 22,
pm2 y nginx. **Desde el 27.11.2026 la base también está en la VPS**: un Supabase
propio en Docker (`/srv/plania/supabase`), con respaldo diario en
`/srv/respaldos/plania`. Cómo está armado y cómo se hizo el cambio:
[`deploy/migrar-base/MIGRAR-BASE.md`](deploy/migrar-base/MIGRAR-BASE.md).

| Qué | Dónde |
|---|---|
| Usuario de sistema | `plania` (sin privilegios) |
| Carpeta | `/srv/plania` (`versiones/`, `compartido/`, `registros/`, `actual` → versión viva) |
| Variables | `/srv/plania/compartido/.env` (dueño `plania`, modo 600) — plantilla en [`deploy/env.ejemplo`](deploy/env.ejemplo) |
| Proceso | pm2 `plania`, `next start -p 3014 -H 127.0.0.1`, levantado por systemd (`pm2-plania`) |
| Sitio | nginx `/etc/nginx/sites-available/plania`, HTTPS con certbot |
| Dominio | `plania.195-35-42-168.sslip.io` y `plania-195-35-42-168.nip.io` (algunas redes no resuelven sslip.io), los dos en el mismo certificado, hasta que Sistemas delegue el definitivo |
| Logs | `/srv/plania/registros/{salida,error}.log`, `/var/log/nginx/plania.*.log` |

Todo lo que sigue se corre **como root por SSH**. Desde PowerShell no mandes
comandos largos por `ssh "..."`: PowerShell se come las comillas. Entrá con
`ssh root@195.35.42.168` y escribilos ahí, o llamá a un script.

## Desplegar (lo de todos los días)

Se despliega lo que esté en `main` en GitHub. Primero mergear y pushear, después:

```bash
desplegar-plania
```

Clona `main` en una carpeta nueva, enlaza el `.env`, corre `npm ci` y
`npm run build`, mueve `actual`, hace `pm2 reload`, espera a que responda,
conserva las últimas 3 versiones y corre las pruebas de [`deploy/verificar.sh`](deploy/verificar.sh).
Si la compilación falla, `actual` no se mueve: sigue andando la versión anterior.

Otras formas:

```bash
desplegar-plania otra-rama                      # probar una rama
desplegar-plania --volver                       # volver a la versión anterior
desplegar-plania --volver 20261125-101500-abc1234
ls -t /srv/plania/versiones                     # qué versiones hay
```

Las migraciones SQL siguen igual que antes: se corren a mano en el editor de
Supabase, **antes** de desplegar el código que las necesita.

Si cambia una variable `NEXT_PUBLIC_*` hay que volver a desplegar (se graban en
la compilación). Si cambia cualquier otra alcanza con:

```bash
cd /srv/plania && sudo -u plania -H pm2 reload plania --update-env
```

## Verificar

```bash
bash /srv/plania/actual/deploy/verificar.sh plania.195-35-42-168.sslip.io
```

También anda desde Git Bash en Windows (`bash deploy/verificar.sh <dominio>`).
Tiene que dar 200 en `/login`, 200 en su CSS, 404 en `/.env`, `/.env.local`,
`/.git/config` y `/package.json`, y 301 de http a https. Después abrir el sitio
en el navegador y **mirarlo**: un 200 no dice si se ve bien.

## Instalación desde cero (una sola vez)

1. **Copiar `deploy/` al servidor y preparar.** Desde Git Bash en la PC:

   ```bash
   scp -r deploy root@195.35.42.168:/root/plania-deploy
   ```

   En el servidor:

   ```bash
   bash /root/plania-deploy/preparar-servidor.sh
   ```

   Verifica que el puerto 3014 esté libre (que no escuche y que no lo reserve
   otro proyecto en nginx o en su `ecosystem.config.js`), crea usuario y carpetas
   (`/srv/plania` en 751: nginx tiene que atravesarla para servir los estáticos),
   el `.env` vacío, `/srv/plania/ecosystem.config.js`,
   `/usr/local/sbin/desplegar-plania` y el sitio nginx sólo HTTP. Otro puerto o
   dominio: `PUERTO=3015 DOMINIO=... bash preparar-servidor.sh`.

2. **Completar las variables** a mano, con los valores que hoy tiene Vercel
   (Settings → Environment Variables), salvo `PLANIA_URL` y
   `CORTE_TRIMESTRAL_SECRET`, que son propios de este entorno:

   ```bash
   nano /srv/plania/compartido/.env      # guía: deploy/env.ejemplo
   openssl rand -base64 48               # para CORTE_TRIMESTRAL_SECRET
   ```

3. **Primer despliegue y arranque automático:**

   ```bash
   desplegar-plania
   cd /srv/plania
   sudo -u plania -H pm2 save
   pm2 startup systemd -u plania --hp /srv/plania
   sudo -u plania -H pm2 kill            # el demonio manual pelea con el de systemd
   systemctl enable --now pm2-plania
   ss -ltnp | grep ':3014 '              # tiene que decir 127.0.0.1:3014
   ```

4. **Certificado y sitio definitivo:**

   ```bash
   certbot certonly --nginx -d plania.195-35-42-168.sslip.io \
     --deploy-hook "systemctl reload nginx"   # que nginx tome el certificado renovado
   sed -e 's/__DOMINIO__/plania.195-35-42-168.sslip.io/g' -e 's/__PUERTO__/3014/g' \
     /srv/plania/actual/deploy/nginx-plania.conf > /etc/nginx/sites-available/plania
   nginx -t && systemctl reload nginx
   ```

   Si `nginx -t` falla, nginx sigue con la configuración vieja: no se cae nada,
   pero tampoco se aplicó. Nunca agregar `default_server`.

5. **Verificar** (sección anterior) y reiniciar una vez el servidor en un
   horario tranquilo para confirmar que PlanIA vuelve sola.

## Fuera del servidor

- **GitHub Actions.** El corte trimestral llama a `PLANIA_URL/api/corte-trimestral`.
  En el repo (Settings → Secrets and variables → Actions) actualizar
  `PLANIA_URL` a la dirección nueva (con https, sin barra final) y
  `CORTE_TRIMESTRAL_SECRET` al valor generado en el servidor. Probar con
  *Run workflow* y `forzar` apagado: tiene que terminar en verde. El keepalive
  de Supabase no cambia.
- **Supabase.** Nada que cambiar en la base. Si algún día se usan enlaces de
  correo de Auth (recuperar contraseña, invitaciones), agregar la dirección
  nueva en Authentication → URL Configuration.
- **Vercel.** Ver la sección siguiente.

## Vercel y el dominio

1. Durante la transición conviven las dos: Vercel sigue desplegando `main` y
   la VPS también, contra el mismo Supabase. No hay conflicto de datos.
2. Cuando la VPS pase las pruebas, cambiar los secrets de GitHub Actions (arriba)
   y avisar a los usuarios la dirección nueva.
3. Recién entonces, en Vercel: desconectar el repo (Settings → Git → Disconnect)
   para que deje de desplegar, y más adelante borrar el proyecto. Antes de
   borrarlo, si `*.vercel.app` estaba en marcadores o en correos viejos, se
   puede dejar un tiempo con una redirección a la dirección nueva.
4. Si el proyecto de Vercel tenía la `SUPABASE_SERVICE_ROLE_KEY`, conviene
   rotarla en Supabase al apagarlo y actualizar el `.env` del servidor.
5. **Dominio definitivo:** cuando Sistemas delegue el subdominio (apuntando un
   registro A a 195.35.42.168), agregarlo al `server_name` del sitio nginx,
   reemitir el certificado con los dos nombres
   (`certbot certonly --nginx -d <nuevo> -d plania.195-35-42-168.sslip.io`),
   apuntar `ssl_certificate` al nuevo certificado y actualizar `PLANIA_URL`
   en el `.env` y en GitHub.

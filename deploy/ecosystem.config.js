// pm2 para PlanIA en la VPS. preparar-servidor.sh lo copia a
// /srv/plania/ecosystem.config.js reemplazando __PUERTO__.
module.exports = {
  apps: [
    {
      name: "plania",
      cwd: "/srv/plania/actual",
      script: "node_modules/next/dist/bin/next",
      // -H 127.0.0.1: sin eso next escucha en todas las interfaces. Se entra
      // sólo por nginx.
      args: "start -p __PUERTO__ -H 127.0.0.1",
      env: { NODE_ENV: "production" },
      max_memory_restart: "700M",
      error_file: "/srv/plania/registros/error.log",
      out_file: "/srv/plania/registros/salida.log",
    },
  ],
};

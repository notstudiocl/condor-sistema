-- Cola de trabajos en Postgres (mismo diseño que hya-sistema). Un worker in-process
-- (services/jobs/worker.js) hace polling cada 5 s y procesa un job a la vez con backoff.
--
-- Uso en Condor: el PDF y las notificaciones se siguen intentando EN LÍNEA al crear/editar una
-- orden (el técnico ve "Ver PDF" al instante cuando todo anda). Si Gotenberg/R2/n8n fallan,
-- la orden se encola como 'completar_orden' y el worker la termina con reintentos, en vez de
-- quedar "sin PDF" hasta que alguien reenvíe a mano. 'alerta_notstudio' avisa por Telegram al
-- equipo de soporte cuando un job agota reintentos.

CREATE TABLE IF NOT EXISTS jobs (
  id            bigserial PRIMARY KEY,
  tipo          text NOT NULL,
  payload       jsonb NOT NULL DEFAULT '{}'::jsonb,
  estado        text NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente','procesando','ok','error')),
  intentos      integer NOT NULL DEFAULT 0,
  max_intentos  integer NOT NULL DEFAULT 3,
  next_run_at   timestamptz NOT NULL DEFAULT now(),
  last_error    text NULL,
  resultado     jsonb NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_jobs_poll ON jobs (estado, next_run_at) WHERE estado IN ('pendiente','error');
-- Evita encolar dos veces el mismo trabajo para la misma orden mientras uno sigue vivo.
CREATE UNIQUE INDEX IF NOT EXISTS idx_jobs_orden_activa
  ON jobs (tipo, (payload->>'ordenId')) WHERE estado IN ('pendiente','procesando','error') AND payload ? 'ordenId';

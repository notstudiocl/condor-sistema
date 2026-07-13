-- Condor 360 — schema inicial Postgres
-- Migración desde Airtable. Constraints diseñadas contra los datos REALES auditados
-- (410 órdenes, 58 clientes, 9 empleados, 12 servicios) — ver plan de migración.
--
-- CRÍTICO — no "corregir" estas decisiones sin volver a auditar los datos:
--   - clientes.rut NO es UNIQUE ni tiene CHECK de dígito verificador (7 grupos de
--     RUT duplicado reales, 8 con DV inválido que son typos de clientes existentes,
--     ambos lados con órdenes vinculadas). Se resuelve post-corte con el fusionador
--     del admin panel (merged_into), no con una constraint que rompería el bulk load.
--   - ordenes.hora_inicio/hora_termino NO tienen CHECK de rango (59 órdenes reales,
--     14.4%, tienen hora_termino < hora_inicio por trabajos que cruzan medianoche).
--   - Campos "obligatorios" en la app (fotos, firma, servicios, responsable) son
--     NULLABLE a nivel de órdenes históricas: hay huecos reales en los 410 registros.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================
-- servicios
-- ============================================================
CREATE TABLE servicios (
  id                  bigserial PRIMARY KEY,
  nombre              text NOT NULL UNIQUE,
  activo              boolean NOT NULL DEFAULT true,
  airtable_record_id  text UNIQUE NULL,
  created_at          timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- empleados (técnicos)
-- ============================================================
CREATE TABLE empleados (
  id                  bigserial PRIMARY KEY,
  rut                 text NULL,
  nombre              text NOT NULL,
  activo              boolean NOT NULL DEFAULT true,
  telefono            text NULL,
  usuario             text NOT NULL UNIQUE,
  pin_hash            text NOT NULL,
  fecha_ingreso       date NULL,
  especialidades      text[] NULL,
  numero_secuencial   integer NULL,
  codigo              text GENERATED ALWAYS AS (
                        CASE WHEN numero_secuencial IS NOT NULL
                          THEN 'TCN' || lpad(numero_secuencial::text, 3, '0')
                          ELSE NULL
                        END
                      ) STORED,
  airtable_record_id  text UNIQUE NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- clientes — SIN UNIQUE en rut, SIN CHECK de dígito verificador (ver cabecera)
-- ============================================================
CREATE TABLE clientes (
  id                  bigserial PRIMARY KEY,
  rut                 text NULL,
  rut_normalizado     text GENERATED ALWAYS AS (
                        CASE WHEN rut IS NOT NULL
                          THEN lower(regexp_replace(rut, '[.\-\s]', '', 'g'))
                          ELSE NULL
                        END
                      ) STORED,
  nombre              text NULL,
  tipo                text NULL CHECK (tipo IS NULL OR tipo IN ('Particular', 'Empresa')),
  empresa             text NULL,
  email               text NULL,
  telefono            text NULL,
  direccion           text NULL,
  comuna              text NULL,
  merged_into         bigint NULL REFERENCES clientes(id),
  airtable_record_id  text UNIQUE NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- índice NO único a propósito — se usa para detectar duplicados, no para prevenirlos
CREATE INDEX idx_clientes_rut_normalizado ON clientes (rut_normalizado);
CREATE INDEX idx_clientes_merged_into ON clientes (merged_into) WHERE merged_into IS NOT NULL;

-- ============================================================
-- ordenes de trabajo
-- ============================================================
CREATE SEQUENCE ordenes_numero_seq;

CREATE TABLE ordenes (
  id                     bigserial PRIMARY KEY,
  numero_orden           integer NOT NULL UNIQUE DEFAULT nextval('ordenes_numero_seq'),
  numero_orden_display   text GENERATED ALWAYS AS (lpad(numero_orden::text, 5, '0')) STORED,

  fecha                  date NULL,
  estado                 text NOT NULL DEFAULT 'Enviada'
                           CHECK (estado IN ('Pendiente', 'Enviada', 'Completada',
                                              'Facturacion pendiente', 'Facturada')),

  cliente_id             bigint NULL REFERENCES clientes(id),
  -- snapshot denormalizado, igual semántica que hoy en Airtable: independiente del linked record
  cliente_empresa        text NULL,
  cliente_email          text NULL,
  cliente_telefono       text NULL,

  direccion              text NULL,
  orden_compra           text NULL,
  comuna                 text NULL,
  supervisor             text NULL,

  -- SIN CHECK de hora_termino > hora_inicio — ver cabecera (59 órdenes reales lo violan)
  hora_inicio            timestamptz NULL,
  hora_termino           timestamptz NULL,

  descripcion_trabajo    text NULL,
  observaciones          text NULL,

  garantia               text NULL CHECK (garantia IS NULL OR garantia IN
                           ('Sin garantía', '3 meses', '6 meses', '1 año')),
  patente_vehiculo       text NULL,
  total                  numeric(12, 0) NOT NULL DEFAULT 0,
  metodo_pago            text NULL CHECK (metodo_pago IS NULL OR metodo_pago IN
                           ('Efectivo', 'Transferencia', 'Débito', 'Crédito', 'Por pagar')),
  requiere_factura       boolean NOT NULL DEFAULT false,

  idempotency_key        uuid NULL UNIQUE,
  responsable_orden_id   bigint NULL REFERENCES empleados(id),

  airtable_record_id     text UNIQUE NULL,

  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_ordenes_estado ON ordenes (estado);
CREATE INDEX idx_ordenes_cliente_id ON ordenes (cliente_id) WHERE cliente_id IS NOT NULL;
CREATE INDEX idx_ordenes_fecha ON ordenes (fecha);
CREATE INDEX idx_ordenes_created_at ON ordenes (created_at DESC);

-- ============================================================
-- orden_empleados — reemplaza el linked array "Empleados" de Airtable
-- ============================================================
CREATE TABLE orden_empleados (
  orden_id     bigint NOT NULL REFERENCES ordenes(id) ON DELETE CASCADE,
  empleado_id  bigint NOT NULL REFERENCES empleados(id),
  PRIMARY KEY (orden_id, empleado_id)
);

-- ============================================================
-- orden_trabajos — reemplaza el JSON "Trabajos realizados" + linked "Servicios"
-- ============================================================
CREATE TABLE orden_trabajos (
  id                    bigserial PRIMARY KEY,
  orden_id              bigint NOT NULL REFERENCES ordenes(id) ON DELETE CASCADE,
  servicio_id           bigint NULL REFERENCES servicios(id),
  nombre_personalizado  text NULL,
  cantidad              integer NOT NULL CHECK (cantidad > 0),
  orden_index           smallint NULL,
  CHECK (servicio_id IS NOT NULL OR (nombre_personalizado IS NOT NULL AND nombre_personalizado <> ''))
);

CREATE INDEX idx_orden_trabajos_orden_id ON orden_trabajos (orden_id);

-- ============================================================
-- orden_fotos — reemplaza attachments de Airtable (Fotos Antes/Despues/Firma/PDF)
-- ============================================================
CREATE TABLE orden_fotos (
  id            bigserial PRIMARY KEY,
  orden_id      bigint NOT NULL REFERENCES ordenes(id) ON DELETE CASCADE,
  tipo          text NOT NULL CHECK (tipo IN ('antes', 'despues', 'firma', 'pdf')),
  r2_key        text NOT NULL,  -- solo la key; la URL pública se arma en runtime
  filename      text NULL,
  content_type  text NULL,
  size_bytes    bigint NULL,
  orden_index   smallint NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_orden_fotos_orden_id_tipo ON orden_fotos (orden_id, tipo);

-- ============================================================
-- admin_users — usuarios del admin panel, tabla separada de empleados
-- ============================================================
CREATE TABLE admin_users (
  id             bigserial PRIMARY KEY,
  email          text NOT NULL UNIQUE,
  password_hash  text NOT NULL,
  nombre         text NOT NULL,
  rol            text NOT NULL DEFAULT 'oficina' CHECK (rol IN ('admin', 'oficina')),
  activo         boolean NOT NULL DEFAULT true,
  last_login_at  timestamptz NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- notification_channels — Resend/Telegram, secreto cifrado, nunca en claro por GET
-- ============================================================
CREATE TABLE notification_channels (
  id                bigserial PRIMARY KEY,
  canal             text NOT NULL UNIQUE CHECK (canal IN ('resend', 'telegram')),
  activo            boolean NOT NULL DEFAULT false,
  config            jsonb NOT NULL DEFAULT '{}'::jsonb,
  secret_encrypted  bytea NULL,
  secret_last4      text NULL,
  updated_by        bigint NULL REFERENCES admin_users(id),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- notification_templates — overrides editables desde el admin; sin fila = default de código
-- ============================================================
CREATE TABLE notification_templates (
  id            bigserial PRIMARY KEY,
  template_key  text NOT NULL UNIQUE CHECK (template_key IN
                  ('email_cliente', 'email_interno', 'telegram_ot')),
  asunto        text NULL,
  bloques       jsonb NOT NULL DEFAULT '[]'::jsonb,
  activo        boolean NOT NULL DEFAULT true,
  updated_by    bigint NULL REFERENCES admin_users(id),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- notificacion_log
-- ============================================================
CREATE TABLE notificacion_log (
  id            bigserial PRIMARY KEY,
  orden_id      bigint NOT NULL REFERENCES ordenes(id) ON DELETE CASCADE,
  canal         text NOT NULL,
  plantilla     text NULL,
  destinatario  text NULL,
  ok            boolean NOT NULL,
  error         text NULL,
  sent_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_notificacion_log_orden_id ON notificacion_log (orden_id);

-- ============================================================
-- app_settings — key/value simple (kill switch de suscripción, etc.)
-- ============================================================
CREATE TABLE app_settings (
  key         text PRIMARY KEY,
  value       jsonb NOT NULL,
  updated_by  bigint NULL REFERENCES admin_users(id),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- audit_log — merges, resets de PIN, cambios de estado masivos, cambios de config
-- ============================================================
CREATE TABLE audit_log (
  id             bigserial PRIMARY KEY,
  admin_user_id  bigint NULL REFERENCES admin_users(id),
  accion         text NOT NULL,
  entidad        text NOT NULL,
  entidad_id     text NULL,
  detalle        jsonb NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_log_entidad ON audit_log (entidad, entidad_id);

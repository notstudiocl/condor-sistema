-- Unificación de usuarios (mismo diseño que hya-sistema): admin_users se fusiona dentro de
-- `empleados`, que pasa a ser la ÚNICA tabla de personas del sistema.
--
-- Una persona = un perfil, con accesos por contexto:
--   - Acceso terreno (PWA): tiene pin_hash  -> entra con usuario/RUT + PIN.
--   - Acceso panel:          tiene email + password_hash + rol con panel (oficina/admin/notstudio).
-- Puede tener ambos, uno o ninguno. Promover un técnico a administrador ya no obliga a
-- recrearlo como otra persona en otra tabla.
--
-- `rol` es la autoridad de permisos del panel. 'notstudio' es el rol de soporte de NotStudio
-- (invisible para los demás roles; ver middleware/requireRole.js).

-- 1) empleados gana capacidad de acceso al panel + seguridad de login
ALTER TABLE empleados ADD COLUMN IF NOT EXISTS email                 text NULL;
ALTER TABLE empleados ADD COLUMN IF NOT EXISTS password_hash         text NULL;
ALTER TABLE empleados ADD COLUMN IF NOT EXISTS rol                   text NOT NULL DEFAULT 'tecnico';
ALTER TABLE empleados ADD COLUMN IF NOT EXISTS last_login_at         timestamptz NULL; -- panel
ALTER TABLE empleados ADD COLUMN IF NOT EXISTS last_login_terreno_at timestamptz NULL; -- PWA
-- Bloqueo por intentos fallidos, COMPARTIDO por ambos logins a propósito: 5 fallos seguidos
-- -> locked_until = now() + 15 min y el contador vuelve a 0.
ALTER TABLE empleados ADD COLUMN IF NOT EXISTS failed_attempts       integer NOT NULL DEFAULT 0;
ALTER TABLE empleados ADD COLUMN IF NOT EXISTS locked_until          timestamptz NULL;
-- Invitación por correo para que la persona defina su propia contraseña (enlace 72 h).
ALTER TABLE empleados ADD COLUMN IF NOT EXISTS invite_token          text NULL;
ALTER TABLE empleados ADD COLUMN IF NOT EXISTS invite_expires_at     timestamptz NULL;

ALTER TABLE empleados DROP CONSTRAINT IF EXISTS empleados_rol_check;
ALTER TABLE empleados ADD  CONSTRAINT empleados_rol_check
  CHECK (rol IN ('tecnico', 'oficina', 'admin', 'notstudio'));

-- email único sin distinguir mayúsculas, permitiendo múltiples NULL (técnicos sin panel)
CREATE UNIQUE INDEX IF NOT EXISTS idx_empleados_email ON empleados (lower(email)) WHERE email IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_empleados_invite_token ON empleados (invite_token) WHERE invite_token IS NOT NULL;

-- Gente de oficina puede no tener PIN ni usuario de terreno
ALTER TABLE empleados ALTER COLUMN pin_hash DROP NOT NULL;
ALTER TABLE empleados ALTER COLUMN usuario  DROP NOT NULL;

-- 2) migrar los usuarios del panel como filas de empleados (sin PIN, sin código TCN).
--    Una cuenta 'admin' de @notstudio.cl es soporte de NotStudio -> rol 'notstudio'.
--    Idempotente por email.
INSERT INTO empleados (nombre, email, password_hash, rol, activo, pin_hash, usuario, last_login_at, created_at, updated_at)
SELECT au.nombre, lower(au.email), au.password_hash,
       CASE WHEN au.rol = 'admin' AND lower(au.email) LIKE '%@notstudio.cl' THEN 'notstudio' ELSE au.rol END,
       au.activo, NULL, NULL, au.last_login_at, au.created_at, au.updated_at
FROM admin_users au
WHERE NOT EXISTS (SELECT 1 FROM empleados e WHERE lower(e.email) = lower(au.email));

-- 3) re-apuntar las FKs admin_users -> empleados, remapeando los ids ya guardados
--    (los ids cambian: se resuelven por email). Primero se sueltan las FKs viejas.
ALTER TABLE audit_log              DROP CONSTRAINT IF EXISTS audit_log_admin_user_id_fkey;
ALTER TABLE app_settings           DROP CONSTRAINT IF EXISTS app_settings_updated_by_fkey;
ALTER TABLE notification_channels  DROP CONSTRAINT IF EXISTS notification_channels_updated_by_fkey;
ALTER TABLE notification_templates DROP CONSTRAINT IF EXISTS notification_templates_updated_by_fkey;
ALTER TABLE rut_grupos_revisados   DROP CONSTRAINT IF EXISTS rut_grupos_revisados_revisado_por_fkey;

CREATE TEMP TABLE _map_admin_empleado ON COMMIT DROP AS
  SELECT au.id AS old_id, e.id AS new_id
  FROM admin_users au JOIN empleados e ON lower(e.email) = lower(au.email);

-- LEFT JOIN: un id que ya no exista en admin_users (usuario borrado) queda en NULL, no huérfano.
UPDATE audit_log t              SET admin_user_id = (SELECT m.new_id FROM _map_admin_empleado m WHERE m.old_id = t.admin_user_id) WHERE t.admin_user_id IS NOT NULL;
UPDATE app_settings t           SET updated_by    = (SELECT m.new_id FROM _map_admin_empleado m WHERE m.old_id = t.updated_by)    WHERE t.updated_by IS NOT NULL;
UPDATE notification_channels t  SET updated_by    = (SELECT m.new_id FROM _map_admin_empleado m WHERE m.old_id = t.updated_by)    WHERE t.updated_by IS NOT NULL;
UPDATE notification_templates t SET updated_by    = (SELECT m.new_id FROM _map_admin_empleado m WHERE m.old_id = t.updated_by)    WHERE t.updated_by IS NOT NULL;
UPDATE rut_grupos_revisados t   SET revisado_por  = (SELECT m.new_id FROM _map_admin_empleado m WHERE m.old_id = t.revisado_por)  WHERE t.revisado_por IS NOT NULL;

-- ON DELETE SET NULL: borrar a una persona nunca debe fallar ni borrar historial por estas columnas.
ALTER TABLE audit_log              ADD CONSTRAINT audit_log_admin_user_id_fkey           FOREIGN KEY (admin_user_id) REFERENCES empleados(id) ON DELETE SET NULL;
ALTER TABLE app_settings           ADD CONSTRAINT app_settings_updated_by_fkey           FOREIGN KEY (updated_by)    REFERENCES empleados(id) ON DELETE SET NULL;
ALTER TABLE notification_channels  ADD CONSTRAINT notification_channels_updated_by_fkey  FOREIGN KEY (updated_by)    REFERENCES empleados(id) ON DELETE SET NULL;
ALTER TABLE notification_templates ADD CONSTRAINT notification_templates_updated_by_fkey FOREIGN KEY (updated_by)    REFERENCES empleados(id) ON DELETE SET NULL;
ALTER TABLE rut_grupos_revisados   ADD CONSTRAINT rut_grupos_revisados_revisado_por_fkey FOREIGN KEY (revisado_por)  REFERENCES empleados(id) ON DELETE SET NULL;

-- 4) adiós tabla duplicada
DROP TABLE admin_users;

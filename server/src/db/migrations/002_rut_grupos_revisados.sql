-- Condor 360 — RUTs compartidos por múltiples locales/contactos (ej. Burger King)
--
-- Diseño confirmado: cada local sigue siendo su propia fila en `clientes` (nunca se
-- fuerza fusión). Esta tabla solo marca un grupo de rut_normalizado como "revisado,
-- no son duplicados" para sacarlo del listado de clientesRepo.listarDuplicados().
-- La vista de "otros locales con este mismo RUT" en la ficha del cliente NO usa esta
-- tabla — es una consulta directa por rut_normalizado (ver clientesRepo.getOtrosClientesMismoRut).

CREATE TABLE rut_grupos_revisados (
  rut_normalizado  text PRIMARY KEY,
  revisado_por     bigint NULL REFERENCES admin_users(id),
  revisado_at      timestamptz NOT NULL DEFAULT now()
);

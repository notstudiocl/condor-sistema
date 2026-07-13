// Carga mínima de variables de entorno desde archivos .env, sin dependencia de dotenv
// (migration/ es un paquete self-contained, ver package.json).
//
// No pisa variables que ya estén en process.env (una shell que hizo
// `set -a; source .env.staging; set +a` antes de correr el script tiene prioridad).
import fs from 'node:fs';

export function loadEnvFile(path) {
  if (!fs.existsSync(path)) return false;
  const content = fs.readFileSync(path, 'utf8');
  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
  return true;
}

export function requireEnv(keys) {
  const missing = keys.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    throw new Error(
      `Faltan variables de entorno requeridas: ${missing.join(', ')}. ` +
      `Verifica que .env (raíz, Airtable) y server/.env.staging (Postgres/R2) se hayan cargado.`
    );
  }
}

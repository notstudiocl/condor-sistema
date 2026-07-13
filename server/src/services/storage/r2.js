import { S3Client, PutObjectCommand, HeadObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';

// Cliente genérico contra Cloudflare R2 (API compatible con S3).
// Sin nada específico del backend HTTP: lo reusan tanto ordenService (F2b) como
// el migrador histórico (F2d).

let client = null;

function getClient() {
  if (client) return client;

  const endpoint = process.env.R2_ENDPOINT;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

  if (!endpoint || !accessKeyId || !secretAccessKey) {
    throw new Error('R2_ENDPOINT / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY no están definidas');
  }

  client = new S3Client({
    region: 'auto',
    endpoint,
    credentials: { accessKeyId, secretAccessKey },
  });
  return client;
}

function getBucket() {
  const bucket = process.env.R2_BUCKET_NAME;
  if (!bucket) throw new Error('R2_BUCKET_NAME no está definida');
  return bucket;
}

/**
 * Sube un buffer a R2 bajo `key` y devuelve la key (no la URL — la URL pública
 * se arma en runtime con buildPublicUrl, así puede cambiar de dominio sin re-subir nada).
 */
export async function uploadBuffer(key, buffer, contentType, { abortSignal } = {}) {
  if (!key) throw new Error('uploadBuffer requiere key');
  if (!buffer) throw new Error('uploadBuffer requiere buffer');

  await getClient().send(
    new PutObjectCommand({
      Bucket: getBucket(),
      Key: key,
      Body: buffer,
      ContentType: contentType || 'application/octet-stream',
    }),
    abortSignal ? { abortSignal } : undefined
  );
  return key;
}

/**
 * Arma la URL pública para una key ya subida. R2_PUBLIC_URL es el dominio público
 * del bucket (o dominio propio) — cambiarlo es 1 env var, sin tocar datos.
 */
export function buildPublicUrl(key) {
  const publicUrl = process.env.R2_PUBLIC_URL;
  if (!publicUrl) throw new Error('R2_PUBLIC_URL no está definida');
  return `${publicUrl.replace(/\/+$/, '')}/${key}`;
}

/**
 * Borra un objeto de R2 — usado (best-effort, nunca crítico) cuando el admin elimina
 * una foto puntual de una orden. Si falla, el caller solo debe loguear: la fila de
 * orden_fotos ya se borró en Postgres, que es la fuente de verdad; un objeto huérfano
 * en R2 no afecta nada (mismo criterio que eliminarOrden en ordenesRepo).
 */
export async function deleteObject(key) {
  if (!key) return;
  await getClient().send(new DeleteObjectCommand({ Bucket: getBucket(), Key: key }));
}

/**
 * HeadObject — usado por el migrador (F2d) para idempotencia: si la key ya existe
 * en R2, no se re-sube. Devuelve los metadatos si existe, null si no (404),
 * y relanza cualquier otro error (permisos, red, etc.) para no ocultar problemas reales.
 */
export async function headObject(key) {
  try {
    return await getClient().send(new HeadObjectCommand({ Bucket: getBucket(), Key: key }));
  } catch (err) {
    if (err?.$metadata?.httpStatusCode === 404 || err?.name === 'NotFound') {
      return null;
    }
    throw err;
  }
}

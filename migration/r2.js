// Cliente R2 (S3-compatible) + manifest de idempotencia para el migrador.
// Convención de keys (plan sección 4):
//   ordenes/{numero5}/[antes|despues|firma|pdf]/{index}-{slug}.{ext}
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { S3Client, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { downloadAttachment } from './airtable.js';
import { baseName, extFromContentType, slugify } from './utils.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MANIFEST_PATH = path.join(__dirname, 'r2-manifest.json');

let s3Client;
export function getS3Client() {
  if (s3Client) return s3Client;
  const { R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY } = process.env;
  if (!R2_ENDPOINT || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
    throw new Error('R2_ENDPOINT / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY no están definidas');
  }
  s3Client = new S3Client({
    region: 'auto',
    endpoint: R2_ENDPOINT,
    credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
  });
  return s3Client;
}

export function loadManifest() {
  if (!fs.existsSync(MANIFEST_PATH)) return {};
  try {
    return JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  } catch (e) {
    console.warn(`  [r2-manifest] no se pudo parsear ${MANIFEST_PATH}, se parte de uno vacío:`, e.message);
    return {};
  }
}

export function saveManifest(manifest) {
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
}

export function buildR2Key(numeroOrdenDisplay, tipo, index, filename) {
  const ext = extFromContentType(null, filename);
  const slug = slugify(baseName(filename));
  return `ordenes/${numeroOrdenDisplay}/${tipo}/${index}-${slug}.${ext}`;
}

async function headObjectSize(key) {
  try {
    const res = await getS3Client().send(
      new HeadObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key: key })
    );
    return res.ContentLength ?? null;
  } catch (e) {
    if (e.name === 'NotFound' || e.$metadata?.httpStatusCode === 404) return null;
    throw e;
  }
}

/**
 * Sube (o confirma que ya existe) un attachment de Airtable en R2. Re-ejecutable:
 * 1) si el manifest dice 'done' con el mismo size -> salta
 * 2) si no, intenta HeadObject contra la key esperada como respaldo -> salta si coincide
 * 3) si no, descarga de Airtable AHORA (la URL expira en ~2h) y sube a R2
 */
export async function ensureAttachmentUploaded(manifest, { attachmentId, url, filename, size, contentType, r2Key }) {
  const cached = manifest[attachmentId];
  if (cached && cached.status === 'done' && cached.r2Key === r2Key && cached.size === size) {
    return { r2Key, size, contentType, skipped: 'manifest' };
  }

  const existingSize = await headObjectSize(r2Key);
  if (existingSize !== null && existingSize === size) {
    manifest[attachmentId] = { r2Key, status: 'done', size, contentType, backfilled: true };
    return { r2Key, size, contentType, skipped: 'r2-head' };
  }

  const buffer = await downloadAttachment(url);
  await getS3Client().send(
    new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: r2Key,
      Body: buffer,
      ContentType: contentType || 'application/octet-stream',
    })
  );
  manifest[attachmentId] = { r2Key, status: 'done', size: buffer.length, contentType };
  return { r2Key, size: buffer.length, contentType, skipped: false };
}

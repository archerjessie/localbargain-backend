// Offer images in S3 behind CloudFront (design D11). Locally the bucket is MinIO.
import { DeleteObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { createPresignedPost } from '@aws-sdk/s3-presigned-post';
import { randomUUID } from 'node:crypto';
import { s3Client, s3PresignClient } from './clients.js';

// shortcut: orphaned uploads (presigned but never attached, or failed deletes) are not swept; add an S3 lifecycle rule or sweep job if storage grows

export type ImageContentType = 'image/jpeg' | 'image/png' | 'image/webp';

const EXTENSION: Record<ImageContentType, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const MAX_BYTES = 2 * 1024 * 1024;
const EXPIRES_SECONDS = 5 * 60;

function bucket(): string {
  const name = process.env.IMAGE_BUCKET;
  if (!name) throw new Error('IMAGE_BUCKET is not set');
  return name;
}

export const imageKeyPrefix = (merchantId: string, offerId: string) => `offers/${merchantId}/${offerId}/`;

// POST, not PUT: only a POST policy can cap the size. A new key per upload means CloudFront never serves a stale image.
export async function createImageUpload(merchantId: string, offerId: string, contentType: ImageContentType) {
  const imageKey = `${imageKeyPrefix(merchantId, offerId)}${randomUUID()}.${EXTENSION[contentType]}`;
  const expiresAt = new Date(Date.now() + EXPIRES_SECONDS * 1000).toISOString();
  const upload = await createPresignedPost(s3PresignClient(), {
    Bucket: bucket(),
    Key: imageKey,
    Fields: { 'Content-Type': contentType },
    Conditions: [
      ['content-length-range', 1, MAX_BYTES],
      ['eq', '$Content-Type', contentType],
    ],
    Expires: EXPIRES_SECONDS,
  });
  return { imageKey, upload: { url: upload.url, fields: upload.fields }, expiresAt };
}

export async function imageExists(key: string): Promise<boolean> {
  try {
    await s3Client().send(new HeadObjectCommand({ Bucket: bucket(), Key: key }));
    return true;
  } catch (error) {
    // Without s3:ListBucket, S3 answers a missing key with 403 rather than 404.
    const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
    if (status === 403 || status === 404) return false;
    throw error;
  }
}

// Called after the DynamoDB write. A failed delete only leaves an orphan, so it is logged, not raised (design D11).
export async function deleteImage(key: string): Promise<void> {
  try {
    await s3Client().send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }));
  } catch (error) {
    console.error(`Could not delete image ${key}`, error);
  }
}

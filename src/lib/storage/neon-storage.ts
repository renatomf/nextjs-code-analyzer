import "server-only";

import {
  DeleteObjectCommand,
  GetObjectCommand,
  ListBucketsCommand,
  PutBucketCorsCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { createPresignedPost } from "@aws-sdk/s3-presigned-post";

/**
 * Neon Object Storage (ADR-011): S3-compatible, branch-scoped. Read from our
 * own NEON_STORAGE_* names, never the AWS_* ones Vercel may inject into a
 * function. Credentials are created per Neon branch (preview ≠ production).
 */
type StorageConfig = {
  endpoint: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
};

export function storageConfig(env: NodeJS.ProcessEnv = process.env): StorageConfig | null {
  const config = {
    endpoint: env.NEON_STORAGE_ENDPOINT,
    region: env.NEON_STORAGE_REGION,
    accessKeyId: env.NEON_STORAGE_ACCESS_KEY_ID,
    secretAccessKey: env.NEON_STORAGE_SECRET_ACCESS_KEY,
    bucket: env.NEON_STORAGE_BUCKET,
  };
  return Object.values(config).every(Boolean) ? (config as StorageConfig) : null;
}

export function storageClient(config: StorageConfig, endpoint = config.endpoint): S3Client {
  return new S3Client({
    endpoint,
    region: config.region,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    forcePathStyle: true, // Neon only supports path-style addressing
  });
}

/**
 * A short-lived POST the browser sends the file with. The size range and the
 * content type are part of the signed policy: the bucket refuses anything
 * else, whatever the browser claims.
 */
export function presignedUpload(config: StorageConfig, key: string, maxBytes: number) {
  return createPresignedPost(storageClient(config), {
    Bucket: config.bucket,
    Key: key,
    Conditions: [
      ["content-length-range", 1, maxBytes],
      ["eq", "$Content-Type", "application/zip"],
    ],
    Fields: { "Content-Type": "application/zip" },
    Expires: 300,
  });
}

export async function readObject(config: StorageConfig, key: string): Promise<Uint8Array> {
  const response = await storageClient(config).send(
    new GetObjectCommand({ Bucket: config.bucket, Key: key }),
  );
  return (await response.Body?.transformToByteArray()) ?? new Uint8Array();
}

export async function deleteObject(config: StorageConfig, key: string): Promise<void> {
  await storageClient(config).send(new DeleteObjectCommand({ Bucket: config.bucket, Key: key }));
}

/** Lets the app's origins POST to the bucket from the browser (upload only). */
export async function allowBrowserUploads(config: StorageConfig, origins: string[]): Promise<void> {
  await storageClient(config).send(
    new PutBucketCorsCommand({
      Bucket: config.bucket,
      CORSConfiguration: {
        CORSRules: [
          {
            AllowedOrigins: origins,
            AllowedMethods: ["POST"],
            AllowedHeaders: ["*"],
            MaxAgeSeconds: 600,
          },
        ],
      },
    }),
  );
}

/** For the isolation check: lists buckets through another branch's endpoint. */
export async function listBucketsAt(config: StorageConfig, endpoint: string) {
  return storageClient(config, endpoint).send(new ListBucketsCommand({}));
}

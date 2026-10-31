// AWS clients. Locally (design D9) they point at DynamoDB Local and MinIO through the endpoints in local/env.json.
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { S3Client } from '@aws-sdk/client-s3';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

const env = (name: string) => process.env[name] || undefined;

let dynamo: DynamoDBDocumentClient | undefined;
let s3: S3Client | undefined;
let s3Presign: S3Client | undefined;

export function dynamoClient(): DynamoDBDocumentClient {
  const endpoint = env('DYNAMODB_ENDPOINT');
  dynamo ??= DynamoDBDocumentClient.from(
    new DynamoDBClient(
      // DynamoDB Local accepts any credentials, and sam local may have none to pass on.
      endpoint ? { endpoint, region: 'ap-southeast-2', credentials: { accessKeyId: 'local', secretAccessKey: 'local' } } : {},
    ),
    { marshallOptions: { removeUndefinedValues: true } },
  );
  return dynamo;
}

function s3For(endpoint: string | undefined): S3Client {
  if (!endpoint) return new S3Client({});
  return new S3Client({
    endpoint,
    region: 'ap-southeast-2',
    forcePathStyle: true,
    credentials: { accessKeyId: env('S3_ACCESS_KEY_ID') ?? '', secretAccessKey: env('S3_SECRET_ACCESS_KEY') ?? '' },
  });
}

// For HeadObject and DeleteObject. Locally this is MinIO on the Docker network.
export function s3Client(): S3Client {
  s3 ??= s3For(env('S3_ENDPOINT'));
  return s3;
}

// For presigned POSTs. Locally this is MinIO at the address the emulator can reach (http://10.0.2.2:9000).
export function s3PresignClient(): S3Client {
  s3Presign ??= s3For(env('S3_PUBLIC_ENDPOINT') ?? env('S3_ENDPOINT'));
  return s3Presign;
}

export function tableName(): string {
  const name = env('TABLE_NAME');
  if (!name) throw new Error('TABLE_NAME is not set');
  return name;
}

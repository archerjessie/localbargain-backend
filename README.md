# localbargain-backend

Backend API for LocalBargain. The contract is [`openapi.yaml`](openapi.yaml).

## Infrastructure

The stack is defined in `template.yaml` (AWS SAM) and deployed to `ap-southeast-2`.

### One-time setup: the QR signing key

QR values are signed with a 32-byte HMAC key kept in SSM Parameter Store as a `SecureString`. This uses the standard tier and the AWS-managed KMS key, so it has no monthly cost. Only the `consumer` and `merchant` functions can read it. The parameter holds the key **base64-encoded**, and the functions decode it back to 32 bytes. `local/env.json` uses the same encoding. Create it once per account before the first deploy:

```sh
aws ssm put-parameter \
  --region ap-southeast-2 \
  --name /localbargain/dev/qr-key \
  --type SecureString \
  --value "$(openssl rand -base64 32)"
```

Rotating the key invalidates every QR value already issued. Each function reads the key once per cold start, so after `aws ssm put-parameter --overwrite` you must redeploy (`sam deploy`). Otherwise warm containers keep signing or verifying with the old key, and scans fail at random until every container recycles. After the redeploy, the consumer app gets a valid value the next time it fetches the QR code.

### Deleting the stack

`sam delete` removes the table and its data. Export the table first if the data matters. It also fails while the image bucket holds objects, so empty the bucket first:

```sh
aws s3 rm "s3://$(aws cloudformation describe-stacks --stack-name <stack> --query "Stacks[0].Outputs[?OutputKey=='ImageBucketName'].OutputValue" --output text)" --recursive
```

### Consumer sign-in (Cognito)

The consumer user pool uses the **Lite** feature tier, which is set explicitly because new pools default to Essentials. Lite is the lowest tier that supports the classic hosted UI and Google and Apple sign-in. It includes 10,000 monthly active users (MAU) free per account, then costs from USD 0.0055 per MAU (Essentials costs USD 0.015). Google and Apple users count as normal MAUs. Pools created on or before 22 November 2024 keep a legacy free tier of 50,000 MAU.

Google and Apple sign-in are optional. If `GoogleClientId`/`GoogleClientSecret`, or all four `Apple*` parameters, are left empty, that provider is not created, and email and password sign-in still works. `scripts/deploy.sh` (task 8.1) reads the secrets from SSM.

### Product images and CloudFront

Images live in a private S3 bucket that CloudFront reads through Origin Access Control. The distribution uses `PriceClass_All`, because Australia and New Zealand edge locations are only in that class. `PriceClass_100` and `PriceClass_200` leave them out, so Australian users would be served from Asia or the US. At test traffic the cost stays inside CloudFront's always-free tier: 1 TB of transfer and 10,000,000 requests per month.

## Data sources

### Localities (`src/reference/localities.json`)

`GET /locations` searches a list of Australian suburbs with their state, postcode, and centroid coordinates.

- Source: the [Australian Postcodes](https://github.com/matthewproctor/australianpostcodes) dataset by Matthew Proctor, file `australian_postcodes.csv`, commit `eda59e4a987d46dbfb1d6bc644a383d322aa3d8d` (2025-09-07).
- Licence: the dataset does not state a licence. Its README says some of its data comes from Australia Post and is "technically not meant to be republished". The project owner chose this dataset knowing this, and accepted the risk of redistributing it in this repository.
- Only `Delivery Area` rows are kept (no PO boxes or large-volume receivers). Coordinates use `Lat_precise`/`Long_precise` where present, otherwise `lat`/`long`, rounded to 4 decimal places. Rows with no coordinates are dropped.

To rebuild the file from a downloaded CSV:

```sh
node scripts/build-localities.ts path/to/australian_postcodes.csv
```

The script needs Node.js 23.6 or later, which runs TypeScript files directly.

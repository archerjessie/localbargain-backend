# localbargain-backend

Backend API for LocalBargain. The contract is [`openapi.yaml`](openapi.yaml).

## Local mode

The consumer and merchant apps develop against a local copy of the API, with no AWS account. It runs `sam local` against DynamoDB Local and MinIO in Docker (design D9).

You need Docker, Node.js 22 or later, and the AWS SAM CLI. Run these from the repository root:

```sh
npm ci
docker compose up -d --wait   # DynamoDB Local on :8000, MinIO on :9000 (console :9001)
npm run seed:local            # creates the table and writes the test shops, offers, and one image
npm run build                 # sam build
sam local start-api --env-vars local/env.json --docker-network localbargain
```

The API is then at `http://localhost:3000`. The Android emulator reaches it at **`http://10.0.2.2:3000`**, and the offer images at `http://10.0.2.2:9000/localbargain-images/...`.

Local mode has no sign-in. Each request names its caller in the `x-debug-sub` header, using one of the fixed test users in `local/users.json`:

| `x-debug-sub` | Pool | Notes |
|---|---|---|
| `local-consumer-1` | consumer | display name Alex |
| `local-consumer-2` | consumer | display name Sam |
| `local-merchant-1` | merchant | owns Bean There, Melbourne |
| `local-merchant-2` | merchant | owns Harbour Bakery, Sydney |

A missing or unknown sub, or a sub from the wrong pool for the route, gets 401, as the deployed API would. The header only works when both `LOCAL_AUTH=1` (from `local/env.json`) and `AWS_SAM_LOCAL=true` (set by `sam local`) are present, so it has no effect on a deployed stack.

```sh
curl -H "x-debug-sub: local-consumer-1" "localhost:3000/discovery?lat=-37.8136&lng=144.9631"
```

`npm run seed:local` also prints a ready `qrValue` for `local-consumer-1` and the Flat white offer. Paste it into the merchant app to test a scan on an emulator that has no camera. In local mode `DELETE /me` anonymises the redemptions but keeps the test user, so you can sign in as it again.

`local/env.json` holds a QR signing key that is public on purpose. The functions use it only in local mode. A deployed stack always reads its key from SSM.

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

Rotating the key invalidates every QR value already issued. Each function reads the key once per cold start, so after `aws ssm put-parameter --overwrite` run `scripts/deploy.sh`. It passes the key's new SSM version to the functions as `QR_KEY_VERSION`, which replaces every warm container. Without that, warm containers keep signing or verifying with the old key, and scans fail at random until every container recycles. After the deploy, the consumer app gets a valid value the next time it fetches the QR code.

### Deploying

Always deploy with `scripts/deploy.sh`, never a plain `sam deploy`. The script reads its parameters from SSM under `/localbargain/dev`, so no secrets or personal data sit in this public repository:

| Parameter | Type | |
|---|---|---|
| `qr-key` | SecureString | required, see above |
| `budget-email` | String | required, the address for the USD 5 per month budget alarm |
| `google-client-id`, `google-client-secret` | String, SecureString | optional, set both or neither |
| `apple-services-id`, `apple-team-id`, `apple-key-id`, `apple-private-key` | String (last one SecureString) | optional, set all four or none |

```sh
aws ssm put-parameter --region ap-southeast-2 --name /localbargain/dev/budget-email --type String --value "you@example.com"
scripts/deploy.sh                  # build, package, create a change set, and execute it
REVIEW_ONLY=1 scripts/deploy.sh    # create the change set and stop, so you can inspect it first
```

The script passes the values in a private file (mode 600, deleted on exit), not on the command line, so secrets never show in the process list. It refuses to deploy when the stack already has a Google or Apple provider whose parameters are missing from SSM, because CloudFormation would delete the provider and still report success. A first deploy with `REVIEW_ONLY=1` leaves the stack in `REVIEW_IN_PROGRESS`. Delete that stack, or run the script again without the flag.

The budget alarm (`localbargain-monthly-usd-5`) emails when actual spend passes USD 5 in a month, and earlier when the month's forecast does. AWS Budgets track the whole account, not only this stack.

### Deleting the stack

`sam delete` removes the table and its data. Export the table first if the data matters. It also fails while the image bucket holds objects, so empty the bucket first:

```sh
aws s3 rm "s3://$(aws cloudformation describe-stacks --stack-name <stack> --query "Stacks[0].Outputs[?OutputKey=='ImageBucketName'].OutputValue" --output text)" --recursive
```

### Consumer sign-in (Cognito)

The consumer user pool uses the **Lite** feature tier, which is set explicitly because new pools default to Essentials. Lite is the lowest tier that supports the classic hosted UI and Google and Apple sign-in. It includes 10,000 monthly active users (MAU) free per account, then costs from USD 0.0055 per MAU (Essentials costs USD 0.015). Google and Apple users count as normal MAUs. Pools created on or before 22 November 2024 keep a legacy free tier of 50,000 MAU.

Google and Apple sign-in are optional. If `GoogleClientId`/`GoogleClientSecret`, or all four `Apple*` parameters, are left empty, that provider is not created, and email and password sign-in still works. A provider that is only half configured fails the deploy (template `Rules`). `scripts/deploy.sh` reads the secrets from SSM (see Deploying).

> **Warning:** a deploy without the federation parameters deletes any Google or Apple provider that already exists, and the deploy still succeeds. `scripts/deploy.sh` refuses such a deploy.

Both pools send email with Cognito's default sender, which allows about 50 emails per day per account. That covers verification codes, password resets, and merchant invitations. It is enough for testing. Switch to Amazon SES before a public launch.

Consumers sign in through the hosted UI with authorization code + PKCE. Cognito does not require `code_challenge` from a public client, so the consumer app must always send it.

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

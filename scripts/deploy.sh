#!/usr/bin/env bash
# Builds and deploys the dev stack to ap-southeast-2 (design D3, D8).
#
# Secrets and personal data never live in this repo. They come from SSM Parameter Store under /localbargain/dev:
#   qr-key                 SecureString  required, see README (its version is passed on, so a rotation recycles the functions)
#   budget-email           String        required, the address for the USD 5 budget alarm
#   google-client-id       String        optional, Google sign-in (set both or neither)
#   google-client-secret   SecureString  optional
#   apple-services-id      String        optional, Sign in with Apple (set all four or none)
#   apple-team-id          String        optional
#   apple-key-id           String        optional
#   apple-private-key      SecureString  optional
#
# Runs as the CloudFormation service role from bootstrap.yaml, which must be deployed first (see README).
#
# Usage: scripts/deploy.sh
#   REVIEW_ONLY=1 scripts/deploy.sh   creates the change set and stops, so you can inspect it without changing anything.
set -euo pipefail

stack="localbargain-dev"
region="ap-southeast-2"
prefix="/localbargain/dev"
# Git Bash on Windows would otherwise rewrite the /localbargain/... parameter names into Windows paths.
export MSYS_NO_PATHCONV=1

cd "$(dirname "$0")/.."
mkdir -p .aws-sam
# Parameters go in a private file, not on the command line, so secrets never show in the process list.
params=".aws-sam/deploy-parameters.json"
err=".aws-sam/deploy-error.txt"
trap 'rm -f "$params" "$err"' EXIT
umask 077

die() { echo "deploy: $*" >&2; exit 1; }
# Git Bash on Windows finds the SAM CLI only as sam.cmd.
command -v sam >/dev/null || sam() { sam.cmd "$@"; }

# JSON output throughout: no CRLF from aws.exe on Windows, and stderr never mixes into a value.
ssm_json="$(aws ssm get-parameters-by-path --region "$region" --path "$prefix" --with-decryption --output json 2>"$err")" ||
  die "reading SSM $prefix failed: $(cat "$err")"

if stack_json="$(aws cloudformation describe-stacks --region "$region" --stack-name "$stack" --output json 2>"$err")"; then
  # A stack whose first change set never ran has no resources yet and only takes a CREATE change set.
  status="$(node -e 'process.stdout.write(JSON.parse(process.argv[1]).Stacks[0].StackStatus)' "$stack_json")"
  [[ "$status" == REVIEW_IN_PROGRESS ]] && change_set_type=CREATE || change_set_type=UPDATE
  pool_id="$(node -e 'const o=JSON.parse(process.argv[1]).Stacks[0].Outputs??[];process.stdout.write(o.find(x=>x.OutputKey==="ConsumerUserPoolId")?.OutputValue??"")' "$stack_json")"
elif grep -q "does not exist" "$err"; then
  change_set_type=CREATE
  pool_id=""
else
  # Fail closed: without knowing the stack, the provider guard below cannot run.
  die "describing stack $stack failed: $(cat "$err")"
fi

providers_json='{"Providers":[]}'
if [[ -n "$pool_id" ]]; then
  providers_json="$(aws cognito-idp list-identity-providers --region "$region" --user-pool-id "$pool_id" --output json 2>"$err")" ||
    die "listing identity providers failed: $(cat "$err")"
fi

# Builds the CloudFormation parameter file, and refuses to drop a provider the stack already has
# (a deploy without its parameters would delete it, and CloudFormation would still report success).
node scripts/deploy-parameters.mjs "$ssm_json" "$providers_json" "$prefix" "$params"

# The service role comes from bootstrap.yaml (see README, Deploying). The artifact bucket is made here on first use.
account="$(aws sts get-caller-identity --query Account --output text | tr -d '\r')"
role_arn="arn:aws:iam::$account:role/localbargain-cfn-deploy"
bucket="localbargain-artifacts-$account-$region"
if ! aws s3api head-bucket --region "$region" --bucket "$bucket" >/dev/null 2>&1; then
  aws s3api create-bucket --region "$region" --bucket "$bucket" \
    --create-bucket-configuration LocationConstraint="$region" --output text >/dev/null
fi

# npm run build puts node_modules/.bin on PATH, so sam finds esbuild.
npm run build
sam package --region "$region" --s3-bucket "$bucket" --output-template-file .aws-sam/packaged.yaml

change_set="deploy-$(date +%Y%m%d%H%M%S)"
aws cloudformation create-change-set --region "$region" --stack-name "$stack" --change-set-name "$change_set" \
  --change-set-type "$change_set_type" --template-body file://.aws-sam/packaged.yaml --parameters file://"$params" \
  --role-arn "$role_arn" --capabilities CAPABILITY_IAM CAPABILITY_AUTO_EXPAND --output text --query Id >/dev/null

if ! aws cloudformation wait change-set-create-complete --region "$region" --stack-name "$stack" --change-set-name "$change_set" 2>"$err"; then
  reason="$(aws cloudformation describe-change-set --region "$region" --stack-name "$stack" --change-set-name "$change_set" --query StatusReason --output text)"
  if [[ "$reason" == *"didn't contain changes"* || "$reason" == *"No updates are to be performed"* ]]; then
    aws cloudformation delete-change-set --region "$region" --stack-name "$stack" --change-set-name "$change_set"
    echo "deploy: no changes"
    exit 0
  fi
  die "change set failed: $reason"
fi

aws cloudformation describe-change-set --region "$region" --stack-name "$stack" --change-set-name "$change_set" \
  --query 'Changes[].ResourceChange.[Action,LogicalResourceId,ResourceType]' --output table

if [[ "${REVIEW_ONLY:-}" == 1 ]]; then
  echo "deploy: change set $change_set created and not executed (REVIEW_ONLY=1)"
  exit 0
fi

aws cloudformation execute-change-set --region "$region" --stack-name "$stack" --change-set-name "$change_set"
if [[ "$change_set_type" == CREATE ]]; then
  aws cloudformation wait stack-create-complete --region "$region" --stack-name "$stack"
else
  aws cloudformation wait stack-update-complete --region "$region" --stack-name "$stack"
fi
aws cloudformation describe-stacks --region "$region" --stack-name "$stack" --query 'Stacks[0].Outputs' --output table

#!/usr/bin/env bash
# Builds and deploys the dev stack to ap-southeast-2 (design D3, D8).
#
# Secrets and personal data never live in this repo. They come from SSM Parameter Store (create them once):
#   /localbargain/dev/budget-email           String        required, the address for the USD 5 budget alarm
#   /localbargain/dev/google-client-id       String        optional, Google sign-in
#   /localbargain/dev/google-client-secret   SecureString  optional
#   /localbargain/dev/apple-services-id      String        optional, Sign in with Apple
#   /localbargain/dev/apple-team-id          String        optional
#   /localbargain/dev/apple-key-id           String        optional
#   /localbargain/dev/apple-private-key      SecureString  optional
# BUDGET_EMAIL in the environment overrides the SSM value.
#
# Usage: scripts/deploy.sh [extra sam deploy arguments, for example --no-execute-changeset]
set -euo pipefail

stack="localbargain-dev"
region="ap-southeast-2"
prefix="/localbargain/dev"
# Git Bash on Windows would otherwise rewrite the /localbargain/... parameter names into Windows paths.
export MSYS_NO_PATHCONV=1

# Prints the parameter's value, or nothing when it does not exist. Any other error stops the script.
ssm() {
  local out
  if out="$(aws ssm get-parameter --region "$region" --name "$prefix/$1" --with-decryption --query Parameter.Value --output text 2>&1)"; then
    printf '%s' "$out"
  elif [[ "$out" == *ParameterNotFound* ]]; then
    printf ''
  else
    echo "reading $prefix/$1 failed: $out" >&2
    exit 1
  fi
}

budget_email="${BUDGET_EMAIL:-$(ssm budget-email)}"
[[ -n "$budget_email" ]] || { echo "set $prefix/budget-email in SSM (or BUDGET_EMAIL) first" >&2; exit 1; }

google_id="$(ssm google-client-id)"
google_secret="$(ssm google-client-secret)"
apple_services_id="$(ssm apple-services-id)"
apple_team_id="$(ssm apple-team-id)"
apple_key_id="$(ssm apple-key-id)"
apple_private_key="$(ssm apple-private-key)"

# A deploy without a provider's secrets deletes that provider, and CloudFormation still reports success.
# Refuse when the stack already has one but SSM has no secrets for it.
existing_providers="$(aws cognito-idp list-identity-providers --region "$region" \
  --user-pool-id "$(aws cloudformation describe-stacks --region "$region" --stack-name "$stack" \
    --query "Stacks[0].Outputs[?OutputKey=='ConsumerUserPoolId'].OutputValue" --output text 2>/dev/null || true)" \
  --query 'Providers[].ProviderName' --output text 2>/dev/null || true)"
if [[ "$existing_providers" == *Google* && -z "$google_secret" ]]; then
  echo "the stack has Google sign-in but $prefix/google-client-secret is empty; refusing to delete the provider" >&2
  exit 1
fi
if [[ "$existing_providers" == *SignInWithApple* && -z "$apple_private_key" ]]; then
  echo "the stack has Sign in with Apple but $prefix/apple-private-key is empty; refusing to delete the provider" >&2
  exit 1
fi

# npm run build puts node_modules/.bin on PATH, so sam finds esbuild.
npm run build

sam deploy \
  --stack-name "$stack" \
  --region "$region" \
  --resolve-s3 \
  --capabilities CAPABILITY_IAM \
  --no-fail-on-empty-changeset \
  --parameter-overrides \
    "BudgetEmail=$budget_email" \
    "GoogleClientId=$google_id" \
    "GoogleClientSecret=$google_secret" \
    "AppleServicesId=$apple_services_id" \
    "AppleTeamId=$apple_team_id" \
    "AppleKeyId=$apple_key_id" \
    "ApplePrivateKey=$apple_private_key" \
  "$@"

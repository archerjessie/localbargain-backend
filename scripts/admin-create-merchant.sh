#!/usr/bin/env bash
# Creates a merchant account and shop on the deployed stack (design D3).
# The request is signed with SigV4 by awscurl, using your current AWS credentials, which need execute-api:Invoke.
#
# Usage: scripts/admin-create-merchant.sh <merchant.json> [stack-name]
#   merchant.json holds the POST /admin/merchants body, for example:
#   {"name":"Bean There","shopType":"cafe","street":"211 Swanston St","suburb":"Melbourne","state":"VIC",
#    "postcode":"3000","lat":-37.8117,"lng":144.9652,"email":"owner@example.com"}
set -euo pipefail

body_file="${1:?usage: $0 <merchant.json> [stack-name]}"
stack="${2:-localbargain-dev}"
region="ap-southeast-2"

command -v awscurl >/dev/null || { echo "awscurl is not installed (pip install awscurl)" >&2; exit 1; }
[[ -f "$body_file" ]] || { echo "no such file: $body_file" >&2; exit 1; }

api_url="$(aws cloudformation describe-stacks --region "$region" --stack-name "$stack" \
  --query "Stacks[0].Outputs[?OutputKey=='ApiUrl'].OutputValue" --output text | tr -d '')"
[[ -n "$api_url" && "$api_url" != "None" ]] || { echo "stack $stack has no ApiUrl output" >&2; exit 1; }

# --fail-with-body exits non-zero on 4xx/5xx and still prints the {code, message} body.
awscurl --service execute-api --region "$region" -X POST \
  -H 'content-type: application/json' --fail-with-body \
  -d "$(cat "$body_file")" "$api_url/admin/merchants"
echo

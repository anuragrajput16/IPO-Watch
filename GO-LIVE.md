# Go live — start to finish

One pass, in order. Each step produces a value the next one needs, so don't skip
around. Budget about an hour the first time.

Everything you need is already installed: `aws` 2.34, `docker`, `node` 20, `git`,
`openssl`.

## Values you'll collect

Keep these in a scratch file as you go:

| | Where it comes from |
|---|---|
| `DATABASE_URL` | step 1 |
| four secrets | step 2 |
| `CF_DOMAIN` | step 5 |
| `FUNCTION_URL` | step 7 |
| `AWS_ROLE_ARN` | step 8 |

---

## Step 0 · Shell variables

```bash
cd ~/Desktop/IPO-watch
export REGION=ap-south-1
export REPO=ipowatch-api
export FN=ipowatch-api
```

---

## Step 1 · Neon, and load the schema

1. Sign up at **neon.tech** (GitHub login works), create a project in the region
   closest to you.
2. Dashboard → **Connection string** → tick **Pooled connection**. It has
   `-pooler` in the hostname. Copy it.

```bash
export DATABASE_URL="postgres://user:pass@ep-xxx-pooler.ap-south-1.aws.neon.tech/neondb?sslmode=require"
```

Load the schema and your admin account:

```bash
cd backend
DATABASE_URL="$DATABASE_URL" DATABASE_SSL=true \
ADMIN_EMAIL="rajputanurag1000@gmail.com" \
ADMIN_PASSWORD="<pick a real password>" \
SKIP_DEMO_USER=true \
npm run seed
cd ..
```

**Check:** it prints `18 IPOs` and `admin: rajputanurag1000@gmail.com`.

---

## Step 2 · Generate the four secrets

```bash
export JWT_ACCESS_SECRET=$(openssl rand -hex 32)
export JWT_REFRESH_SECRET=$(openssl rand -hex 32)
export PAN_ENCRYPTION_KEY=$(openssl rand -hex 32)
export PAN_HASH_SECRET=$(openssl rand -hex 32)
printf 'JWT_ACCESS_SECRET=%s\nJWT_REFRESH_SECRET=%s\nPAN_ENCRYPTION_KEY=%s\nPAN_HASH_SECRET=%s\n' \
  "$JWT_ACCESS_SECRET" "$JWT_REFRESH_SECRET" "$PAN_ENCRYPTION_KEY" "$PAN_HASH_SECRET" \
  > ~/ipowatch-secrets.txt && chmod 600 ~/ipowatch-secrets.txt
echo "saved to ~/ipowatch-secrets.txt"
```

**`PAN_ENCRYPTION_KEY` can never change** once PANs are stored — a new key makes
every stored PAN permanently unreadable. Keep that file.

---

## Step 3 · AWS account and CLI

1. Sign up at **aws.amazon.com** (needs a card for identity; nothing here bills).
2. IAM → Users → create a user for yourself → attach `AdministratorAccess` →
   Security credentials → **Create access key** → *Command Line Interface*.

```bash
aws configure          # paste the key, secret, region ap-south-1, output json
export ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
export BUCKET=ipowatch-web-$ACCOUNT
echo "account $ACCOUNT · bucket $BUCKET"
```

**Set a budget alert now**, before anything else:
Billing → Budgets → Create budget → Cost budget → monthly, $1 → alert at 100%.
AWS warns *after* the spend; it does not cap.

---

## Step 4 · S3 bucket

```bash
aws s3api create-bucket --bucket $BUCKET --region $REGION \
  --create-bucket-configuration LocationConstraint=$REGION
```

Leave public access blocked — CloudFront reaches it privately.

---

## Step 5 · CloudFront

```bash
export OAC_ID=$(aws cloudfront create-origin-access-control \
  --origin-access-control-config "Name=ipowatch-oac,OriginAccessControlOriginType=s3,SigningBehavior=always,SigningProtocol=sigv4" \
  --query 'OriginAccessControl.Id' --output text)

cat > /tmp/cf.json <<JSON
{
  "CallerReference": "ipowatch-$(date +%s)",
  "Comment": "IPO Watch",
  "Enabled": true,
  "DefaultRootObject": "index.html",
  "Origins": { "Quantity": 1, "Items": [{
    "Id": "s3-origin",
    "DomainName": "$BUCKET.s3.$REGION.amazonaws.com",
    "OriginAccessControlId": "$OAC_ID",
    "S3OriginConfig": { "OriginAccessIdentity": "" }
  }]},
  "DefaultCacheBehavior": {
    "TargetOriginId": "s3-origin",
    "ViewerProtocolPolicy": "redirect-to-https",
    "AllowedMethods": { "Quantity": 2, "Items": ["GET","HEAD"] },
    "CachePolicyId": "658327ea-f89d-4fab-a63d-7e88639e58f6",
    "Compress": true
  },
  "CustomErrorResponses": { "Quantity": 2, "Items": [
    { "ErrorCode": 403, "ResponsePagePath": "/app/index.html", "ResponseCode": "200", "ErrorCachingMinTTL": 0 },
    { "ErrorCode": 404, "ResponsePagePath": "/app/index.html", "ResponseCode": "200", "ErrorCachingMinTTL": 0 }
  ]}
}
JSON

export DIST_ID=$(aws cloudfront create-distribution --distribution-config file:///tmp/cf.json \
  --query 'Distribution.Id' --output text)
export CF_DOMAIN=$(aws cloudfront get-distribution --id $DIST_ID \
  --query 'Distribution.DomainName' --output text)
echo "distribution $DIST_ID at https://$CF_DOMAIN"
```

Let the bucket trust the distribution:

```bash
aws s3api put-bucket-policy --bucket $BUCKET --policy "$(cat <<JSON
{"Version":"2012-10-17","Statement":[{
  "Effect":"Allow","Principal":{"Service":"cloudfront.amazonaws.com"},
  "Action":"s3:GetObject","Resource":"arn:aws:s3:::$BUCKET/*",
  "Condition":{"StringEquals":{"AWS:SourceArn":"arn:aws:cloudfront::$ACCOUNT:distribution/$DIST_ID"}}}]}
JSON
)"
```

The distribution takes a few minutes to go live. Carry on meanwhile.

---

## Step 6 · ECR, and one image by hand

Lambda can't create a function without an image already in the registry, so push
one manually this once. After this the pipeline does it.

```bash
aws ecr create-repository --repository-name $REPO --region $REGION
aws ecr put-lifecycle-policy --repository-name $REPO --region $REGION \
  --lifecycle-policy-text '{"rules":[{"rulePriority":1,"description":"keep last 10",
    "selection":{"tagStatus":"any","countType":"imageCountMoreThanN","countNumber":10},
    "action":{"type":"expire"}}]}'

aws ecr get-login-password --region $REGION \
  | docker login --username AWS --password-stdin $ACCOUNT.dkr.ecr.$REGION.amazonaws.com

# Lambda needs linux/amd64; your Mac is arm64, so build for the right platform.
docker build --platform linux/amd64 -f backend/Dockerfile.lambda \
  -t $ACCOUNT.dkr.ecr.$REGION.amazonaws.com/$REPO:bootstrap backend
docker push $ACCOUNT.dkr.ecr.$REGION.amazonaws.com/$REPO:bootstrap
```

---

## Step 7 · The Lambda function

```bash
aws iam create-role --role-name ipowatch-lambda-exec \
  --assume-role-policy-document '{"Version":"2012-10-17","Statement":[{"Effect":"Allow",
    "Principal":{"Service":"lambda.amazonaws.com"},"Action":"sts:AssumeRole"}]}'
aws iam attach-role-policy --role-name ipowatch-lambda-exec \
  --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole
sleep 10   # IAM takes a moment to propagate

aws lambda create-function --function-name $FN --region $REGION \
  --package-type Image \
  --code ImageUri=$ACCOUNT.dkr.ecr.$REGION.amazonaws.com/$REPO:bootstrap \
  --role arn:aws:iam::$ACCOUNT:role/ipowatch-lambda-exec \
  --timeout 30 --memory-size 512
aws lambda wait function-active-v2 --function-name $FN --region $REGION
```

Configuration — note `WEB_ORIGIN` and `ADMIN_ORIGIN` are both the CloudFront domain,
because both apps share one origin:

```bash
aws lambda update-function-configuration --function-name $FN --region $REGION \
  --environment "Variables={NODE_ENV=production,COOKIE_SAMESITE=none,DATABASE_SSL=true,\
DATABASE_URL=$DATABASE_URL,\
JWT_ACCESS_SECRET=$JWT_ACCESS_SECRET,JWT_REFRESH_SECRET=$JWT_REFRESH_SECRET,\
PAN_ENCRYPTION_KEY=$PAN_ENCRYPTION_KEY,PAN_HASH_SECRET=$PAN_HASH_SECRET,\
GMP_SOURCE_URL=https://ipowatch.in/ipo-grey-market-premium-latest-ipo-gmp/,\
WEB_ORIGIN=https://$CF_DOMAIN,ADMIN_ORIGIN=https://$CF_DOMAIN}"
aws lambda wait function-updated-v2 --function-name $FN --region $REGION
```

Public URL. `--auth-type NONE` means Lambda adds no auth of its own — the app's JWT
layer is the gate, which is what a public API wants:

```bash
aws lambda create-function-url-config --function-name $FN --auth-type NONE --region $REGION
aws lambda add-permission --function-name $FN --statement-id public-url \
  --action lambda:InvokeFunctionUrl --principal "*" --function-url-auth-type NONE --region $REGION
export FUNCTION_URL=$(aws lambda get-function-url-config --function-name $FN \
  --region $REGION --query FunctionUrl --output text)
echo "API at $FUNCTION_URL"
```

**Check — this is the real test:**

```bash
curl -s "${FUNCTION_URL%/}/api/health"        # → {"ok":true,"env":"production"}
```

If that fails, `aws logs tail /aws/lambda/$FN --follow` shows why.

---

## Step 8 · Let GitHub deploy without storing AWS keys

```bash
aws iam create-open-id-connect-provider \
  --url https://token.actions.githubusercontent.com \
  --client-id-list sts.amazonaws.com \
  --thumbprint-list 6938fd4d98bab03faadb97b34396831e3780aea1

cat > /tmp/trust.json <<JSON
{"Version":"2012-10-17","Statement":[{
  "Effect":"Allow",
  "Principal":{"Federated":"arn:aws:iam::$ACCOUNT:oidc-provider/token.actions.githubusercontent.com"},
  "Action":"sts:AssumeRoleWithWebIdentity",
  "Condition":{
    "StringEquals":{"token.actions.githubusercontent.com:aud":"sts.amazonaws.com"},
    "StringLike":{"token.actions.githubusercontent.com:sub":"repo:anuragrajput16/IPO-Watch:*"}}}]}
JSON

export ROLE_ARN=$(aws iam create-role --role-name github-actions-ipowatch \
  --assume-role-policy-document file:///tmp/trust.json --query 'Role.Arn' --output text)

cat > /tmp/deploy-policy.json <<JSON
{"Version":"2012-10-17","Statement":[
 {"Effect":"Allow","Action":["ecr:GetAuthorizationToken"],"Resource":"*"},
 {"Effect":"Allow","Action":["ecr:BatchCheckLayerAvailability","ecr:CompleteLayerUpload",
   "ecr:InitiateLayerUpload","ecr:PutImage","ecr:UploadLayerPart","ecr:BatchGetImage"],
  "Resource":"arn:aws:ecr:$REGION:$ACCOUNT:repository/$REPO"},
 {"Effect":"Allow","Action":["lambda:UpdateFunctionCode","lambda:GetFunction",
   "lambda:GetFunctionConfiguration","lambda:GetFunctionUrlConfig"],
  "Resource":"arn:aws:lambda:$REGION:$ACCOUNT:function:$FN"},
 {"Effect":"Allow","Action":["s3:PutObject","s3:DeleteObject","s3:ListBucket"],
  "Resource":["arn:aws:s3:::$BUCKET","arn:aws:s3:::$BUCKET/*"]},
 {"Effect":"Allow","Action":["cloudfront:CreateInvalidation"],
  "Resource":"arn:aws:cloudfront::$ACCOUNT:distribution/$DIST_ID"}]}
JSON

aws iam put-role-policy --role-name github-actions-ipowatch \
  --policy-name deploy --policy-document file:///tmp/deploy-policy.json
echo "role: $ROLE_ARN"
```

The `sub` condition is what stops any other repository on GitHub assuming this role.

---

## Step 9 · Push, and configure the repository

```bash
git add -A && git commit -m "Add backend, web, admin and AWS deploy pipeline"
git push origin main
```

Then on **github.com/anuragrajput16/IPO-Watch → Settings → Secrets and variables → Actions**.

**Variables** tab — print them first:

```bash
cat <<OUT
AWS_REGION                  $REGION
AWS_ROLE_ARN                $ROLE_ARN
ECR_REPOSITORY              $REPO
LAMBDA_FUNCTION             $FN
S3_BUCKET                   $BUCKET
CLOUDFRONT_DISTRIBUTION_ID  $DIST_ID
API_URL                     ${FUNCTION_URL%/}/api
OUT
```

**Secrets** tab — `DATABASE_URL`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`,
`PAN_ENCRYPTION_KEY`, `PAN_HASH_SECRET`. These must match Lambda's values exactly,
or sessions break across a deploy.

---

## Step 10 · Deploy

Actions tab → **Deploy to AWS** → *Run workflow*. It runs the 20 tests, builds and
pushes the image, migrates, updates Lambda, smoke-tests `/api/health`, then builds
and uploads both apps.

Your links:

```
https://<CF_DOMAIN>/app/      dashboard
https://<CF_DOMAIN>/admin/    admin console
<FUNCTION_URL>api/health      API
```

Sign in with the email and password from step 1.

---

## If something breaks

| Symptom | Cause |
|---|---|
| Sign-in works, then logged out after 15 min | `COOKIE_SAMESITE` isn't `none` on Lambda |
| Every browser request fails, `curl` fine | `WEB_ORIGIN`/`ADMIN_ORIGIN` don't match the CloudFront domain exactly |
| Blank page, 404s on `/app/assets/...` | app built without `--base`; re-run the workflow |
| `exec format error` in Lambda logs | image built for arm64 — rebuild with `--platform linux/amd64` |
| Old version after a deploy | CloudFront cache; the pipeline invalidates, give it a minute |
| API 500s | `aws logs tail /aws/lambda/ipowatch-api --follow` |

## Afterwards

- Add `DATABASE_URL` and the four secrets to repo secrets so
  [scrape-gmp-db.yml](.github/workflows/scrape-gmp-db.yml) keeps GMP fresh 4×/day.
- Check the budget alert exists.
- `~/ipowatch-secrets.txt` is the only copy of `PAN_ENCRYPTION_KEY`. Back it up.

# Deploying to AWS for ~₹0

```
git push → test (20 tests) → build image → ECR → migrate → Lambda → S3/CloudFront
```

[.github/workflows/deploy-aws.yml](.github/workflows/deploy-aws.yml) is the pipeline.
It's your ECS diagram with the last step swapped: **Lambda runs the same container
image from the same ECR repository**, so you drop the two things that cost money —
the ALB (~₹1,400/mo) and the Fargate task (~₹750/mo).

| Piece | Service | Cost at this traffic |
|---|---|---|
| API | Lambda + Function URL | **₹0** — 1M requests + 400k GB-s/month, always free |
| Image registry | ECR | **~₹10** — one image, lifecycle rule keeps 10 |
| Front ends | S3 + CloudFront | **₹0** — 1 TB egress/month, always free |
| Postgres | **Neon** | **₹0** — 0.5 GB, always free |

AWS has no always-free relational database, which is why Postgres stays on Neon.
Neon's pooled endpoint also solves Lambda's connection-pooling problem for free —
the usual AWS answer, RDS Proxy, costs money.

**Set a budget anyway.** AWS alerts after the spend, it does not cap:
Billing → Budgets → monthly cost budget → alert at $1.

---

## Set `ACCOUNT` and `REGION` first

```bash
export REGION=ap-south-1
export ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
export REPO=ipowatch-api
export FN=ipowatch-api
export BUCKET=ipowatch-web-$ACCOUNT        # bucket names are globally unique
```

## 1 · Neon, and load the schema

Create a project at neon.tech, copy the **pooled** connection string (it has
`-pooler` in the host), then from your machine:

```bash
cd backend
DATABASE_URL="postgres://...-pooler.../neondb?sslmode=require" DATABASE_SSL=true \
ADMIN_EMAIL="you@example.com" ADMIN_PASSWORD="<a real password>" SKIP_DEMO_USER=true \
npm run seed
```

## 2 · ECR

```bash
aws ecr create-repository --repository-name $REPO --region $REGION
aws ecr put-lifecycle-policy --repository-name $REPO --region $REGION \
  --lifecycle-policy-text '{"rules":[{"rulePriority":1,"description":"keep last 10",
    "selection":{"tagStatus":"any","countType":"imageCountMoreThanN","countNumber":10},
    "action":{"type":"expire"}}]}'
```

## 3 · The Lambda function

Lambda needs an image to exist before you can create the function, so push one by hand once:

```bash
aws ecr get-login-password --region $REGION \
  | docker login --username AWS --password-stdin $ACCOUNT.dkr.ecr.$REGION.amazonaws.com
docker build -f backend/Dockerfile.lambda -t $ACCOUNT.dkr.ecr.$REGION.amazonaws.com/$REPO:bootstrap backend
docker push $ACCOUNT.dkr.ecr.$REGION.amazonaws.com/$REPO:bootstrap
```

Create an execution role, then the function:

```bash
aws iam create-role --role-name ipowatch-lambda-exec \
  --assume-role-policy-document '{"Version":"2012-10-17","Statement":[{"Effect":"Allow",
    "Principal":{"Service":"lambda.amazonaws.com"},"Action":"sts:AssumeRole"}]}'
aws iam attach-role-policy --role-name ipowatch-lambda-exec \
  --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole

aws lambda create-function --function-name $FN \
  --package-type Image \
  --code ImageUri=$ACCOUNT.dkr.ecr.$REGION.amazonaws.com/$REPO:bootstrap \
  --role arn:aws:iam::$ACCOUNT:role/ipowatch-lambda-exec \
  --timeout 30 --memory-size 512 --region $REGION
```

Memory 512 MB is deliberate: Lambda scales CPU with memory, so 512 is usually
*cheaper* than 256 because it finishes sooner, and free-tier GB-seconds are ample.

Set the configuration:

```bash
aws lambda update-function-configuration --function-name $FN --region $REGION \
  --environment "Variables={
    NODE_ENV=production,
    COOKIE_SAMESITE=none,
    DATABASE_SSL=true,
    DATABASE_URL=<neon pooled string>,
    JWT_ACCESS_SECRET=<openssl rand -hex 32>,
    JWT_REFRESH_SECRET=<openssl rand -hex 32>,
    PAN_ENCRYPTION_KEY=<openssl rand -hex 32>,
    PAN_HASH_SECRET=<openssl rand -hex 32>,
    GMP_SOURCE_URL=https://ipowatch.in/ipo-grey-market-premium-latest-ipo-gmp/,
    WEB_ORIGIN=https://<cloudfront-domain>,
    ADMIN_ORIGIN=https://<cloudfront-domain>
  }"
```

`COOKIE_SAMESITE=none` is not optional — see *Why the cookie settings matter* in
[DEPLOY.md](DEPLOY.md).

Then the public URL. **`--auth-type NONE` means Lambda does no auth of its own**;
the app's own JWT layer is the gate, which is what you want for a public API:

```bash
aws lambda create-function-url-config --function-name $FN --auth-type NONE --region $REGION
aws lambda add-permission --function-name $FN --statement-id public-url \
  --action lambda:InvokeFunctionUrl --principal "*" --function-url-auth-type NONE --region $REGION
aws lambda get-function-url-config --function-name $FN --query FunctionUrl --output text
```

## 4 · S3 + CloudFront for the two apps

```bash
aws s3api create-bucket --bucket $BUCKET --region $REGION \
  --create-bucket-configuration LocationConstraint=$REGION
```

Leave public access blocked. Create a CloudFront distribution with this bucket as
an **origin using Origin Access Control (OAC)**, then apply the bucket policy
CloudFront generates for you. Set the distribution's default root object to
`index.html`.

Add two **custom error responses** — 403 and 404 → `/app/index.html` with response
code 200. S3 returns 403 for a missing key behind OAC, and without this a refresh
on the app shows an XML error instead of the page.

## 5 · OIDC role for GitHub

```bash
aws iam create-open-id-connect-provider \
  --url https://token.actions.githubusercontent.com \
  --client-id-list sts.amazonaws.com \
  --thumbprint-list 6938fd4d98bab03faadb97b34396831e3780aea1
```

Role `github-actions-ipowatch` with this trust policy — the `sub` condition is what
stops any other repo on GitHub assuming your role:

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": { "Federated": "arn:aws:iam::<ACCOUNT>:oidc-provider/token.actions.githubusercontent.com" },
    "Action": "sts:AssumeRoleWithWebIdentity",
    "Condition": {
      "StringEquals": { "token.actions.githubusercontent.com:aud": "sts.amazonaws.com" },
      "StringLike": { "token.actions.githubusercontent.com:sub": "repo:anuragrajput16/IPO-Watch:*" }
    }
  }]
}
```

Permissions: `AmazonEC2ContainerRegistryPowerUser`, plus
`lambda:UpdateFunctionCode`, `lambda:GetFunction*`, `s3:PutObject`, `s3:DeleteObject`,
`s3:ListBucket` on the bucket, and `cloudfront:CreateInvalidation`.

## 6 · Repository variables and secrets

Variables (Settings → Secrets and variables → Actions → **Variables**):

```
AWS_REGION                  ap-south-1
AWS_ROLE_ARN                arn:aws:iam::<ACCOUNT>:role/github-actions-ipowatch
ECR_REPOSITORY              ipowatch-api
LAMBDA_FUNCTION             ipowatch-api
S3_BUCKET                   ipowatch-web-<ACCOUNT>
CLOUDFRONT_DISTRIBUTION_ID  E...
API_URL                     https://<id>.lambda-url.ap-south-1.on.aws/api
```

Secrets (the same tab, **Secrets**): `DATABASE_URL`, `JWT_ACCESS_SECRET`,
`JWT_REFRESH_SECRET`, `PAN_ENCRYPTION_KEY`, `PAN_HASH_SECRET` — used by the migrate
step. They must match what Lambda has, or sessions break across a deploy.

Your apps then live at `https://<cloudfront-domain>/app/` and `/admin/`.

---

## Things worth knowing

**Set-Cookie needs lifting.** Function URLs use payload format 2.0, where
`Set-Cookie` must come back in a top-level `cookies` array — as a plain header it's
dropped. [src/lambda.ts](backend/src/lambda.ts) moves it across. Without that,
sign-in returns 200 and the session silently never persists.

**Migrations run in the pipeline, not on boot.** Concurrent cold starts would race
for the schema lock. [server.ts](backend/src/server.ts) still migrates on boot for
local and container use; `lambda.ts` deliberately does not.

**Cold starts** are ~1–2s for a container image this size, against ~50s for a
sleeping Render service.

**Test the image locally** exactly as Lambda runs it — the AWS base image ships the
runtime emulator:

```bash
docker build -f backend/Dockerfile.lambda -t ipowatch-lambda backend
docker run -p 9000:8080 --env-file backend/.env ipowatch-lambda
curl -XPOST "http://localhost:9000/2015-03-31/functions/function/invocations" \
  -d '{"version":"2.0","rawPath":"/api/health",
       "requestContext":{"http":{"method":"GET","path":"/api/health"}},
       "headers":{},"isBase64Encoded":false}'
```

**The GMP scrape** still runs from
[scrape-gmp-db.yml](.github/workflows/scrape-gmp-db.yml) on GitHub's machines, which
is free and doesn't depend on the API at all.

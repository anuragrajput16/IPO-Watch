# push → test → build → ECR → ECS

The pipeline is [.github/workflows/deploy-ecs.yml](.github/workflows/deploy-ecs.yml):

```
git push  →  test job (Postgres service container, 20 tests)
             ↓  only if green
             build image  →  push to ECR (tagged with the commit SHA)
             ↓
             render task definition  →  ECS rolling deploy  →  wait for stability
```

**Read the cost section first.** ECS is not on any free tier.

---

## What this costs

Roughly, in ap-south-1, running 24/7:

| Resource | Monthly |
|---|---|
| Fargate task, 0.25 vCPU / 0.5 GB | ~$9 |
| **Application Load Balancer** | **~$17** |
| RDS `db.t4g.micro` + 20 GB | ~$13 (free for a limited period on eligible accounts) |
| ECR storage | ~$0.10 |
| **Total** | **~$39/month (~₹3,300)** |

The ALB is the surprise. It's ~$17/month whether you serve one request or a
million, and you need it for HTTPS and a stable hostname in front of Fargate.

**AWS bills rather than stops.** Budgets send an alert *after* the spend, not a cap.
Set one anyway: Billing → Budgets → monthly cost budget → alert at $5.

To keep this exact pipeline at roughly zero, swap the last step: build the same
image, push to the same ECR, and deploy it to **Lambda** (which runs container
images) instead of ECS. Lambda's always-free tier covers this app's traffic, and
there's no ALB. Everything before `Deploy` is unchanged.

---

## One-time AWS setup

### 1 · ECR repository

```bash
aws ecr create-repository --repository-name ipowatch-api --region ap-south-1
# Stop old images accumulating into a bill:
aws ecr put-lifecycle-policy --repository-name ipowatch-api --region ap-south-1 \
  --lifecycle-policy-text '{"rules":[{"rulePriority":1,"description":"keep last 10",
    "selection":{"tagStatus":"any","countType":"imageCountMoreThanN","countNumber":10},
    "action":{"type":"expire"}}]}'
```

### 2 · OIDC role — so no AWS keys live in GitHub

```bash
aws iam create-open-id-connect-provider \
  --url https://token.actions.githubusercontent.com \
  --client-id-list sts.amazonaws.com \
  --thumbprint-list 6938fd4d98bab03faadb97b34396831e3780aea1
```

Then a role with this trust policy — the `sub` condition is what stops *any* repo
on GitHub from assuming your role:

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": { "Federated": "arn:aws:iam::<ACCOUNT_ID>:oidc-provider/token.actions.githubusercontent.com" },
    "Action": "sts:AssumeRoleWithWebIdentity",
    "Condition": {
      "StringEquals": { "token.actions.githubusercontent.com:aud": "sts.amazonaws.com" },
      "StringLike": { "token.actions.githubusercontent.com:sub": "repo:anuragrajput16/IPO-Watch:*" }
    }
  }]
}
```

Attach `AmazonEC2ContainerRegistryPowerUser`, plus `ecs:UpdateService`,
`ecs:DescribeServices`, `ecs:RegisterTaskDefinition` and `iam:PassRole` for the
task execution role.

### 3 · Secrets belong in Secrets Manager, not the task definition

Plain `environment` entries are visible to anyone who can describe the task.
Put `DATABASE_URL`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`,
`PAN_ENCRYPTION_KEY` and `PAN_HASH_SECRET` in Secrets Manager and reference them
with `secrets` + `valueFrom` in the container definition.

### 4 · Cluster, task definition and service

Create an ECS cluster, a Fargate task definition family `ipowatch-api` with a
container named `api` (port 4000, health check `/api/health`), and a service
behind an ALB target group. The workflow only ever *updates* the image on this
task definition — it doesn't create the infrastructure.

### 5 · Repository variables

Settings → Secrets and variables → Actions → **Variables**:

```
AWS_REGION       ap-south-1
AWS_ROLE_ARN     arn:aws:iam::<ACCOUNT_ID>:role/github-actions-ipowatch
ECR_REPOSITORY   ipowatch-api
ECS_CLUSTER      ipowatch
ECS_SERVICE      ipowatch-api
ECS_TASK_FAMILY  ipowatch-api
CONTAINER_NAME   api
```

---

## Notes on the pipeline

- **Images are tagged with the commit SHA**, not just `:latest`. A deploy is
  traceable to a commit, and a rollback is re-deploying an earlier tag.
- **`needs: test`** means a red suite never reaches production.
- **`wait-for-service-stability: true`** fails the job if the rollout doesn't
  settle, so a crash-looping container shows up as a red build rather than a
  green one over a broken service.
- **`cancel-in-progress: false`** — cancelling a half-finished ECS deploy leaves
  the service in a mixed state.
- **Migrations run on container boot** ([server.ts](backend/src/server.ts)). That's
  fine for one task; with several tasks starting at once they'd race. Move it to a
  one-off ECS task before the service update if you scale past one.

## The Dockerfile

[backend/Dockerfile](backend/Dockerfile) is a three-stage build: compile, install
production dependencies only, then copy just `dist/` and `node_modules/` into the
runtime image. 216 MB, runs as the non-root `node` user, with a `HEALTHCHECK` the
ALB target group can mirror.

Build and run it locally exactly as ECS will:

```bash
docker build -t ipowatch-api backend
docker run -p 4200:4000 --env-file backend/.env ipowatch-api
```

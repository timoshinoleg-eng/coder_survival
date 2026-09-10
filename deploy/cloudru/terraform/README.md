# Coder Survival Cloud.ru Terraform

This directory describes the production Cloud.ru Evolution infrastructure for Coder Survival. It is intentionally separate from application deployment: Terraform creates the network, VM and Managed PostgreSQL; GitHub Actions deploys the reviewed backend image after the infrastructure is ready.

## Managed resources

- one dedicated VPC;
- one routed private subnet in a single availability zone;
- one backend security group;
- restricted persistent SSH ingress supplied explicitly by the operator;
- public HTTP/HTTPS ingress for nginx and Let's Encrypt;
- one reserved public IPv4;
- one encrypted Ubuntu boot disk;
- one backend VM;
- one single-node Managed PostgreSQL cluster in the same subnet;
- automatic PostgreSQL backups;
- PgBouncer transaction pooling;
- a dedicated application database user and database.

Neither backend port 3000 nor PostgreSQL port 5432 is exposed in the VM security group.

## Pinned provider

The configuration pins the official Cloud.ru Evolution provider:

```text
cloud.ru/cloudru/cloud 2.1.3
```

Cloud.ru Evolution distributes this provider from its official GitHub releases rather than the public Terraform Registry. CI installs the exact `linux_amd64` 2.1.3 binary into Terraform's local provider directory and verifies its published SHA-256 before `terraform init` via `deploy/cloudru/install-terraform-provider-linux-amd64.sh`.

For operator machines, install the same 2.1.3 provider according to the current Cloud.ru Evolution Terraform quickstart before running `terraform init`. Do not upgrade the provider in a production change without running the Cloud.ru infra CI and reviewing the provider changelog.

## Required inputs

Pass sensitive inputs through environment variables rather than committed `.tfvars` files:

```bash
export TF_VAR_project_id='...'
export TF_VAR_auth_key_id='...'
export TF_VAR_auth_secret='...'
export TF_VAR_ssh_public_key='ssh-ed25519 ...'
export TF_VAR_postgres_app_password='...'
```

The following non-secret deployment choices are also required:

```bash
export TF_VAR_vm_image_id='...'
export TF_VAR_postgres_specification_id='...'
export TF_VAR_postgres_storage_gb='...'
export TF_VAR_ssh_allowed_cidrs='["203.0.113.10/32"]'
```

`vm_image_id` must be the exact approved Ubuntu 24.04 image ID from the target Cloud.ru project. `postgres_specification_id` must be an explicitly approved PostgreSQL 16 specification. Terraform deliberately does not auto-select a specification because that could silently change cost. At plan/apply time it verifies that the ID exists for the configured PostgreSQL version and that `postgres_storage_gb` is not below that specification's `min_storage_gb`.

`ssh_allowed_cidrs` is for persistent operator access only. It must contain one or more restricted IPv4 CIDRs; `0.0.0.0/0` is rejected by variable validation. GitHub Actions does not need to be added permanently: backend releases use the isolated `ci-ssh-access` Terraform module to grant the current hosted runner a temporary `/32` and remove it at the end of the release job.

## Validate without credentials

After installing the pinned Cloud.ru provider, CI performs syntax/schema validation without contacting the user's Cloud.ru project:

```bash
terraform fmt -check -recursive
terraform init -backend=false -input=false
terraform validate
```

The same validation runs independently for `terraform/ci-ssh-access`. `terraform validate` does not create resources.

## Review a real infrastructure plan

From this directory, after exporting all required `TF_VAR_*` values:

```bash
terraform init
terraform plan -out=production.tfplan
terraform show production.tfplan
```

Review the exact VM flavor, disk size, PostgreSQL specification metadata, storage, backup policy and public-IP resources before apply. In particular, verify the selected PostgreSQL specification shown by the `selected_postgres_specification` output is the intended paid size.

Apply only the reviewed plan:

```bash
terraform apply production.tfplan
```

Do not run `terraform apply -auto-approve` for the main production infrastructure.

## Important state-security rule

Terraform state contains infrastructure metadata and the application database password because the Cloud.ru PostgreSQL user resource requires the password as an input. Treat `terraform.tfstate*` as a secret. These files and `*.tfvars` are ignored in this directory and must never be committed or attached to an issue/PR.

Before long-term operation, store state in an approved encrypted remote backend with locking. Until that backend is selected, keep the initial state in a protected operator location and back it up securely after every infrastructure change.

The `ci-ssh-access` module is different: its state is intentionally ephemeral inside one GitHub Actions deploy job and contains only the temporary security-group rule plus Cloud.ru resource metadata. It is created and destroyed on the same runner and is never uploaded as an artifact.

## VM bootstrap

The VM is bootstrapped by `cloud-init.yaml.tftpl`. It creates the `coderdeploy` user by default, authorizes the supplied SSH public key, installs nginx/certbot, installs Docker from Docker's official installer, requires Docker Compose >= 2.30, and creates the application/backup directories.

After apply, verify cloud-init before the first GitHub backend deployment:

```bash
ssh coderdeploy@$(terraform output -raw vm_public_ip)
sudo cloud-init status --wait
docker compose version
sudo systemctl status nginx --no-pager
```

## Outputs used for production cutover

- `vm_public_ip` -> `CLOUDRU_VM_HOST` and the DuckDNS A record;
- `vm_user` -> `CLOUDRU_VM_USER`;
- `postgres_connection_string` -> resolve the private PostgreSQL host and port for `DB_HOST`/`DB_PORT`;
- `postgres_database` -> `DB_NAME`;
- `postgres_user` -> `DB_USER`.

The database connection string output is marked sensitive. Do not paste it into logs.

## Ephemeral GitHub Actions SSH access

`terraform/ci-ssh-access` exists only for the backend release job. It:

1. queries security groups in the configured Cloud.ru project;
2. requires the configured production security-group name to match exactly one group;
3. receives the hosted runner's externally observed public IPv4 as one `/32`;
4. opens only the configured SSH port for that `/32`;
5. tags the rule description with `Temporary GitHub Actions SSH run <run-id>`;
6. is destroyed in an `always()` cleanup step after the deploy attempt.

The workflow rejects non-public runner IPs. A normal failed deploy still runs cleanup; a cleanup failure makes the release job fail rather than reporting success with an access rule left behind.

A catastrophic hosted-runner loss can prevent the `always()` step from running. In that case, find the rule whose description contains the affected GitHub Actions run ID and delete that one rule in Cloud.ru before retrying. Its scope remains one runner `/32`, not the Internet.

This temporary module is the only place where `terraform apply -auto-approve` is acceptable: it manages a single short-lived allowlist rule whose inputs are generated and bounded by the release workflow. It must not be reused for the main production infrastructure.

## Main infrastructure apply remains manual

The dynamic-runner SSH problem no longer requires a permanent broad ingress rule or a second deployment VM. However, the main Cloud.ru infrastructure `terraform apply` remains outside GitHub Actions until an encrypted locked remote state backend and a production plan-approval process are established. CI validates the configuration; operators review and apply the exact saved production plan.

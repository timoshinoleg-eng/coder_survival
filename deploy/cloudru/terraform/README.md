# Coder Survival Cloud.ru Terraform

This directory describes the production Cloud.ru Evolution infrastructure for Coder Survival. It is intentionally separate from application deployment: Terraform creates the network, VM and Managed PostgreSQL; GitHub Actions deploys the reviewed backend image after the infrastructure is ready.

## Managed resources

- one dedicated VPC;
- one routed private subnet in a single availability zone;
- one backend security group;
- restricted SSH ingress supplied explicitly by the operator;
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

Cloud.ru Evolution distributes this provider from its official GitHub releases rather than the public Terraform Registry. CI installs the exact `linux_amd64` 2.1.3 binary into Terraform's local provider directory and verifies its published SHA-256 before `terraform init`.

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

`ssh_allowed_cidrs` must contain one or more restricted IPv4 CIDRs. `0.0.0.0/0` is rejected by variable validation.

## Validate without credentials

After installing the pinned Cloud.ru provider, CI performs syntax/schema validation without contacting the user's Cloud.ru project:

```bash
terraform fmt -check -recursive
terraform init -backend=false -input=false
terraform validate
```

`terraform validate` does not create resources.

## Review a real plan

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

Do not run `terraform apply -auto-approve` for production.

## Important state-security rule

Terraform state contains infrastructure metadata and the application database password because the Cloud.ru PostgreSQL user resource requires the password as an input. Treat `terraform.tfstate*` as a secret. These files and `*.tfvars` are ignored in this directory and must never be committed or attached to an issue/PR.

Before long-term operation, store state in an approved encrypted remote backend with locking. Until that backend is selected, keep the initial state in a protected operator location and back it up securely after every infrastructure change.

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

## Apply is intentionally not in GitHub Actions yet

The current GitHub-hosted deploy runner has dynamic public source addresses, while production SSH is required to remain narrowly allowlisted. This repository therefore validates Terraform in CI but does not run `terraform apply` automatically and does not weaken SSH to `0.0.0.0/0`.

A later production-hardening step should establish a stable trusted CI-to-VM path (for example a dedicated deployment runner/network path). Only then should automated Terraform apply or backend SSH deployment be enabled against a fixed allowlist.

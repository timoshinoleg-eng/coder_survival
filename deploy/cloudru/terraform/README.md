# Coder Survival Cloud.ru Terraform

This directory describes the production Cloud.ru Evolution infrastructure for Coder Survival. It is intentionally separate from application deployment: Terraform creates the network, VM and Managed PostgreSQL; GitHub Actions deploys the reviewed backend image after the infrastructure is ready.

## Managed resources

- one dedicated VPC;
- one routed private subnet in one explicitly selected availability zone;
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

## Discover production choices before provisioning

Run the manual GitHub Actions workflow **Cloud.ru Production Input Discovery** from `main` before choosing compute or database resources.

The workflow uses only the `production-cloudru` secrets `CLOUDRU_PROJECT_ID`, `CLOUDRU_AUTH_KEY_ID`, and `CLOUDRU_AUTH_SECRET`. Its Terraform module is under `terraform/discovery/` and contains data sources only: it cannot create, update, or delete Cloud.ru resources.

The Job Summary publishes only non-secret catalog fields for:

- enabled availability-zone IDs;
- VM flavor IDs, CPU/RAM/GPU/type and compatible zones;
- disk-type IDs, min/max size, free-tier flag and compatible zones;
- Ubuntu 24.04 image IDs, minimum CPU/RAM/disk and compatible zones;
- Managed PostgreSQL 16 specification IDs, deployment mode, flavor class, CPU/RAM, minimum storage, max hosts and HA capability.

The workflow may highlight the smallest returned `standard` PostgreSQL specification by resource ordering, but that is not an approval or price comparison. Verify the current Cloud.ru price before selecting a specification.

The safe provisioning order is:

1. run **Cloud.ru Production Input Discovery**;
2. select one compatible `zone_id`, `vm_flavor_id`, `boot_disk_type_id`, `vm_image_id`, and `postgres_specification_id` from the report;
3. select `boot_disk_size_gb` and `postgres_storage_gb` within the discovered minimum/maximum requirements;
4. export the selected IDs and other required `TF_VAR_*` inputs;
5. create a saved `production.tfplan`;
6. review resource counts, selected compute metadata, PostgreSQL specification/storage/backups, and public networking;
7. apply exactly that reviewed saved plan.

Production Terraform does not carry example defaults for zone, VM flavor or disk type. It queries the same Cloud.ru catalogs during plan and rejects unavailable or zone-incompatible IDs, an Ubuntu image outside the selected zone, a VM flavor below the image CPU/RAM minimum, or a boot disk outside the disk/image size requirements.

## Required inputs

Pass sensitive inputs through environment variables rather than committed `.tfvars` files:

```bash
export TF_VAR_project_id='...'
export TF_VAR_auth_key_id='...'
export TF_VAR_auth_secret='...'
export TF_VAR_ssh_public_key='ssh-ed25519 ...'
export TF_VAR_postgres_app_password='...'
```

Pass the exact non-secret selections from the discovery report:

```bash
export TF_VAR_zone_id='...'
export TF_VAR_vm_flavor_id='...'
export TF_VAR_boot_disk_type_id='...'
export TF_VAR_vm_image_id='...'
export TF_VAR_boot_disk_size_gb='...'
export TF_VAR_postgres_specification_id='...'
export TF_VAR_postgres_storage_gb='...'
export TF_VAR_ssh_allowed_cidrs='["203.0.113.10/32"]'
```

`ssh_allowed_cidrs` is for persistent operator access only. It must contain one or more restricted IPv4 CIDRs; `0.0.0.0/0` is rejected by variable validation. GitHub Actions does not need to be added permanently: backend releases use the isolated `ci-ssh-access` Terraform module to grant the current hosted runner a temporary `/32` and remove it at the end of the release job.

## Validate without credentials

After installing the pinned Cloud.ru provider, CI performs syntax/schema validation without contacting the user's Cloud.ru project:

```bash
terraform fmt -check -recursive
terraform init -backend=false -input=false
terraform validate
```

The same validation runs independently for `terraform/ci-ssh-access` and `terraform/discovery`. `terraform validate` does not create resources.

## Review a real infrastructure plan

From this directory, after exporting all required `TF_VAR_*` values:

```bash
terraform init
terraform plan -out=production.tfplan
terraform show production.tfplan
```

Review `selected_zone`, `selected_vm_flavor`, `selected_boot_disk_type`, `selected_vm_image`, and `selected_postgres_specification` in addition to the normal resource plan. Those outputs make the exact Cloud.ru selections visible before apply.

Apply only the reviewed plan:

```bash
terraform apply production.tfplan
```

Do not run `terraform apply -auto-approve` for the main production infrastructure.

## Important state-security rule

Terraform state contains infrastructure metadata and the application database password because the Cloud.ru PostgreSQL user resource requires the password as an input. Treat `terraform.tfstate*` as a secret. These files and `*.tfvars` are ignored in this directory and must never be committed or attached to an issue/PR.

Before long-term operation, store state in an approved encrypted remote backend with locking. Until that backend is selected, keep the initial state in a protected operator location and back it up securely after every infrastructure change.

The `ci-ssh-access` module is different: its state is intentionally ephemeral inside one GitHub Actions deploy job and contains only the temporary security-group rule plus Cloud.ru resource metadata. It is created and destroyed on the same runner and is never uploaded as an artifact.

The `discovery` module also uses no persistent state backend. It is read-only, and the workflow removes its local plan/JSON/state files in an `always()` cleanup step.

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

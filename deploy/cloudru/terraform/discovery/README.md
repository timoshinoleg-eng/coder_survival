# Cloud.ru production input discovery

This Terraform module is intentionally read-only. It contains only Cloud.ru data sources and outputs and must never contain managed `resource` blocks.

It is used by the manual **Cloud.ru Production Input Discovery** GitHub Actions workflow to query the target project for the exact identifiers needed by production Terraform:

- enabled availability-zone IDs;
- VM flavor IDs with CPU/RAM/GPU/type and enabled zones;
- disk-type IDs with min/max size, free-tier flag and enabled zones;
- Ubuntu 24.04 image IDs with minimum CPU/RAM/disk and enabled zones;
- Managed PostgreSQL 16 specification IDs with deployment mode, flavor class, CPU/RAM, minimum storage, max hosts and HA capability.

Production inputs `zone_id`, `vm_flavor_id`, `boot_disk_type_id`, `vm_image_id`, and `postgres_specification_id` must come from this discovery output. Do not substitute example names or guessed defaults.

The workflow creates a saved Terraform plan only to materialize data-source outputs, converts it to JSON, writes sanitized non-secret choices to the GitHub Job Summary, and removes local plan/JSON/state files in an `always()` cleanup step.

It must not be extended with `resource` blocks or `terraform apply`/`terraform destroy`. Production resource creation remains in the parent Terraform module and requires a separately reviewed saved plan.

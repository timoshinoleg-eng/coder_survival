variable "project_id" {
  description = "Cloud.ru Evolution project ID."
  type        = string
  sensitive   = true

  validation {
    condition     = length(trimspace(var.project_id)) > 0
    error_message = "project_id must not be empty."
  }
}

variable "auth_key_id" {
  description = "Cloud.ru service-account access key ID."
  type        = string
  sensitive   = true

  validation {
    condition     = length(trimspace(var.auth_key_id)) > 0
    error_message = "auth_key_id must not be empty."
  }
}

variable "auth_secret" {
  description = "Cloud.ru service-account access-key secret."
  type        = string
  sensitive   = true

  validation {
    condition     = length(var.auth_secret) > 0
    error_message = "auth_secret must not be empty."
  }
}

variable "zone_id" {
  description = "Exact enabled Cloud.ru Evolution availability-zone ID selected from the read-only discovery workflow."
  type        = string

  validation {
    condition     = length(trimspace(var.zone_id)) > 0
    error_message = "zone_id must not be empty."
  }
}

variable "vpc_name" {
  type    = string
  default = "coder-survival-production"
}

variable "subnet_name" {
  type    = string
  default = "coder-survival-production-subnet"
}

variable "subnet_cidr" {
  description = "Private subnet used by the VM and Managed PostgreSQL."
  type        = string
  default     = "10.20.0.0/24"

  validation {
    condition     = can(cidrhost(var.subnet_cidr, 1))
    error_message = "subnet_cidr must be a valid IPv4 CIDR."
  }
}

variable "dns_servers" {
  description = "DNS resolvers for the production subnet."
  type        = list(string)
  default     = ["8.8.8.8", "8.8.4.4"]

  validation {
    condition     = length(var.dns_servers) > 0
    error_message = "At least one DNS server is required."
  }
}

variable "security_group_name" {
  type    = string
  default = "coder-survival-backend"
}

variable "ssh_allowed_cidrs" {
  description = "IPv4 CIDRs permitted to reach SSH. Keep these narrow; 0.0.0.0/0 is rejected."
  type        = list(string)

  validation {
    condition = (
      length(var.ssh_allowed_cidrs) > 0 &&
      alltrue([for cidr in var.ssh_allowed_cidrs : can(cidrhost(cidr, 0))]) &&
      alltrue([for cidr in var.ssh_allowed_cidrs : cidr != "0.0.0.0/0"])
    )
    error_message = "ssh_allowed_cidrs must contain valid restricted IPv4 CIDRs and must not contain 0.0.0.0/0."
  }
}

variable "external_ip_name" {
  type    = string
  default = "coder-survival-backend"
}

variable "boot_disk_name" {
  type    = string
  default = "coder-survival-backend-boot"
}

variable "boot_disk_size_gb" {
  description = "Production VM boot disk size in GB. Plan validates this against the selected disk type and image minimum."
  type        = number
  default     = 20

  validation {
    condition     = var.boot_disk_size_gb > 0
    error_message = "boot_disk_size_gb must be positive."
  }
}

variable "boot_disk_type_id" {
  description = "Exact Cloud.ru disk-type ID selected from the read-only discovery workflow."
  type        = string

  validation {
    condition     = length(trimspace(var.boot_disk_type_id)) > 0
    error_message = "boot_disk_type_id must not be empty."
  }
}

variable "vm_image_id" {
  description = "Exact approved Ubuntu 24.04 image ID selected from the read-only discovery workflow."
  type        = string

  validation {
    condition     = length(trimspace(var.vm_image_id)) > 0
    error_message = "vm_image_id must not be empty."
  }
}

variable "interface_name" {
  type    = string
  default = "coder-survival-backend"
}

variable "vm_name" {
  type    = string
  default = "coder-survival-backend"
}

variable "vm_user" {
  description = "Non-root deployment user created by cloud-init."
  type        = string
  default     = "coderdeploy"

  validation {
    condition     = can(regex("^[a-z_][a-z0-9_-]{0,30}$", var.vm_user))
    error_message = "vm_user must be a valid lowercase Linux username."
  }
}

variable "vm_flavor_id" {
  description = "Exact Cloud.ru VM flavor ID selected from the read-only discovery workflow."
  type        = string

  validation {
    condition     = length(trimspace(var.vm_flavor_id)) > 0
    error_message = "vm_flavor_id must not be empty."
  }
}

variable "ssh_public_key" {
  description = "OpenSSH public key authorized for vm_user."
  type        = string
  sensitive   = true

  validation {
    condition     = can(regex("^(ssh-ed25519|ssh-rsa|ecdsa-sha2-nistp(256|384|521))\\s+[^\\s]+", trimspace(var.ssh_public_key)))
    error_message = "ssh_public_key must be a valid OpenSSH public-key line."
  }
}

variable "postgres_version" {
  description = "Managed PostgreSQL major version. Production tests and migrations currently target PostgreSQL 16."
  type        = string
  default     = "16"
}

variable "postgres_specification_id" {
  description = "Exact Cloud.ru Managed PostgreSQL specification ID selected from discovery. This is intentionally required so Terraform never silently selects a paid size."
  type        = string

  validation {
    condition     = length(trimspace(var.postgres_specification_id)) > 0
    error_message = "postgres_specification_id must not be empty."
  }
}

variable "postgres_storage_gb" {
  description = "Managed PostgreSQL data disk size. Apply validates it against the selected specification's min_storage_gb."
  type        = number

  validation {
    condition     = var.postgres_storage_gb > 0
    error_message = "postgres_storage_gb must be positive."
  }
}

variable "postgres_backup_schedule" {
  description = "Cloud.ru Managed PostgreSQL backup schedule."
  type        = string
  default     = "0 3 * * 0"
}

variable "postgres_backup_retention_days" {
  description = "Retention for automatic Cloud.ru PostgreSQL backups."
  type        = number
  default     = 14

  validation {
    condition     = var.postgres_backup_retention_days >= 1 && var.postgres_backup_retention_days <= 30
    error_message = "postgres_backup_retention_days must be between 1 and 30."
  }
}

variable "postgres_cluster_name" {
  type    = string
  default = "coder-survival-production"
}

variable "postgres_initial_database" {
  description = "Provider-required bootstrap database. The application uses a separately owned database."
  type        = string
  default     = "coder_survival_bootstrap"
}

variable "postgres_app_database" {
  description = "Application database name used as DB_NAME."
  type        = string
  default     = "coder_survival"
}

variable "postgres_app_user" {
  description = "Dedicated application database owner used as DB_USER."
  type        = string
  default     = "coder_survival_app"
}

variable "postgres_app_password" {
  description = "Password for the dedicated application database user. Terraform state contains this value and must be protected."
  type        = string
  sensitive   = true

  validation {
    condition     = length(var.postgres_app_password) >= 16
    error_message = "postgres_app_password must contain at least 16 characters."
  }
}

variable "project_id" {
  type      = string
  sensitive = true

  validation {
    condition     = length(trimspace(var.project_id)) > 0
    error_message = "project_id must not be empty."
  }
}

variable "auth_key_id" {
  type      = string
  sensitive = true

  validation {
    condition     = length(trimspace(var.auth_key_id)) > 0
    error_message = "auth_key_id must not be empty."
  }
}

variable "auth_secret" {
  type      = string
  sensitive = true

  validation {
    condition     = length(var.auth_secret) > 0
    error_message = "auth_secret must not be empty."
  }
}

variable "security_group_name" {
  description = "Exact production backend security-group name created by the main Terraform module."
  type        = string
  default     = "coder-survival-backend"
}

variable "source_cidr" {
  description = "One GitHub-hosted runner public IPv4 encoded as a /32 CIDR."
  type        = string

  validation {
    condition = (
      can(cidrhost(var.source_cidr, 0)) &&
      endswith(var.source_cidr, "/32") &&
      var.source_cidr != "0.0.0.0/32"
    )
    error_message = "source_cidr must be one concrete non-zero IPv4 /32 CIDR."
  }
}

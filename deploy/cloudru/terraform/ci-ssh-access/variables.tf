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
      can(regex("^([0-9]{1,3}\\.){3}[0-9]{1,3}/32$", var.source_cidr)) &&
      var.source_cidr != "0.0.0.0/32"
    )
    error_message = "source_cidr must be one concrete non-zero IPv4 /32 CIDR."
  }
}

variable "ssh_port" {
  description = "SSH port opened only for the current GitHub-hosted runner."
  type        = number
  default     = 22

  validation {
    condition     = var.ssh_port >= 1 && var.ssh_port <= 65535 && floor(var.ssh_port) == var.ssh_port
    error_message = "ssh_port must be an integer between 1 and 65535."
  }
}

variable "github_run_id" {
  description = "GitHub Actions run ID embedded in the temporary rule description for audit/manual cleanup."
  type        = string

  validation {
    condition     = can(regex("^[0-9]+$", var.github_run_id))
    error_message = "github_run_id must contain only decimal digits."
  }
}

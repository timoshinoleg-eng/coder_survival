variable "project_id" {
  description = "Cloud.ru Evolution project ID to inspect."
  type        = string
  sensitive   = true

  validation {
    condition     = length(trimspace(var.project_id)) > 0
    error_message = "project_id must not be empty."
  }
}

variable "auth_key_id" {
  description = "Cloud.ru service-account access-key ID with read access to images and PostgreSQL specifications."
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

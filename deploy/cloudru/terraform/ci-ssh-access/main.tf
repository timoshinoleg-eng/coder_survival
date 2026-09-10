terraform {
  required_version = ">= 1.5.0, < 2.0.0"

  required_providers {
    cloudru = {
      source  = "cloud.ru/cloudru/cloud"
      version = "2.1.3"
    }
  }
}

provider "cloudru" {
  project_id  = var.project_id
  auth_key_id = var.auth_key_id
  auth_secret = var.auth_secret
  region      = "ru-central-1"
}

data "cloudru_evolution_compute_security_group_collection" "project" {
  project_id = var.project_id
  page_size  = 1000
}

locals {
  matching_security_groups = [
    for security_group in data.cloudru_evolution_compute_security_group_collection.project.security_groups : security_group
    if security_group.name == var.security_group_name
  ]

  security_group_id = try(one(local.matching_security_groups).id, "00000000-0000-0000-0000-000000000000")
}

resource "cloudru_evolution_compute_security_group_rule" "github_runner_ssh" {
  security_group_id = local.security_group_id
  direction         = "TRAFFIC_DIRECTION_INGRESS"
  ether_type        = "ETHER_TYPE_IPV4"
  ip_protocol       = "IP_PROTOCOL_TCP"
  port_range        = "22:22"
  remote_ip_prefix  = var.source_cidr
  description       = "Temporary GitHub Actions SSH run ${var.github_run_id}"

  lifecycle {
    precondition {
      condition     = length(local.matching_security_groups) == 1
      error_message = "security_group_name must match exactly one Cloud.ru security group in project_id."
    }
  }
}

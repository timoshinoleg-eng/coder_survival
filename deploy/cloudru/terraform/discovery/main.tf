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

data "cloudru_evolution_compute_image_collection" "project" {
  project_id = var.project_id
  page_size  = 1000
}

data "cloudru_evolution_postgresql_specification_collection" "postgres16" {
  version_name = "16"
  product_type = "postgres"
}

locals {
  ubuntu_2404_images = [
    for image in data.cloudru_evolution_compute_image_collection.project.images : {
      id           = image.id
      name         = image.name
      display_name = image.display_name
      min_cpu      = image.min_cpu
      min_ram_gb   = image.min_ram
      min_disk_gb  = image.min_disk
      zones = [
        for zone in image.zones : zone.name
        if zone.enabled
      ]
    }
    if strcontains(lower("${image.name} ${image.display_name}"), "ubuntu") && strcontains(lower("${image.name} ${image.display_name}"), "24.04")
  ]

  postgres16_specifications = [
    for spec in data.cloudru_evolution_postgresql_specification_collection.postgres16.specifications : {
      id                    = spec.id
      display_name          = spec.display_name
      deployment_mode       = spec.deployment_mode
      flavor_type           = spec.flavor_type
      cpu                   = spec.cpu
      memory_gb             = spec.memory
      min_storage_gb        = spec.min_storage_gb
      max_hosts             = spec.max_hosts
      allow_primary_standby = spec.allow_primary_standby
    }
  ]
}

output "ubuntu_2404_images" {
  description = "Ubuntu 24.04 images visible in the target project."
  value       = local.ubuntu_2404_images
}

output "postgres16_specifications" {
  description = "Managed PostgreSQL 16 specifications available to the target project."
  value       = local.postgres16_specifications
}

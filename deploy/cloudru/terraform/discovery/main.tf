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

data "cloudru_evolution_compute_zone_collection" "project" {
  project_id = var.project_id
  page_size  = 1000
}

data "cloudru_evolution_compute_flavor_collection" "project" {
  project_id = var.project_id
  page_size  = 1000
}

data "cloudru_evolution_compute_disk_type_collection" "project" {
  project_id = var.project_id
  page_size  = 1000
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
  enabled_zones = [
    for zone in data.cloudru_evolution_compute_zone_collection.project.zones : {
      id           = zone.id
      name         = zone.name
      short_name   = zone.short_name
      display_name = zone.display_name
      default      = zone.default
    }
    if zone.enabled
  ]

  vm_flavors = [
    for flavor in data.cloudru_evolution_compute_flavor_collection.project.flavors : {
      id               = flavor.id
      name             = flavor.name
      cpu              = flavor.cpu
      ram_gb           = flavor.ram
      gpu              = flavor.gpu
      type             = flavor.type
      oversubscription = flavor.oversubscription
      zones = [
        for zone in flavor.zones : {
          id   = zone.id
          name = zone.name
        }
        if zone.enabled
      ]
    }
    if length([for zone in flavor.zones : zone if zone.enabled]) > 0
  ]

  disk_types = [
    for disk_type in data.cloudru_evolution_compute_disk_type_collection.project.disk_types : {
      id           = disk_type.id
      name         = disk_type.name
      display_name = disk_type.display_name
      free_tier    = disk_type.free_tier
      min_size_gb  = disk_type.min_size
      max_size_gb  = disk_type.max_size
      zones = [
        for zone in disk_type.zones : {
          id   = zone.id
          name = zone.name
        }
        if zone.enabled
      ]
    }
    if length([for zone in disk_type.zones : zone if zone.enabled]) > 0
  ]

  ubuntu_2404_images = [
    for image in data.cloudru_evolution_compute_image_collection.project.images : {
      id           = image.id
      name         = image.name
      display_name = image.display_name
      min_cpu      = image.min_cpu
      min_ram_gb   = image.min_ram
      min_disk_gb  = image.min_disk
      zones = [
        for zone in image.zones : {
          id   = zone.id
          name = zone.name
        }
        if zone.enabled
      ]
    }
    if strcontains(lower("${image.name} ${image.display_name}"), "ubuntu") &&
    strcontains(lower("${image.name} ${image.display_name}"), "24.04") &&
    length([for zone in image.zones : zone if zone.enabled]) > 0
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

output "enabled_zones" {
  description = "Enabled availability zones visible in the target Cloud.ru project."
  value       = local.enabled_zones
}

output "vm_flavors" {
  description = "VM flavors with at least one enabled availability zone."
  value       = local.vm_flavors
}

output "disk_types" {
  description = "Disk types with at least one enabled availability zone."
  value       = local.disk_types
}

output "ubuntu_2404_images" {
  description = "Ubuntu 24.04 images with at least one enabled availability zone."
  value       = local.ubuntu_2404_images
}

output "postgres16_specifications" {
  description = "Managed PostgreSQL 16 specifications available to the target project."
  value       = local.postgres16_specifications
}

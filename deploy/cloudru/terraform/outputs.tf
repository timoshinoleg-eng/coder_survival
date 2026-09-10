output "vpc_id" {
  description = "Production VPC ID."
  value       = cloudru_evolution_vpc_vpc.production.id
}

output "subnet_id" {
  description = "Production subnet shared by the backend VM and Managed PostgreSQL."
  value       = cloudru_evolution_compute_subnet.production.id
}

output "security_group_id" {
  description = "Backend VM security-group ID."
  value       = cloudru_evolution_compute_security_group.backend.id
}

output "vm_id" {
  description = "Production backend VM ID."
  value       = cloudru_evolution_compute_vm.backend.id
}

output "vm_user" {
  description = "SSH deployment user created by cloud-init."
  value       = var.vm_user
}

output "vm_private_ip" {
  description = "Backend VM private IPv4."
  value       = cloudru_evolution_compute_interface.backend.ip_address
}

output "vm_public_ip" {
  description = "Backend VM public IPv4 to assign to coder-survival-api.duckdns.org and CLOUDRU_VM_HOST."
  value       = cloudru_evolution_compute_external_ip.backend.ip_address
}

output "selected_zone" {
  description = "Selected enabled Cloud.ru availability zone metadata."
  value = local.selected_zone == null ? null : {
    id           = local.selected_zone.id
    name         = local.selected_zone.name
    short_name   = local.selected_zone.short_name
    display_name = local.selected_zone.display_name
    default      = local.selected_zone.default
  }
}

output "selected_vm_flavor" {
  description = "Selected VM flavor metadata validated for the selected zone and image."
  value = local.selected_flavor == null ? null : {
    id               = local.selected_flavor.id
    name             = local.selected_flavor.name
    cpu              = local.selected_flavor.cpu
    ram_gb           = local.selected_flavor.ram
    gpu              = local.selected_flavor.gpu
    type             = local.selected_flavor.type
    oversubscription = local.selected_flavor.oversubscription
  }
}

output "selected_boot_disk_type" {
  description = "Selected boot disk type metadata validated for the selected zone."
  value = local.selected_disk_type == null ? null : {
    id           = local.selected_disk_type.id
    name         = local.selected_disk_type.name
    display_name = local.selected_disk_type.display_name
    free_tier    = local.selected_disk_type.free_tier
    min_size_gb  = local.selected_disk_type.min_size
    max_size_gb  = local.selected_disk_type.max_size
  }
}

output "selected_vm_image" {
  description = "Selected Ubuntu 24.04 image metadata validated for the selected zone."
  value = local.selected_image == null ? null : {
    id           = local.selected_image.id
    name         = local.selected_image.name
    display_name = local.selected_image.display_name
    min_cpu      = local.selected_image.min_cpu
    min_ram_gb   = local.selected_image.min_ram
    min_disk_gb  = local.selected_image.min_disk
  }
}

output "postgres_cluster_id" {
  description = "Managed PostgreSQL cluster ID."
  value       = cloudru_evolution_postgresql_cluster.production.id
}

output "postgres_connection_string" {
  description = "Cloud.ru Managed PostgreSQL connection string. Treat as sensitive and use it only to resolve the private host/port for deployment secrets."
  value       = cloudru_evolution_postgresql_cluster.production.connection_string
  sensitive   = true
}

output "postgres_database" {
  description = "Application DB_NAME."
  value       = cloudru_evolution_postgresql_database.application.name
}

output "postgres_user" {
  description = "Application DB_USER."
  value       = cloudru_evolution_postgresql_user.application.name
}

output "selected_postgres_specification" {
  description = "Selected Managed PostgreSQL sizing metadata returned by Cloud.ru."
  value = local.selected_postgres_spec == null ? null : {
    id              = local.selected_postgres_spec.id
    display_name    = local.selected_postgres_spec.display_name
    deployment_mode = local.selected_postgres_spec.deployment_mode
    cpu             = local.selected_postgres_spec.cpu
    memory_gb       = local.selected_postgres_spec.memory
    min_storage_gb  = local.selected_postgres_spec.min_storage_gb
  }
}

terraform {
  required_version = ">= 1.5.0, < 2.0.0"

  required_providers {
    cloudru = {
      source  = "cloudru/cloud"
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

data "cloudru_evolution_postgresql_specification_collection" "available" {
  version_name = var.postgres_version
  product_type = "postgres"
}

locals {
  selected_postgres_specs = [
    for spec in data.cloudru_evolution_postgresql_specification_collection.available.specifications : spec
    if spec.id == var.postgres_specification_id
  ]

  selected_postgres_spec = length(local.selected_postgres_specs) == 1 ? local.selected_postgres_specs[0] : null

  cloud_init = templatefile("${path.module}/cloud-init.yaml.tftpl", {
    deploy_user    = var.vm_user
    ssh_public_key = var.ssh_public_key
  })
}

resource "cloudru_evolution_vpc_vpc" "production" {
  project_id  = var.project_id
  name        = var.vpc_name
  description = "Coder Survival production VPC"
}

resource "cloudru_evolution_compute_subnet" "production" {
  project_id = var.project_id
  name       = var.subnet_name

  zone = {
    name = var.zone
  }

  description    = "Coder Survival production VM and Managed PostgreSQL subnet"
  subnet_address = var.subnet_cidr
  routed_network = true
  default        = false
  vpc_id         = cloudru_evolution_vpc_vpc.production.id

  dns_servers = {
    value = var.dns_servers
  }
}

resource "cloudru_evolution_compute_security_group" "backend" {
  project_id = var.project_id
  name       = var.security_group_name

  zone = {
    name = var.zone
  }

  description = "Coder Survival backend public ingress and restricted SSH"
}

resource "cloudru_evolution_compute_security_group_rule" "ssh" {
  for_each = toset(var.ssh_allowed_cidrs)

  security_group_id = cloudru_evolution_compute_security_group.backend.id
  direction         = "TRAFFIC_DIRECTION_INGRESS"
  ether_type        = "ETHER_TYPE_IPV4"
  ip_protocol       = "IP_PROTOCOL_TCP"
  port_range        = "22:22"
  remote_ip_prefix  = each.value
  description       = "SSH from approved operator or CI source"
}

resource "cloudru_evolution_compute_security_group_rule" "http" {
  security_group_id = cloudru_evolution_compute_security_group.backend.id
  direction         = "TRAFFIC_DIRECTION_INGRESS"
  ether_type        = "ETHER_TYPE_IPV4"
  ip_protocol       = "IP_PROTOCOL_TCP"
  port_range        = "80:80"
  remote_ip_prefix  = "0.0.0.0/0"
  description       = "HTTP for ACME redirect and certificate issuance"
}

resource "cloudru_evolution_compute_security_group_rule" "https" {
  security_group_id = cloudru_evolution_compute_security_group.backend.id
  direction         = "TRAFFIC_DIRECTION_INGRESS"
  ether_type        = "ETHER_TYPE_IPV4"
  ip_protocol       = "IP_PROTOCOL_TCP"
  port_range        = "443:443"
  remote_ip_prefix  = "0.0.0.0/0"
  description       = "Public HTTPS API"
}

resource "cloudru_evolution_compute_security_group_rule" "egress_tcp" {
  security_group_id = cloudru_evolution_compute_security_group.backend.id
  direction         = "TRAFFIC_DIRECTION_EGRESS"
  ether_type        = "ETHER_TYPE_IPV4"
  ip_protocol       = "IP_PROTOCOL_TCP"
  port_range        = "1:65535"
  remote_ip_prefix  = "0.0.0.0/0"
  description       = "Outbound TCP"
}

resource "cloudru_evolution_compute_security_group_rule" "egress_udp" {
  security_group_id = cloudru_evolution_compute_security_group.backend.id
  direction         = "TRAFFIC_DIRECTION_EGRESS"
  ether_type        = "ETHER_TYPE_IPV4"
  ip_protocol       = "IP_PROTOCOL_UDP"
  port_range        = "1:65535"
  remote_ip_prefix  = "0.0.0.0/0"
  description       = "Outbound UDP"
}

resource "cloudru_evolution_compute_external_ip" "backend" {
  project_id  = var.project_id
  name        = var.external_ip_name
  description = "Coder Survival production backend public IPv4"

  zone = {
    name = var.zone
  }
}

resource "cloudru_evolution_compute_disk" "boot" {
  project_id  = var.project_id
  name        = var.boot_disk_name
  description = "Coder Survival production VM boot disk"
  size        = var.boot_disk_size_gb
  bootable    = true
  encrypted   = true
  readonly    = false
  shared      = false

  zone = {
    name = var.zone
  }

  disk_type = {
    name = var.boot_disk_type
  }

  image = {
    id = var.vm_image_id
  }
}

resource "cloudru_evolution_compute_interface" "backend" {
  project_id  = var.project_id
  name        = var.interface_name
  description = "Coder Survival production backend interface"

  zone = {
    name = var.zone
  }

  subnet = {
    id = cloudru_evolution_compute_subnet.production.id
  }

  security_groups = [{
    id = cloudru_evolution_compute_security_group.backend.id
  }]

  attach_external_ip = {
    id = cloudru_evolution_compute_external_ip.backend.id
  }

  interface_security_enabled = true
  type                       = "INTERFACE_TYPE_REGULAR"
}

resource "cloudru_evolution_compute_vm" "backend" {
  project_id  = var.project_id
  name        = var.vm_name
  description = "Coder Survival production backend"

  zone = {
    name = var.zone
  }

  flavor = {
    name = var.vm_flavor
  }

  disks = [{
    id = cloudru_evolution_compute_disk.boot.id
  }]

  network_interfaces = [{
    id = cloudru_evolution_compute_interface.backend.id
  }]

  cloud_init_userdata = base64encode(local.cloud_init)

  image_metadata = {
    public_key = {
      string_value = var.ssh_public_key
    }
  }
}

resource "cloudru_evolution_postgresql_cluster" "production" {
  project_id       = var.project_id
  name             = var.postgres_cluster_name
  description      = "Coder Survival production Managed PostgreSQL"
  version          = var.postgres_version
  instances        = 1
  subnet_ids       = [cloudru_evolution_compute_subnet.production.id]
  specification_id = var.postgres_specification_id

  storage = {
    pg_data_gb = var.postgres_storage_gb
  }

  backup = {
    schedule              = var.postgres_backup_schedule
    retention_policy_days = var.postgres_backup_retention_days
  }

  pooler_config = {
    enabled   = true
    pool_mode = "TRANSACTION"
  }

  initial_database            = var.postgres_initial_database
  initial_database_lc_collate = "C"
  initial_database_lc_ctype   = "C"

  lifecycle {
    precondition {
      condition     = length(local.selected_postgres_specs) == 1
      error_message = "postgres_specification_id must match exactly one specification available for postgres_version."
    }

    precondition {
      condition     = local.selected_postgres_spec == null ? false : var.postgres_storage_gb >= local.selected_postgres_spec.min_storage_gb
      error_message = "postgres_storage_gb is below the minimum required by the selected Cloud.ru PostgreSQL specification."
    }
  }
}

resource "cloudru_evolution_postgresql_user" "application" {
  cluster_id = cloudru_evolution_postgresql_cluster.production.id
  name       = var.postgres_app_user
  password   = var.postgres_app_password
}

resource "cloudru_evolution_postgresql_database" "application" {
  cluster_id = cloudru_evolution_postgresql_cluster.production.id
  name       = var.postgres_app_database
  owner      = cloudru_evolution_postgresql_user.application.name
  lc_collate = "C"
  lc_ctype   = "C"
}

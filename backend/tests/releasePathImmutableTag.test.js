import { readFileSync } from 'fs';

const repoFile = (relativePath) => readFileSync(new URL(`../../${relativePath}`, import.meta.url), 'utf8');

const backendRelease = repoFile('.github/workflows/deploy-backend.yml');
const frontendRelease = repoFile('.github/workflows/deploy-frontend-production.yml');
const cloudruDiscovery = repoFile('.github/workflows/cloudru-discovery.yml');
const legacyManualRelease = repoFile('.github/workflows/manual-release.yml');
const legacyPowerShellRelease = repoFile('scripts/release-prod.ps1');
const legacyShellRelease = repoFile('scripts/deploy.sh');
const releaseChecklist = repoFile('scripts/release-manual-checklist.md');
const compose = repoFile('docker-compose.backend.yml');
const envExample = repoFile('backend/.env.example');
const providerInstaller = repoFile('deploy/cloudru/install-terraform-provider-linux-amd64.sh');
const productionTerraformMain = repoFile('deploy/cloudru/terraform/main.tf');
const productionTerraformVariables = repoFile('deploy/cloudru/terraform/variables.tf');
const ciSshMain = repoFile('deploy/cloudru/terraform/ci-ssh-access/main.tf');
const ciSshVariables = repoFile('deploy/cloudru/terraform/ci-ssh-access/variables.tf');
const discoveryMain = repoFile('deploy/cloudru/terraform/discovery/main.tf');

describe('production release-path contract', () => {
  test('backend release is main-only, explicit and uses one immutable GitHub SHA image', () => {
    expect(backendRelease).toContain('[[ "$DEPLOY_CONFIRM" == "deploy" ]]');
    expect(backendRelease).toContain('[[ "$GITHUB_REF" == "refs/heads/main" ]]');
    expect(backendRelease).toContain('docker build --pull -t "$IMAGE_REPOSITORY:$GITHUB_SHA" ./backend');
    expect(backendRelease).toContain('name: backend-image-${{ github.sha }}');
    expect(backendRelease).toContain("NEW_TAG='$GITHUB_SHA' NEW_IMAGE='$IMAGE_REPOSITORY:$GITHUB_SHA'");
    expect(backendRelease).toContain("printf '%s\\n' \"$NEW_IMAGE\" > \"$APP_DIR/deployed-image.txt\"");
  });

  test('production compose requires an explicit immutable tag and has no mutable latest fallback', () => {
    expect(compose).toContain('image: coder-survival-backend:${BACKEND_IMAGE_TAG:?BACKEND_IMAGE_TAG is required}');
    expect(compose).not.toContain('${BACKEND_IMAGE_TAG:-latest}');
    expect(backendRelease).not.toMatch(/coder-survival-backend:latest/);
    expect(backendRelease).not.toMatch(/IMAGE_REPOSITORY[^\n]*latest/);
  });

  test('frontend production release deploys exact current main and validates the stable alias', () => {
    expect(frontendRelease).toContain('refs/heads/main');
    expect(frontendRelease).toContain('ops/frontend-production-release');
    expect(frontendRelease).toContain('git fetch --no-tags origin main');
    expect(frontendRelease).toContain('ref: main');
    expect(frontendRelease).toContain('VERCEL_CLI_VERSION: 59.15.1');
    expect(frontendRelease).toContain('vercel pull --yes --environment=production --token="$VERCEL_TOKEN"');
    expect(frontendRelease).toContain('vercel build --prod --token="$VERCEL_TOKEN"');
    expect(frontendRelease).toContain('vercel deploy --prebuilt --prod --yes --token="$VERCEL_TOKEN"');
    expect(frontendRelease).toContain('https://frontend-olegs-projects-bfc4e11a.vercel.app');
    expect(frontendRelease).toContain('<title>Coder Survival</title>');
  });

  test('backend release uses a temporary one-runner SSH allowlist and always destroys it', () => {
    expect(backendRelease).toContain('CLOUDRU_PROJECT_ID: ${{ secrets.CLOUDRU_PROJECT_ID }}');
    expect(backendRelease).toContain('CLOUDRU_AUTH_KEY_ID: ${{ secrets.CLOUDRU_AUTH_KEY_ID }}');
    expect(backendRelease).toContain('CLOUDRU_AUTH_SECRET: ${{ secrets.CLOUDRU_AUTH_SECRET }}');
    expect(backendRelease).toContain('runner_cidr="${runner_ip}/32"');
    expect(backendRelease).toContain('not address.is_global');
    expect(backendRelease).toContain('TF_VAR_ssh_port: ${{ vars.CLOUDRU_VM_SSH_PORT || \'22\' }}');
    expect(backendRelease).toContain('terraform apply -auto-approve -input=false -no-color');
    expect(backendRelease).toContain("if: ${{ always() && steps.ci_ssh.outputs.attempted == 'true' && steps.ci_ssh.outputs.source_cidr != '' }}");
    expect(backendRelease).toContain('terraform destroy -auto-approve -input=false -no-color');

    expect(ciSshMain).toContain('remote_ip_prefix  = var.source_cidr');
    expect(ciSshMain).toContain('port_range        = "${var.ssh_port}:${var.ssh_port}"');
    expect(ciSshMain).toContain('Temporary GitHub Actions SSH run ${var.github_run_id}');
    expect(ciSshMain).not.toContain('remote_ip_prefix  = "0.0.0.0/0"');
    expect(ciSshVariables).toContain('source_cidr must be one concrete non-zero IPv4 /32 CIDR');
    expect(ciSshVariables).toContain('github_run_id must contain only decimal digits');
  });

  test('Cloud.ru Terraform provider installer pins version and published linux amd64 checksum', () => {
    expect(providerInstaller).toContain("VERSION='2.1.3'");
    expect(providerInstaller).toContain("PLATFORM='linux_amd64'");
    expect(providerInstaller).toContain("EXPECTED_SHA256='41b14bbf195131364d58d3f5d33face1d7f151d6b4ca6175bf6b0f6b83ede5a7'");
    expect(providerInstaller).toContain('sha256sum --check --strict');
    expect(providerInstaller).toContain('github.com/cloud-ru/evo-terraform/releases/download');
  });

  test('Cloud.ru input discovery is main-only, least-privilege and cannot apply infrastructure', () => {
    expect(cloudruDiscovery).toContain('name: Cloud.ru Production Input Discovery');
    expect(cloudruDiscovery).toContain('environment: production-cloudru');
    expect(cloudruDiscovery).toContain('[[ "$GITHUB_REF" == "refs/heads/main" ]]');
    expect(cloudruDiscovery).toContain('ref: main');
    expect(cloudruDiscovery).toContain('terraform plan -input=false -lock=false -out=discovery.tfplan');
    expect(cloudruDiscovery).toContain('terraform show -json discovery.tfplan > discovery.json');
    expect(cloudruDiscovery).toContain('def cell(value):');
    expect(cloudruDiscovery).toContain('if: ${{ always() }}');
    expect(cloudruDiscovery).toContain('rm -f discovery.tfplan discovery.json terraform.tfstate terraform.tfstate.backup');
    expect(cloudruDiscovery).not.toMatch(/terraform\s+apply/);
    expect(cloudruDiscovery).not.toMatch(/terraform\s+destroy/);

    expect((cloudruDiscovery.match(/secrets\.CLOUDRU_PROJECT_ID/g) || [])).toHaveLength(2);
    expect((cloudruDiscovery.match(/secrets\.CLOUDRU_AUTH_KEY_ID/g) || [])).toHaveLength(2);
    expect((cloudruDiscovery.match(/secrets\.CLOUDRU_AUTH_SECRET/g) || [])).toHaveLength(2);

    for (const dataSource of [
      'cloudru_evolution_compute_zone_collection',
      'cloudru_evolution_compute_flavor_collection',
      'cloudru_evolution_compute_disk_type_collection',
      'cloudru_evolution_compute_image_collection',
      'cloudru_evolution_postgresql_specification_collection',
    ]) {
      expect(discoveryMain).toContain(`data "${dataSource}"`);
    }
    for (const output of [
      'enabled_zones',
      'vm_flavors',
      'disk_types',
      'ubuntu_2404_images',
      'postgres16_specifications',
    ]) {
      expect(discoveryMain).toContain(`output "${output}"`);
      expect(cloudruDiscovery).toContain(`outputs.get('${output}'`);
    }
    expect(discoveryMain).toContain('version_name = "16"');
    expect(discoveryMain).not.toMatch(/^resource\s+"/m);
  });

  test('production Cloud.ru compute selections use explicit discovered IDs and reject incompatible choices', () => {
    for (const variable of ['zone_id', 'vm_flavor_id', 'boot_disk_type_id', 'vm_image_id', 'postgres_specification_id']) {
      expect(productionTerraformVariables).toContain(`variable "${variable}"`);
    }

    expect(productionTerraformVariables).not.toContain('default     = "ru.AZ-1"');
    expect(productionTerraformVariables).not.toContain('default     = "gen-1-1"');
    expect(productionTerraformVariables).not.toContain('default     = "SSD"');
    expect(productionTerraformVariables).not.toContain('variable "zone"');
    expect(productionTerraformVariables).not.toContain('variable "vm_flavor"');
    expect(productionTerraformVariables).not.toContain('variable "boot_disk_type"');

    expect(productionTerraformMain).toContain('id = var.zone_id');
    expect(productionTerraformMain).toContain('id = var.vm_flavor_id');
    expect(productionTerraformMain).toContain('id = var.boot_disk_type_id');
    expect(productionTerraformMain).toContain('zone_id must identify exactly one enabled availability zone');
    expect(productionTerraformMain).toContain('vm_flavor_id must identify exactly one VM flavor enabled in zone_id');
    expect(productionTerraformMain).toContain('boot_disk_type_id must identify exactly one disk type enabled in zone_id');
    expect(productionTerraformMain).toContain('vm_image_id must identify exactly one Ubuntu 24.04 image enabled in zone_id');
    expect(productionTerraformMain).toContain('boot_disk_size_gb is below the selected Ubuntu image minimum disk size');
    expect(productionTerraformMain).toContain('vm_flavor_id does not satisfy the selected Ubuntu image minimum CPU/RAM requirements');
  });

  test('all obsolete manual/local production entrypoints are fail-closed', () => {
    expect(legacyManualRelease).toContain('Legacy Manual Release (Retired)');
    expect(legacyManualRelease).toContain('exit 1');
    expect(legacyManualRelease).not.toContain('release-prod.ps1');
    expect(legacyManualRelease).not.toContain('VM_SSH_KEY');

    expect(legacyPowerShellRelease).toContain('scripts/release-prod.ps1 is retired');
    expect(legacyPowerShellRelease).toContain('Deploy Frontend Production');
    expect(legacyPowerShellRelease).toContain('Deploy Backend to Cloud.ru');
    expect(legacyPowerShellRelease).not.toContain('npx vercel');
    expect(legacyPowerShellRelease).not.toContain('ssh ');

    expect(legacyShellRelease).toContain('scripts/deploy.sh is retired');
    expect(legacyShellRelease).toContain('exit 1');
    expect(legacyShellRelease).not.toContain('release-prod.ps1');

    expect(releaseChecklist).toContain('local `scripts/release-prod.ps1` and `scripts/deploy.sh` entrypoints are retired');
    expect(releaseChecklist).toContain('Deploy Frontend Production');
    expect(releaseChecklist).toContain('Deploy Backend to Cloud.ru');
  });

  test('operator-facing backend environment contract remains complete', () => {
    for (const variable of [
      'ADMIN_API_SECRET',
      'WEBAPP_URL',
      'FRONTEND_URL',
      'CORS_ALLOWED_ORIGINS',
      'PAYMENTS_ENABLED',
      'REWARDED_AD_PROVIDER',
      'ADSGRAM_SECRET',
      'PROPELLER_SECRET',
      'BACKEND_IMAGE_TAG',
    ]) {
      expect(envExample).toContain(`${variable}=`);
    }
  });
});

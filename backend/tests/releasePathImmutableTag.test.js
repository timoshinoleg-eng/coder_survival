import { readFileSync } from 'fs';

const repoFile = (relativePath) => readFileSync(new URL(`../../${relativePath}`, import.meta.url), 'utf8');

const manualRelease = repoFile('.github/workflows/manual-release.yml');
const preflight = repoFile('scripts/release-preflight.ps1');
const release = repoFile('scripts/release-prod.ps1');
const coreSmoke = repoFile('scripts/smoke-core-prod.ps1');
const offerSmoke = repoFile('scripts/smoke-offers.ps1');
const tagHelper = repoFile('scripts/release-image-tag.ps1');
const compose = repoFile('docker-compose.backend.yml');
const runbook = repoFile('docs/MIGRATION_RUNBOOK_059_061.md');
const envExample = repoFile('backend/.env.example');

describe('immutable backend image tag release-path contract', () => {
  test('derives one exact reviewed GitHub SHA tag before compose validation and forwards it to both release scripts', () => {
    expect(manualRelease).toContain('BACKEND_IMAGE_TAG: git-${{ github.sha }}');
    expect(manualRelease).toContain('docker compose -f docker-compose.backend.yml config --quiet');
    expect(manualRelease).toContain('scripts/release-preflight.ps1 -BackendImageTag $env:BACKEND_IMAGE_TAG');
    expect(manualRelease).toContain('BackendImageTag = $env:BACKEND_IMAGE_TAG');
    expect(manualRelease).toContain('backend_image_tag = "${{ env.BACKEND_IMAGE_TAG }}"');
  });

  test('rejects mutable, abbreviated or malformed tags before preflight, build, restart or smoke', () => {
    expect(tagHelper).toContain("$tag -eq \"latest\"");
    expect(tagHelper).toContain("'^git-[0-9a-f]{40}$'");

    for (const script of [preflight, release, coreSmoke, offerSmoke]) {
      expect(script).toContain('Assert-ReviewedBackendImageTag -BackendImageTag $BackendImageTag');
    }
  });

  test('passes the same exact tag through preflight Compose validation, remote build/restart and every reachable smoke Compose invocation', () => {
    expect(preflight).toContain('$checkedOutCommit = (git -C $repoRoot rev-parse HEAD).Trim().ToLowerInvariant()');
    expect(preflight).toContain('$backendImageTag -ne "git-$checkedOutCommit"');
    expect(preflight).toContain('Invoke-DockerComposeConfig -ComposePath $composePath -BackendImageTag $backendImageTag');
    expect(preflight).toContain('$env:BACKEND_IMAGE_TAG = $BackendImageTag');
    expect(preflight).toContain('env "BACKEND_IMAGE_TAG=$BackendImageTag" docker compose');

    expect(release).toContain('$checkedOutCommit = (git -C $repoRoot rev-parse HEAD).Trim().ToLowerInvariant()');
    expect(release).toContain('$backendImageTag -ne "git-$checkedOutCommit"');
    expect(release).toContain("BACKEND_IMAGE_TAG='__BACKEND_IMAGE_TAG__'");
    expect(release).toContain('docker build --no-cache -t "${BACKEND_IMAGE_REPO}:${BACKEND_IMAGE_TAG}" ./backend');
    expect(release).toContain('-BackendImageTag $backendImageTag');

    expect(coreSmoke).toContain("BACKEND_IMAGE_TAG='$backendImageTag' docker compose");
    expect(coreSmoke).toContain('-BackendImageTag $backendImageTag -BaseUrl');
    expect(offerSmoke).toContain("BACKEND_IMAGE_TAG='$backendImageTag' docker compose");
  });

  test('has no mutable latest fallback in the active release path and requires a tag in production Compose', () => {
    expect(compose).toContain('image: coder-survival-backend:${BACKEND_IMAGE_TAG:?BACKEND_IMAGE_TAG is required}');
    expect(compose).not.toContain('${BACKEND_IMAGE_TAG:-latest}');

    for (const source of [manualRelease, preflight, release, coreSmoke, offerSmoke, compose]) {
      expect(source).not.toMatch(/coder-survival-backend:latest/);
      expect(source).not.toMatch(/BACKEND_IMAGE_TAG[^\n]*latest/);
    }
  });

  test('keeps operator-facing contract and startup evidence aligned with the guarded path', () => {
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

    expect(runbook).toContain('up -d --wait --wait-timeout 90 --force-recreate --no-build backend');
  });
});

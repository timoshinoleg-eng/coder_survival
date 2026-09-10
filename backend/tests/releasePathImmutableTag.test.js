import { readFileSync } from 'fs';

const repoFile = (relativePath) => readFileSync(new URL(`../../${relativePath}`, import.meta.url), 'utf8');

const backendRelease = repoFile('.github/workflows/deploy-backend.yml');
const frontendRelease = repoFile('.github/workflows/deploy-frontend-production.yml');
const legacyManualRelease = repoFile('.github/workflows/manual-release.yml');
const legacyPowerShellRelease = repoFile('scripts/release-prod.ps1');
const legacyShellRelease = repoFile('scripts/deploy.sh');
const releaseChecklist = repoFile('scripts/release-manual-checklist.md');
const compose = repoFile('docker-compose.backend.yml');
const envExample = repoFile('backend/.env.example');

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

# DuckDNS API Status

The DuckDNS cutover is complete. The current public backend hostname is
`coder-survival-api.duckdns.org`; it is the upstream for Vercel rewrites and
must remain the target of public health checks.

## Operating boundary

- The VM address and SSH identity are secret-backed operator configuration, not
  repository defaults.
- TLS terminates on the VM proxy. The backend container remains loopback-only.
- DNS changes require the DuckDNS token and an explicit current VM IPv4 value:

  ```powershell
  pwsh -File scripts/duckdns-update.ps1 -Token <token> -IpAddress <current-vm-ip>
  ```

- A DNS or proxy change is a production release: first pass CI, preserve the
  database backup and rollback commit, then use the release runbook.

## Verification

```powershell
Invoke-RestMethod https://coder-survival-api.duckdns.org/health
pwsh -File scripts/domain-cutover-check.ps1 `
  -AppBaseUrl https://frontend-ashy-alpha-77.vercel.app `
  -BotWebhookUrl https://coder-survival-bot.vercel.app/api/webhook `
  -ExpectedApiHost coder-survival-api.duckdns.org
```

`domain-cutover-check.ps1` requires `CODER_SURVIVAL_VM_SSH_TARGET` or an
explicit `-VmHost user@host`; it never chooses a VM target itself.

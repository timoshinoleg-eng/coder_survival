[CmdletBinding()]
param(
  [string]$ApiHost = "coder-survival-api.duckdns.org",
  [string]$VmUser = "ubuntu",
  [string]$VmHost = "111.88.247.195",
  [string]$CertbotEmail = "timoshin.oleg@gmail.com"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if ($ApiHost -notmatch '^[a-z0-9.-]+$') {
  throw "ApiHost must be a lowercase hostname"
}

$remoteScript = @'
set -euo pipefail

sudo tee /etc/nginx/sites-available/coder-survival-api >/dev/null <<'EOF'
server {
    server_name __API_HOST__;

    location /api/ {
        proxy_pass http://127.0.0.1:8080/api/;
        proxy_http_version 1.1;
        proxy_set_header Host __NGINX_HOST__;
        proxy_set_header X-Real-IP __NGINX_REMOTE_ADDR__;
        proxy_set_header X-Forwarded-For __NGINX_PROXY_ADD_X_FORWARDED_FOR__;
        proxy_set_header X-Forwarded-Proto __NGINX_SCHEME__;
        proxy_hide_header Access-Control-Allow-Origin;
        proxy_hide_header Access-Control-Allow-Methods;
        proxy_hide_header Access-Control-Allow-Headers;
        add_header Access-Control-Allow-Origin "*" always;
        add_header Access-Control-Allow-Methods "GET, POST, OPTIONS" always;
        add_header Access-Control-Allow-Headers "Content-Type, X-Telegram-Init-Data" always;
        if (__NGINX_REQUEST_METHOD__ = OPTIONS) {
            return 204;
        }
    }

    location /health {
        proxy_pass http://127.0.0.1:8080/health;
        proxy_http_version 1.1;
        proxy_set_header Host __NGINX_HOST__;
        proxy_set_header X-Real-IP __NGINX_REMOTE_ADDR__;
        proxy_set_header X-Forwarded-For __NGINX_PROXY_ADD_X_FORWARDED_FOR__;
        proxy_set_header X-Forwarded-Proto __NGINX_SCHEME__;
    }

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Host __NGINX_HOST__;
        proxy_set_header X-Real-IP __NGINX_REMOTE_ADDR__;
        proxy_set_header X-Forwarded-For __NGINX_PROXY_ADD_X_FORWARDED_FOR__;
        proxy_set_header X-Forwarded-Proto __NGINX_SCHEME__;
    }

    listen [::]:80;
    listen 80;
}
EOF

sudo ln -sfn /etc/nginx/sites-available/coder-survival-api /etc/nginx/sites-enabled/coder-survival-api
sudo nginx -t
sudo systemctl reload nginx
sudo certbot --nginx --non-interactive --agree-tos -m "__CERTBOT_EMAIL__" -d "__API_HOST__" --redirect
sudo nginx -t
sudo systemctl reload nginx
curl -fsS "https://__API_HOST__/health"
'@
$remoteScript = $remoteScript.Replace('__API_HOST__', $ApiHost).Replace('__CERTBOT_EMAIL__', $CertbotEmail)
$remoteScript = $remoteScript.Replace('__NGINX_HOST__', '$host')
$remoteScript = $remoteScript.Replace('__NGINX_REMOTE_ADDR__', '$remote_addr')
$remoteScript = $remoteScript.Replace('__NGINX_PROXY_ADD_X_FORWARDED_FOR__', '$proxy_add_x_forwarded_for')
$remoteScript = $remoteScript.Replace('__NGINX_SCHEME__', '$scheme')
$remoteScript = $remoteScript.Replace('__NGINX_REQUEST_METHOD__', '$request_method')

ssh "$VmUser@$VmHost" $remoteScript

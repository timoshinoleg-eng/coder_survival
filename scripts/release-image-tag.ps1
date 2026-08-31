Set-StrictMode -Version Latest

function Assert-ReviewedBackendImageTag {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [string]$BackendImageTag
  )

  $tag = $BackendImageTag.Trim()
  if ([string]::IsNullOrWhiteSpace($tag)) {
    throw "BACKEND_IMAGE_TAG is required and must identify the reviewed GitHub commit."
  }

  if ($tag -eq "latest") {
    throw "BACKEND_IMAGE_TAG must be an immutable git-<40-hex-sha> tag; mutable latest is forbidden."
  }

  if ($tag -notmatch '^git-[0-9a-f]{40}$') {
    throw "BACKEND_IMAGE_TAG must match git-<40 lowercase hexadecimal GitHub SHA>."
  }

  return $tag
}

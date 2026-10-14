param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('Store', 'Status')]
  [string]$Action,

  [Parameter(Mandatory = $true)]
  [string]$StorePath
)

$ErrorActionPreference = 'Stop'

if ($Action -eq 'Store') {
  $freelancerToken = Read-Host 'Freelancer.com access token' -AsSecureString
  $linkedinClientId = Read-Host 'LinkedIn client ID' -AsSecureString
  $linkedinClientSecret = Read-Host 'LinkedIn client secret' -AsSecureString

  $store = [ordered]@{
    version = 1
    freelancerAccessToken = ConvertFrom-SecureString -SecureString $freelancerToken
    linkedinClientId = ConvertFrom-SecureString -SecureString $linkedinClientId
    linkedinClientSecret = ConvertFrom-SecureString -SecureString $linkedinClientSecret
  }
  $parent = Split-Path -Parent $StorePath
  if (-not (Test-Path -LiteralPath $parent)) {
    New-Item -ItemType Directory -Path $parent -Force | Out-Null
  }
  $store | ConvertTo-Json | Set-Content -LiteralPath $StorePath -Encoding UTF8
  Write-Output 'Credentials encrypted for the current Windows account.'
  exit 0
}

if (-not (Test-Path -LiteralPath $StorePath -PathType Leaf)) {
  throw 'Encrypted credential store was not found.'
}

$store = Get-Content -LiteralPath $StorePath -Raw | ConvertFrom-Json
if ($store.version -ne 1) {
  throw 'Encrypted credential store version is unsupported.'
}

$freelancerToken = ConvertTo-SecureString -String $store.freelancerAccessToken
$linkedinClientId = ConvertTo-SecureString -String $store.linkedinClientId
$linkedinClientSecret = ConvertTo-SecureString -String $store.linkedinClientSecret

[ordered]@{
  freelancerAccessTokenConfigured = $freelancerToken.Length -gt 0
  linkedinClientConfigured = $linkedinClientId.Length -gt 0 -and $linkedinClientSecret.Length -gt 0
} | ConvertTo-Json -Compress | Write-Output

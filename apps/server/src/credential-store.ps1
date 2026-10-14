param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('Store', 'Status', 'VerifyFreelancer', 'GetLinkedInClientCredentials', 'StoreLinkedInAccessToken', 'DeleteLinkedInAccessToken')]
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

if ($Action -eq 'GetLinkedInClientCredentials') {
  $secureClientId = ConvertTo-SecureString -String $store.linkedinClientId
  $secureClientSecret = ConvertTo-SecureString -String $store.linkedinClientSecret
  $clientIdPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureClientId)
  $clientSecretPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureClientSecret)
  try {
    [ordered]@{
      clientId = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($clientIdPointer)
      clientSecret = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($clientSecretPointer)
    } | ConvertTo-Json -Compress | Write-Output
  } finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($clientIdPointer)
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($clientSecretPointer)
  }
  exit 0
}

if ($Action -eq 'StoreLinkedInAccessToken') {
  $payload = [Console]::In.ReadToEnd() | ConvertFrom-Json
  $accessToken = [string]$payload.accessToken
  $expiryValue = $payload.expiresAt
  $parsedExpiry = [DateTimeOffset]::MinValue
  $expiryValid = $false
  if ($expiryValue -is [DateTime]) {
    $parsedExpiry = [DateTimeOffset]$expiryValue.ToUniversalTime()
    $expiryValid = $true
  } elseif ([DateTimeOffset]::TryParse([string]$expiryValue, [System.Globalization.CultureInfo]::InvariantCulture, [System.Globalization.DateTimeStyles]::RoundtripKind, [ref]$parsedExpiry)) {
    $expiryValid = $true
  }
  if ($accessToken.Length -lt 100 -or $accessToken.Length -gt 3000 -or -not $expiryValid) {
    throw 'LinkedIn authorization response is invalid.'
  }
  $expiresAt = $parsedExpiry.ToUniversalTime().ToString('o')
  $secureAccessToken = ConvertTo-SecureString -String $accessToken -AsPlainText -Force
  $store | Add-Member -MemberType NoteProperty -Name linkedinAccessToken -Value (ConvertFrom-SecureString -SecureString $secureAccessToken) -Force
  $store | Add-Member -MemberType NoteProperty -Name linkedinAccessTokenExpiresAt -Value $expiresAt -Force
  $temporaryPath = "$StorePath.tmp"
  [System.IO.File]::WriteAllText($temporaryPath, ($store | ConvertTo-Json -Compress), [System.Text.UTF8Encoding]::new($false))
  Move-Item -LiteralPath $temporaryPath -Destination $StorePath -Force | Out-Null
  $accessToken = $null
  $payload = $null
  [ordered]@{ stored = $true } | ConvertTo-Json -Compress | Write-Output
  exit 0
}

if ($Action -eq 'DeleteLinkedInAccessToken') {
  $null = $store.PSObject.Properties.Remove('linkedinAccessToken')
  $null = $store.PSObject.Properties.Remove('linkedinAccessTokenExpiresAt')
  $temporaryPath = "$StorePath.tmp"
  [System.IO.File]::WriteAllText($temporaryPath, ($store | ConvertTo-Json -Compress), [System.Text.UTF8Encoding]::new($false))
  Move-Item -LiteralPath $temporaryPath -Destination $StorePath -Force | Out-Null
  [ordered]@{ removed = $true } | ConvertTo-Json -Compress | Write-Output
  exit 0
}

if ($Action -eq 'VerifyFreelancer') {
  $secureToken = ConvertTo-SecureString -String $store.freelancerAccessToken
  $tokenPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureToken)
  try {
    $accessToken = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($tokenPointer)
    try {
      $headers = @{ 'Freelancer-OAuth-V1' = $accessToken }
      $selfResponse = Invoke-RestMethod -Method Get -Uri 'https://www.freelancer.com/api/users/0.1/self/' -Headers $headers -TimeoutSec 12
      $profileRead = $null -ne $selfResponse.result.id
      if (-not $profileRead) {
        [ordered]@{ connected = $false; readProfile = $false; readProjects = $false; reason = 'invalid_response' } | ConvertTo-Json -Compress | Write-Output
        exit 0
      }
      try {
        $projectsResponse = Invoke-RestMethod -Method Get -Uri 'https://www.freelancer.com/api/projects/0.1/projects/active/?query=typescript&limit=1&offset=0' -Headers $headers -TimeoutSec 12
        $projectsRead = $null -ne $projectsResponse.result
        $projectReason = if ($projectsRead) { 'verified' } else { 'invalid_response' }
      } catch {
        $projectStatusCode = 0
        try { $projectStatusCode = [int]$_.Exception.Response.StatusCode } catch { }
        $projectsRead = $false
        $projectReason = switch ($projectStatusCode) {
          403 { 'project_scope_denied' }
          429 { 'rate_limited' }
          default { 'projects_unavailable' }
        }
      }
      [ordered]@{ connected = $true; readProfile = $true; readProjects = $projectsRead; reason = $projectReason } | ConvertTo-Json -Compress | Write-Output
    } catch {
      $statusCode = 0
      try { $statusCode = [int]$_.Exception.Response.StatusCode } catch { }
      $reason = switch ($statusCode) {
        401 { 'invalid_token' }
        403 { 'scope_denied' }
        429 { 'rate_limited' }
        default { 'verification_unavailable' }
      }
      [ordered]@{ connected = $false; readProfile = $false; readProjects = $false; reason = $reason } | ConvertTo-Json -Compress | Write-Output
    } finally {
      $accessToken = $null
    }
  } finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($tokenPointer)
  }
  exit 0
}

$freelancerToken = ConvertTo-SecureString -String $store.freelancerAccessToken
$linkedinClientId = ConvertTo-SecureString -String $store.linkedinClientId
$linkedinClientSecret = ConvertTo-SecureString -String $store.linkedinClientSecret

[ordered]@{
  freelancerAccessTokenConfigured = $freelancerToken.Length -gt 0
  linkedinClientConfigured = $linkedinClientId.Length -gt 0 -and $linkedinClientSecret.Length -gt 0
  linkedinAccessTokenConfigured = $null -ne $store.linkedinAccessToken -and $store.linkedinAccessToken.StartsWith('01000000d08c9ddf')
  linkedinAccessTokenExpiresAt = $store.linkedinAccessTokenExpiresAt
} | ConvertTo-Json -Compress | Write-Output

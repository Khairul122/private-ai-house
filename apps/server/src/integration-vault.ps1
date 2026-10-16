param([ValidateSet('Read','Write')][string]$Action,[string]$StorePath)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Security
[Console]::InputEncoding = [Text.Encoding]::UTF8
[Console]::OutputEncoding = [Text.Encoding]::UTF8
if ($Action -eq 'Write') {
  $plain = [Console]::In.ReadToEnd()
  $bytes = [Text.Encoding]::UTF8.GetBytes($plain)
  $cipher = [Security.Cryptography.ProtectedData]::Protect($bytes,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)
  $temporary = $StorePath + '.tmp'
  [IO.File]::WriteAllText($temporary,[Convert]::ToBase64String($cipher),[Text.Encoding]::ASCII)
  Move-Item -LiteralPath $temporary -Destination $StorePath -Force
} elseif (Test-Path -LiteralPath $StorePath) {
  $cipher = [Convert]::FromBase64String([IO.File]::ReadAllText($StorePath))
  $bytes = [Security.Cryptography.ProtectedData]::Unprotect($cipher,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)
  [Console]::Write([Text.Encoding]::UTF8.GetString($bytes))
}

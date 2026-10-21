# Adds a directory to, or removes it from, the user's PATH. Run by the NSIS installer and uninstaller (installer.nsh).
# Works on the registry value directly, so %VARIABLES% already in PATH stay unexpanded, and touches nothing else.
param(
  [Parameter(Mandatory)][ValidateSet('add', 'remove')][string]$Action,
  [Parameter(Mandatory)][string]$Dir,
  # The variable to edit; only the tests use another one.
  [string]$Variable = 'Path'
)
$ErrorActionPreference = 'Stop'

$key = Get-Item -LiteralPath 'HKCU:\Environment'
$current = [string]$key.GetValue($Variable, '', 'DoNotExpandEnvironmentNames')
$wanted = $Dir.TrimEnd('\')
$parts = @($current -split ';' | Where-Object { $_ -ne '' -and $_.TrimEnd('\') -ne $wanted })
if ($Action -eq 'add') { $parts += $Dir }
Set-ItemProperty -LiteralPath 'HKCU:\Environment' -Name $Variable -Value ($parts -join ';') -Type ExpandString

# Setting a user environment variable makes Windows tell running programs that the environment changed.
[Environment]::SetEnvironmentVariable('DRYLAND_PATH_CHANGED', $null, 'User')

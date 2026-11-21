$ErrorActionPreference = "Stop"

$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$vbs = Join-Path $root "packaging\windows\Launch-HospitalityPOS.vbs"
$icon = Join-Path $root "packaging\icons\hospitality-pos.ico"

$wsh = New-Object -ComObject WScript.Shell

$targets = @(
  (Join-Path ([Environment]::GetFolderPath("Desktop")) "Hospitality POS.lnk"),
  (Join-Path ([Environment]::GetFolderPath("Programs")) "Hospitality POS.lnk")
)

foreach ($target in $targets) {
  $shortcut = $wsh.CreateShortcut($target)
  $shortcut.TargetPath = "wscript.exe"
  $shortcut.Arguments = "`"$vbs`""
  $shortcut.WorkingDirectory = $root
  $shortcut.Description = "Start the local Hospitality POS server and open the app"
  $shortcut.WindowStyle = 1
  if (Test-Path $icon) { $shortcut.IconLocation = $icon }
  $shortcut.Save()
  Write-Host "Created $target"
}

Write-Host "Double-click 'Hospitality POS' on the Desktop. No console window will appear."

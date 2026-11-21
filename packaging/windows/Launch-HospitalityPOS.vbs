Option Explicit
' Launch Hospitality POS with no visible console window.
' wscript.exe has no console; the PowerShell it runs is forced hidden.
Dim fso, shell, root, script
Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")

root = fso.GetParentFolderName(fso.GetParentFolderName(fso.GetParentFolderName(WScript.ScriptFullName)))
script = root & "\packaging\windows\launch-edge.ps1"

shell.Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & script & """", 0, False

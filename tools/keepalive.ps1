<#
keepalive.ps1
============
Mantiene despierta la base de Supabase (plan Free: se pausa tras ~7 dias sin
consultas) y, si el contenedor vive en un host que se duerme (Render Free), lo
despierta. No necesita credenciales: solo llama al endpoint publico /api/health/db
del backend, que consulta la base (SELECT 1).

Uso:
  powershell -ExecutionPolicy Bypass -File tools\keepalive.ps1               # un ping
  powershell -ExecutionPolicy Bypass -File tools\keepalive.ps1 -Instalar     # tarea cada 3 h
  powershell -ExecutionPolicy Bypass -File tools\keepalive.ps1 -Desinstalar  # quita la tarea

URL alternativa (si el dominio cambia):
  $env:KEEPALIVE_URL = 'https://mi-dominio' ; powershell -File tools\keepalive.ps1
#>
param(
    [switch]$Instalar,
    [switch]$Desinstalar
)

$ErrorActionPreference = 'Stop'

$AppUrl = $env:KEEPALIVE_URL
if (-not $AppUrl) { $AppUrl = 'https://asistencia-ggm.onrender.com' }

$Tarea = 'GGM-Keepalive'
$Script = Join-Path $PSScriptRoot 'keepalive.ps1'

if ($Desinstalar) {
    Unregister-ScheduledTask -TaskName $Tarea -Confirm:$false -ErrorAction SilentlyContinue
    Write-Host "Tarea $Tarea eliminada."
    exit 0
}

function Ping {
    # curl.exe existe en Windows 10/11; -s silencioso, -f falla si HTTP != 2xx, -o NUL sin body.
    & curl.exe -sf -o NUL --connect-timeout 30 --max-time 90 "${AppUrl}/api/health/db"
    $codigo = $LASTEXITCODE
    if ($codigo -ne 0) {
        Write-Host "Keepalive fallo (exit $codigo): ${AppUrl}/api/health/db"
        exit $codigo
    }
    Write-Host "Keepalive ok: ${AppUrl}/api/health/db"
}

if ($Instalar) {
    $primera = Get-Date (Get-Date).AddMinutes(3) -Format 'HH:mm'
    $accion = New-ScheduledTaskAction -Execute 'powershell.exe' `
        -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$Script`""
    $disparo = New-ScheduledTaskTrigger -Once -At $primera `
        -RepetitionInterval (New-TimeSpan -Hours 3) `
        -RepetitionDuration (New-TimeSpan -Days 3650)
    $config = New-ScheduledTaskSettingsSet -StartWhenAvailable
    Register-ScheduledTask -TaskName $Tarea -Action $accion -Trigger $disparo `
        -Settings $config -RunLevel Limited -Force | Out-Null
    Write-Host "Tarea $Tarea programada cada 3 horas (primera carrera $primera)."
    exit 0
}

Ping
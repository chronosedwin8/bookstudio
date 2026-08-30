# Prepara BookStudio para usarse desde otros equipos de la red local.
#
#   .\scripts\red-local.ps1                  Muestra las direcciones de acceso
#   .\scripts\red-local.ps1 -AbrirFirewall   Abre los puertos 4000 y 5173 (requiere admin)
#   .\scripts\red-local.ps1 -Certificado     Genera el certificado HTTPS para camara y microfono
[CmdletBinding()]
param(
    [switch]$AbrirFirewall,
    [switch]$Certificado
)

$ErrorActionPreference = 'Stop'
$raiz = Split-Path $PSScriptRoot
$puertoWeb = 5173
$puertoApi = 4000

function Get-DireccionesLocales {
    Get-NetIPAddress -AddressFamily IPv4 |
        Where-Object {
            $_.IPAddress -ne '127.0.0.1' -and
            $_.PrefixOrigin -ne 'WellKnown' -and
            ($_.IPAddress -match '^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)')
        } |
        Sort-Object -Property InterfaceMetric |
        Select-Object -ExpandProperty IPAddress -Unique
}

function Find-OpenSsl {
    $cmd = Get-Command openssl -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
    # Git para Windows incluye openssl aunque no este en el PATH.
    foreach ($ruta in @("$env:ProgramFiles\Git\usr\bin\openssl.exe", "${env:ProgramFiles(x86)}\Git\usr\bin\openssl.exe")) {
        if (Test-Path $ruta) { return $ruta }
    }
    return $null
}

$direcciones = @(Get-DireccionesLocales)
if (-not $direcciones) {
    Write-Host 'No se encontro ninguna direccion de red local. Conectate a la red del colegio.' -ForegroundColor Red
    exit 1
}

# --- Reglas de firewall ---
if ($AbrirFirewall) {
    $esAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()
        ).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

    if (-not $esAdmin) {
        Write-Host 'Abrir el firewall requiere PowerShell como administrador.' -ForegroundColor Red
        Write-Host 'Abre una consola con "Ejecutar como administrador" y repite el comando.' -ForegroundColor Yellow
        exit 1
    }

    foreach ($puerto in @($puertoWeb, $puertoApi)) {
        $nombre = "BookStudio $puerto"
        if (Get-NetFirewallRule -DisplayName $nombre -ErrorAction SilentlyContinue) {
            Write-Host "  Ya existia la regla '$nombre'" -ForegroundColor DarkGray
            continue
        }
        # Solo redes privadas: nunca se expone en una red publica.
        New-NetFirewallRule -DisplayName $nombre -Direction Inbound -Action Allow `
            -Protocol TCP -LocalPort $puerto -Profile Private | Out-Null
        Write-Host "  Regla creada: $nombre (TCP entrante, perfil privado)" -ForegroundColor Green
    }
    Write-Host ''
}

# --- Certificado HTTPS ---
if ($Certificado) {
    $openssl = Find-OpenSsl
    if (-not $openssl) {
        Write-Host 'No se encontro openssl. Instala Git para Windows y repite el comando.' -ForegroundColor Red
        exit 1
    }

    $destino = Join-Path $raiz 'apps\web\.certs'
    New-Item -ItemType Directory -Force -Path $destino | Out-Null
    $clave = Join-Path $destino 'lan-key.pem'
    $cert = Join-Path $destino 'lan-cert.pem'

    # El certificado debe nombrar cada IP desde la que se abrira el editor.
    $altNames = @('DNS:localhost', 'IP:127.0.0.1') + ($direcciones | ForEach-Object { "IP:$_" })
    $config = Join-Path $env:TEMP "bookstudio-cert-$(Get-Random).cnf"
    @"
[req]
distinguished_name = dn
x509_extensions = ext
prompt = no

[dn]
CN = BookStudio red local

[ext]
subjectAltName = $($altNames -join ',')
basicConstraints = critical,CA:FALSE
keyUsage = digitalSignature,keyEncipherment
extendedKeyUsage = serverAuth
"@ | Out-File -FilePath $config -Encoding ascii

    try {
        & $openssl req -x509 -newkey rsa:2048 -sha256 -days 825 -nodes `
            -keyout $clave -out $cert -config $config 2>&1 | Out-Null
        if ($LASTEXITCODE -ne 0) { throw "openssl devolvio el codigo $LASTEXITCODE" }
    } finally {
        Remove-Item $config -ErrorAction SilentlyContinue
    }

    Write-Host 'Certificado generado:' -ForegroundColor Green
    Write-Host "  $clave"
    Write-Host "  $cert"
    Write-Host '  Cubre: ' -NoNewline; Write-Host ($altNames -join ', ') -ForegroundColor DarkGray
    Write-Host '  Vite lo usara automaticamente al arrancar (npm run dev:web).' -ForegroundColor DarkGray
    Write-Host ''
}

# --- Direcciones de acceso ---
$hayCert = Test-Path (Join-Path $raiz 'apps\web\.certs\lan-cert.pem')
$esquema = if ($hayCert) { 'https' } else { 'http' }

Write-Host '== BookStudio en la red local ==' -ForegroundColor Cyan
Write-Host ''
Write-Host 'Abre esta direccion desde tablets, moviles u otros equipos de la misma red:'
foreach ($ip in $direcciones) {
    Write-Host "  $esquema`://${ip}:$puertoWeb" -ForegroundColor Green
}

Write-Host ''
if ($hayCert) {
    Write-Host 'HTTPS activo: la camara y el microfono funcionaran desde otros equipos.' -ForegroundColor Green
    Write-Host 'El certificado es autofirmado: la primera vez el navegador avisara.' -ForegroundColor Yellow
    Write-Host 'Pulsa "Configuracion avanzada" y "Continuar" para aceptarlo.' -ForegroundColor Yellow
} else {
    Write-Host 'Sin HTTPS la camara y el microfono quedan bloqueados fuera de este equipo:' -ForegroundColor Yellow
    Write-Host 'los navegadores solo permiten grabar en contextos seguros.' -ForegroundColor Yellow
    Write-Host 'Ejecuta  .\scripts\red-local.ps1 -Certificado  para habilitarlos.' -ForegroundColor Yellow
}

Write-Host ''
Write-Host 'Si otro equipo no conecta, abre los puertos con:' -ForegroundColor DarkGray
Write-Host '  .\scripts\red-local.ps1 -AbrirFirewall   (PowerShell como administrador)' -ForegroundColor DarkGray

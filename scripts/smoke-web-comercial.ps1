# Ensayo funcional de la web comercial: portada, portal de clientes y solicitudes.
$ErrorActionPreference = 'Stop'
$base = 'http://localhost:4000/api'
$web = 'http://localhost:5173'
$pass = 0; $fail = 0

function Test-Step {
    param([string]$Name, [scriptblock]$Body)
    try {
        $result = & $Body
        Write-Host "  OK   $Name" -ForegroundColor Green
        $script:pass++
        return $result
    } catch {
        Write-Host "  FAIL $Name -> $($_.Exception.Message)" -ForegroundColor Red
        $script:fail++
        return $null
    }
}

function Invoke-Api {
    param([string]$Method, [string]$Path, $Body, [string]$Token)
    $headers = @{}
    if ($Token) { $headers['Authorization'] = "Bearer $Token" }
    $args = @{ Method = $Method; Uri = "$base$Path"; Headers = $headers }
    if ($null -ne $Body) {
        $args['Body'] = [Text.Encoding]::UTF8.GetBytes(($Body | ConvertTo-Json -Depth 10 -Compress))
        $args['ContentType'] = 'application/json; charset=utf-8'
    }
    Invoke-RestMethod @args
}

function Assert-Status {
    param([scriptblock]$Body, [int]$Expected)
    try { & $Body; throw "No fallo (esperaba $Expected)" }
    catch {
        $code = $_.Exception.Response.StatusCode.value__
        if ($code -ne $Expected) { throw "Esperaba $Expected, llego $code" }
    }
}

Write-Host "`n== Web comercial: ensayo funcional ==" -ForegroundColor Cyan

$suffix = [guid]::NewGuid().ToString('N').Substring(0, 6)

# --- Solicitudes de contacto ---
Write-Host "`n-- Solicitudes --" -ForegroundColor Cyan

Test-Step 'Cualquiera puede enviar una solicitud, sin cuenta' {
    $r = Invoke-Api POST '/contact' @{
        name = 'Directora de Primaria'; email = "demo.$suffix@colegio.test"
        organization = 'Colegio de Prueba'; plan = 'centro'; people = 350
        message = 'Nos interesa para tercero y cuarto de primaria. Podriamos ver una demo?'
    }
    if (-not $r.received) { throw 'No confirmo la recepcion' }
}

Test-Step 'Un correo invalido se rechaza -> 400' {
    Assert-Status {
        Invoke-Api POST '/contact' @{ name = 'Alguien'; email = 'no-es-correo'; message = 'Hola que tal, quiero informacion' }
    } 400
}

Test-Step 'Un mensaje demasiado corto se rechaza -> 400' {
    Assert-Status {
        Invoke-Api POST '/contact' @{ name = 'Alguien'; email = "x.$suffix@test.local"; message = 'hola' }
    } 400
}

Test-Step 'Leer las solicitudes exige sesion -> 401' {
    Assert-Status { Invoke-RestMethod -Uri "$base/contact" } 401
}

Test-Step 'Un docente no puede leerlas -> 403' {
    $doc = Invoke-Api POST '/auth/register' @{ email = "wc.doc.$suffix@test.local"; password = 'Secreto12345'; fullName = 'Docente Web'; role = 'teacher' }
    Assert-Status { Invoke-Api GET '/contact' -Token $doc.token } 403
}

$adminToken = (Invoke-Api POST '/auth/register' @{ email = "wc.adm.$suffix@test.local"; password = 'Secreto12345'; fullName = 'Admin Web'; role = 'admin' }).token

$solicitud = Test-Step 'Un admin ve la solicitud enviada' {
    $r = Invoke-Api GET '/contact?limit=50' -Token $adminToken
    $mia = $r.requests | Where-Object { $_.email -eq "demo.$suffix@colegio.test" } | Select-Object -First 1
    if (-not $mia) { throw 'No aparece la solicitud' }
    if ($mia.status -ne 'nuevo') { throw "Estado: $($mia.status)" }
    if ($mia.people -ne 350) { throw 'No guardo el numero de personas' }
    $mia
}

Test-Step 'El admin marca la solicitud como atendida' {
    Invoke-RestMethod -Method PATCH -Uri "$base/contact/$($solicitud.id)" `
        -Headers @{ Authorization = "Bearer $adminToken" } -ContentType 'application/json' `
        -Body (@{ status = 'atendido' } | ConvertTo-Json -Compress) | Out-Null
    $r = Invoke-Api GET '/contact?status=atendido' -Token $adminToken
    if (-not ($r.requests | Where-Object { $_.id -eq $solicitud.id })) { throw 'No quedo como atendida' }
}

Test-Step 'Un estado inventado se rechaza -> 400' {
    Assert-Status {
        Invoke-RestMethod -Method PATCH -Uri "$base/contact/$($solicitud.id)" `
            -Headers @{ Authorization = "Bearer $adminToken" } -ContentType 'application/json' `
            -Body (@{ status = 'archivado' } | ConvertTo-Json -Compress)
    } 400
}

# El limitador por IP se comprueba como unidad (lib/rate-limit.ts): agotarlo por HTTP
# dejaria el buzon bloqueado una hora y este ensayo no volveria a poder ejecutarse.

# --- Paginas publicas ---
Write-Host "`n-- Paginas publicas --" -ForegroundColor Cyan

Test-Step 'La portada responde sin sesion' {
    $r = Invoke-WebRequest -Uri "$web/" -UseBasicParsing
    if ($r.StatusCode -ne 200) { throw "Status $($r.StatusCode)" }
}

Test-Step 'El HTML inicial trae titulo y descripcion' {
    $html = (Invoke-WebRequest -Uri "$web/" -UseBasicParsing).Content
    if ($html -notmatch '<title>[^<]*BookStudio') { throw 'Sin titulo' }
    if ($html -notmatch 'name="description"') { throw 'Sin meta description' }
    if ($html -notmatch 'property="og:title"') { throw 'Sin Open Graph' }
    if ($html -notmatch 'name="twitter:card"') { throw 'Sin tarjeta de Twitter' }
}

Test-Step 'robots.txt existe y protege el contenido privado' {
    $r = Invoke-WebRequest -Uri "$web/robots.txt" -UseBasicParsing
    if ($r.StatusCode -ne 200) { throw "Status $($r.StatusCode)" }
    foreach ($ruta in @('/dashboard', '/books/', '/leer/', '/api/')) {
        if ($r.Content -notmatch [regex]::Escape("Disallow: $ruta")) { throw "No bloquea $ruta" }
    }
}

Test-Step 'sitemap.xml lista solo paginas publicas' {
    $r = Invoke-WebRequest -Uri "$web/sitemap.xml" -UseBasicParsing
    if ($r.Content -notmatch '<loc>') { throw 'Sin urls' }
    if ($r.Content -match '/dashboard') { throw 'Incluye una pagina privada' }
}

Test-Step 'La imagen para compartir existe' {
    $r = Invoke-WebRequest -Uri "$web/og-image.svg" -UseBasicParsing
    if ($r.StatusCode -ne 200) { throw "Status $($r.StatusCode)" }
}

Test-Step 'El portal de clientes responde sin sesion' {
    $r = Invoke-WebRequest -Uri "$web/clientes" -UseBasicParsing
    if ($r.StatusCode -ne 200) { throw "Status $($r.StatusCode)" }
}

Write-Host "`n== Resultado: $pass OK / $fail FAIL ==" -ForegroundColor $(if ($fail -eq 0) { 'Green' } else { 'Red' })
if ($fail -gt 0) { exit 1 }

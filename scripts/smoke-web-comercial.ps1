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

# --- Embudo de contratacion ---
Write-Host "`n-- Embudo --" -ForegroundColor Cyan

Test-Step 'Los planes son publicos, sin sesion' {
    $r = Invoke-RestMethod -Uri "$base/billing/config"
    if ($r.plans.Count -ne 3) { throw "Planes: $($r.plans.Count)" }
    foreach ($plan in $r.plans) {
        if ($plan.amountCop -le 0) { throw "$($plan.id) sin importe" }
    }
}

Test-Step 'La prueba sin registro esta disponible para cualquiera' {
    $r = Invoke-RestMethod -Method POST -Uri "$base/auth/trial"
    if (-not $r.token) { throw 'Sin sesion de prueba' }
    if ($r.limits.maxBooks -ne 1 -or $r.limits.maxPagesPerBook -ne 2) { throw 'Cupos inesperados' }
}

Test-Step 'El circuito de presupuestos ya no existe -> 404' {
    Assert-Status {
        Invoke-RestMethod -Method POST -Uri "$base/contact" -ContentType 'application/json' `
            -Body (@{ name = 'Alguien'; email = 'a@b.co'; message = 'Quiero un presupuesto' } | ConvertTo-Json -Compress)
    } 404
}

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

Test-Step 'La pagina de contratacion responde sin sesion' {
    $r = Invoke-WebRequest -Uri "$web/contratar" -UseBasicParsing
    if ($r.StatusCode -ne 200) { throw "Status $($r.StatusCode)" }
}

Test-Step 'El sitemap no anuncia paginas que ya no existen' {
    $r = Invoke-WebRequest -Uri "$web/sitemap.xml" -UseBasicParsing
    if ($r.Content -match '/clientes<') { throw 'Sigue listando el portal de presupuestos' }
    if ($r.Content -notmatch '/contratar') { throw 'Falta la pagina de contratacion' }
}

Write-Host "`n== Resultado: $pass OK / $fail FAIL ==" -ForegroundColor $(if ($fail -eq 0) { 'Green' } else { 'Red' })
if ($fail -gt 0) { exit 1 }

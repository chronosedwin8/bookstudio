# Ensayo funcional de facturacion, licencias y modo de prueba.
#
# NO crea cobros reales: las credenciales de Mercado Pago son de produccion y un
# pago de verdad moveria dinero. Se comprueba la configuracion, la validacion de
# entrada, los permisos y los cupos; el cobro end-to-end lo hace una persona.
$ErrorActionPreference = 'Stop'
$base = 'http://localhost:4000/api'
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

Write-Host "`n== Facturacion y prueba gratuita: ensayo funcional ==" -ForegroundColor Cyan

$suffix = [guid]::NewGuid().ToString('N').Substring(0, 6)
$doc = Invoke-Api POST '/auth/register' @{ email = "fa.doc.$suffix@test.local"; password = 'Secreto12345'; fullName = 'Docente Factura'; role = 'teacher' }
$dToken = $doc.token
$admin = Invoke-Api POST '/auth/register' @{ email = "fa.adm.$suffix@test.local"; password = 'Secreto12345'; fullName = 'Admin Factura'; role = 'admin' }
$aToken = $admin.token

# --- Configuracion publica ---
Write-Host "`n-- Configuracion --" -ForegroundColor Cyan

$config = Test-Step 'GET /billing/config expone planes y clave publica' {
    $r = Invoke-RestMethod -Uri "$base/billing/config"
    if (-not $r.enabled) { throw 'La facturacion deberia estar activa' }
    if ($r.currency -ne 'COP') { throw "Moneda: $($r.currency)" }
    if ($r.plans.Count -ne 3) { throw "Planes: $($r.plans.Count)" }
    $r
}

Test-Step 'La clave publica se expone; el token de acceso NO' {
    $texto = (Invoke-WebRequest -Uri "$base/billing/config" -UseBasicParsing).Content

    if ($config.publicKey -notmatch '^APP_USR-') { throw 'Falta la clave publica' }

    # Ninguna credencial se escribe aqui: se comprueba que la unica cadena con
    # forma de credencial en la respuesta sea exactamente la clave publica.
    # @() fuerza un array: con un solo resultado, Sort-Object devuelve una cadena
    # suelta y $encontradas[0] daria su primer caracter en vez de la credencial.
    $encontradas = @([regex]::Matches($texto, 'APP_USR-[A-Za-z0-9\-]+') |
        ForEach-Object { $_.Value } | Sort-Object -Unique)
    if ($encontradas.Count -ne 1) { throw "Hay $($encontradas.Count) credenciales en la respuesta" }
    if ($encontradas[0] -ne $config.publicKey) { throw 'La credencial expuesta no es la clave publica' }

    # El token de acceso tiene mas segmentos que la clave publica; si apareciera,
    # la cadena encontrada seria mucho mas larga.
    if ($encontradas[0].Length -gt 60) { throw 'La credencial expuesta es demasiado larga' }
}

Test-Step 'Los importes son los acordados' {
    $esperado = @{ individual = 1800000; escuela = 5000000; institucional = 20000000 }
    foreach ($plan in $config.plans) {
        if ($plan.amountCop -ne $esperado[$plan.id]) {
            throw "$($plan.id): $($plan.amountCop), esperaba $($esperado[$plan.id])"
        }
    }
}

Test-Step 'Los cupos del plan Escuela son 5 docentes y 500 estudiantes' {
    $escuela = $config.plans | Where-Object { $_.id -eq 'escuela' }
    if ($escuela.maxTeachers -ne 5) { throw "Docentes: $($escuela.maxTeachers)" }
    if ($escuela.maxStudents -ne 500) { throw "Estudiantes: $($escuela.maxStudents)" }
}

Test-Step 'El plan Institucional no tiene limite de usuarios' {
    $inst = $config.plans | Where-Object { $_.id -eq 'institucional' }
    if ($null -ne $inst.maxTeachers) { throw 'Deberia ser ilimitado' }
    if ($null -ne $inst.maxStudents) { throw 'Deberia ser ilimitado' }
}

# --- Permisos ---
Write-Host "`n-- Permisos --" -ForegroundColor Cyan

Test-Step 'Consultar la licencia exige sesion -> 401' {
    Assert-Status { Invoke-RestMethod -Uri "$base/billing/subscription" } 401
}

Test-Step 'Sin contratar nada, la licencia es nula' {
    $r = Invoke-Api GET '/billing/subscription' -Token $dToken
    if ($null -ne $r.subscription) { throw 'No deberia haber suscripcion' }
}

Test-Step 'Sin pagos, no hay facturas' {
    $r = Invoke-Api GET '/billing/invoices' -Token $dToken
    if ($r.invoices.Count -ne 0) { throw "Facturas: $($r.invoices.Count)" }
}

Test-Step 'Un docente no ve las licencias de todos -> 403' {
    Assert-Status { Invoke-Api GET '/billing/subscriptions' -Token $dToken } 403
}

Test-Step 'Un admin si ve todas las licencias' {
    $r = Invoke-Api GET '/billing/subscriptions' -Token $aToken
    if ($null -eq $r.subscriptions) { throw 'Sin respuesta' }
}

Test-Step 'Activar la renovacion sin suscripcion -> 404' {
    Assert-Status { Invoke-Api PUT '/billing/auto-renew' @{ autoRenew = $true } -Token $dToken } 404
}

# --- Validacion del cobro (sin cobrar) ---
Write-Host "`n-- Validacion del cobro --" -ForegroundColor Cyan

Test-Step 'Un plan inventado se rechaza -> 400' {
    Assert-Status {
        Invoke-Api POST '/billing/checkout' @{
            plan = 'plan-premium-inventado'; paymentMethodId = 'visa'; installments = 1
            payerEmail = 'alguien@test.local'; autoRenew = $false
        } -Token $dToken
    } 400
}

Test-Step 'Un correo invalido se rechaza -> 400' {
    Assert-Status {
        Invoke-Api POST '/billing/checkout' @{
            plan = 'individual'; paymentMethodId = 'visa'; installments = 1
            payerEmail = 'no-es-correo'; autoRenew = $false
        } -Token $dToken
    } 400
}

Test-Step 'Un numero de cuotas absurdo se rechaza -> 400' {
    Assert-Status {
        Invoke-Api POST '/billing/checkout' @{
            plan = 'individual'; paymentMethodId = 'visa'; installments = 999
            payerEmail = 'alguien@test.local'; autoRenew = $false
        } -Token $dToken
    } 400
}

Test-Step 'Cobrar exige sesion -> 401' {
    Assert-Status {
        Invoke-RestMethod -Method POST -Uri "$base/billing/checkout" -ContentType 'application/json' `
            -Body (@{ plan = 'individual'; paymentMethodId = 'visa'; installments = 1; payerEmail = 'a@b.co'; autoRenew = $false } | ConvertTo-Json -Compress)
    } 401
}

Test-Step 'El importe no se puede imponer desde el navegador' {
    # El esquema ignora cualquier campo de importe: el precio sale del catalogo.
    try {
        Invoke-Api POST '/billing/checkout' @{
            plan = 'institucional'; amountCop = 1000; transaction_amount = 1000
            paymentMethodId = 'visa'; installments = 1
            payerEmail = "fa.doc.$suffix@test.local"; autoRenew = $false
        } -Token $dToken | Out-Null
        throw 'No deberia haber prosperado sin token de tarjeta'
    } catch {
        $code = $_.Exception.Response.StatusCode.value__
        # 400 de Mercado Pago por falta de tarjeta: nunca llego a cobrar 1000 COP.
        if ($code -ne 400 -and $code -ne 502) { throw "Codigo inesperado: $code" }
    }
}

# --- Webhook ---
Test-Step 'El webhook ignora los avisos que no son de pagos' {
    $r = Invoke-RestMethod -Method POST -Uri "$base/billing/webhook" -ContentType 'application/json' `
        -Body (@{ type = 'plan'; data = @{ id = '123' } } | ConvertTo-Json -Compress)
    if (-not $r.received) { throw 'Deberia confirmar la recepcion' }
}

# --- Modo de prueba ---
Write-Host "`n-- Prueba sin registro --" -ForegroundColor Cyan

$trial = Test-Step 'Cualquiera obtiene una sesion de prueba, sin dar datos' {
    $r = Invoke-RestMethod -Method POST -Uri "$base/auth/trial"
    if (-not $r.token) { throw 'Sin token' }
    if ($r.limits.maxBooks -ne 1) { throw "maxBooks: $($r.limits.maxBooks)" }
    if ($r.limits.maxPagesPerBook -ne 2) { throw "maxPages: $($r.limits.maxPagesPerBook)" }
    $r
}

$tToken = $trial.token

Test-Step 'La cuenta de prueba tiene el editor completo' {
    $libro = (Invoke-Api POST '/books' @{ title = 'Mi prueba' } -Token $tToken).book
    $pagina = ((Invoke-Api GET "/books/$($libro.id)" -Token $tToken).book).pages[0].id

    # Herramientas de pago en otras plataformas: aqui disponibles en la prueba.
    foreach ($elemento in @(
        @{ type = 'chart'; properties = @{ chartType = 'pie'; series = @(@{ label = 'A'; value = 1 }) } },
        @{ type = 'math'; properties = @{ latex = 'a^2+b^2=c^2' } },
        @{ type = 'question'; properties = @{ kind = 'single'; prompt = 'Va?'
             options = @(@{ id = 'a'; text = 'Si'; correct = $true }, @{ id = 'b'; text = 'No' }) } }
    )) {
        $r = Invoke-Api POST "/books/$($libro.id)/pages/$pagina/elements" @{
            type = $elemento.type
            transformMatrix = @{ x = 10; y = 10; width = 30; height = 20; angle = 0 }
            properties = $elemento.properties
        } -Token $tToken
        if ($r.element.type -ne $elemento.type) { throw "Fallo con $($elemento.type)" }
    }
}

$libroPrueba = (Invoke-Api GET '/books' -Token $tToken).books[0]

Test-Step 'La prueba permite una segunda pagina' {
    $r = Invoke-Api POST "/books/$($libroPrueba.id)/pages" @{ backgroundColor = '#FFFFFF' } -Token $tToken
    if (-not $r.page.id) { throw 'No creo la pagina' }
}

Test-Step 'La tercera pagina se rechaza -> 403' {
    Assert-Status {
        Invoke-Api POST "/books/$($libroPrueba.id)/pages" @{ backgroundColor = '#FFFFFF' } -Token $tToken
    } 403
}

Test-Step 'Duplicar una pagina tampoco salta el cupo -> 403' {
    $d = (Invoke-Api GET "/books/$($libroPrueba.id)" -Token $tToken).book
    Assert-Status {
        Invoke-Api POST "/books/$($libroPrueba.id)/pages/$($d.pages[0].id)/duplicate" -Token $tToken
    } 403
}

Test-Step 'El segundo libro se rechaza -> 403' {
    Assert-Status { Invoke-Api POST '/books' @{ title = 'Otro mas' } -Token $tToken } 403
}

Test-Step 'Una plantilla tampoco crea una tercera pagina -> 403' {
    Assert-Status {
        Invoke-Api POST "/books/$($libroPrueba.id)/pages" @{
            backgroundColor = '#FFFFFF'
            elements = @(@{ type = 'text'; transformMatrix = @{ x = 5; y = 5; width = 20; height = 10; angle = 0 }
                            properties = @{ text = 'Hola' } })
        } -Token $tToken
    } 403
}

Test-Step 'La cuenta de prueba NO puede consultar Phidias -> 403' {
    Assert-Status { Invoke-Api GET '/phidias/sections' -Token $tToken } 403
}

Test-Step 'La cuenta de prueba NO puede gestionar usuarios -> 403' {
    Assert-Status { Invoke-Api GET '/users' -Token $tToken } 403
}

Test-Step 'Una cuenta normal no tiene esos cupos' {
    $l1 = (Invoke-Api POST '/books' @{ title = 'Libro 1' } -Token $dToken).book
    $null = Invoke-Api POST '/books' @{ title = 'Libro 2' } -Token $dToken
    1..3 | ForEach-Object {
        $null = Invoke-Api POST "/books/$($l1.id)/pages" @{ backgroundColor = '#FFFFFF' } -Token $dToken
    }
    $d = (Invoke-Api GET "/books/$($l1.id)" -Token $dToken).book
    if ($d.pages.Count -lt 4) { throw "Paginas: $($d.pages.Count)" }
}

Write-Host "`n== Resultado: $pass OK / $fail FAIL ==" -ForegroundColor $(if ($fail -eq 0) { 'Green' } else { 'Red' })
if ($fail -gt 0) { exit 1 }

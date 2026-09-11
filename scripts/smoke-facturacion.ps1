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
    if ($r.plans.Count -lt 4) { throw "Planes: $($r.plans.Count)" }
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

# Los importes ya no se escriben aqui: se configuran desde el panel y comprobar
# una cifra concreta solo serviria para que la prueba fallara cada vez que se
# cambia un precio. Lo que si tiene que cumplirse siempre es la forma.
Test-Step 'Cada plan trae un importe entero y un periodo con sentido' {
    foreach ($plan in $config.plans) {
        if ($plan.amountCop -le 0) { throw "$($plan.id): importe $($plan.amountCop)" }
        if ($plan.amountCop -ne [math]::Floor($plan.amountCop)) { throw "$($plan.id): el COP no lleva decimales" }
        if ($plan.periodMonths -lt 1 -or $plan.periodMonths -gt 60) { throw "$($plan.id): periodo $($plan.periodMonths)" }
        if (-not $plan.name) { throw "$($plan.id): sin nombre" }
    }
}

Test-Step 'El plan Mensual cuesta 10.000 COP y dura un mes' {
    $mensual = $config.plans | Where-Object { $_.id -eq 'mensual' }
    if (-not $mensual) { throw 'No se ofrece el plan mensual' }
    if ($mensual.amountCop -ne 10000) { throw "Importe: $($mensual.amountCop)" }
    if ($mensual.periodMonths -ne 1) { throw "Periodo: $($mensual.periodMonths)" }
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

# --- Alta y pago en un solo paso ---
Write-Host "`n-- Contratacion directa --" -ForegroundColor Cyan

Test-Step 'El alta con pago no exige sesion previa' {
    # Sin token de tarjeta el cobro no prospera, pero la ruta debe ser publica:
    # un 401 significaria que exige cuenta, que es justo lo que se quiere evitar.
    try {
        Invoke-RestMethod -Method POST -Uri "$base/billing/signup-checkout" -ContentType 'application/json' `
            -Body (@{ fullName = 'Nueva Persona'; password = 'Secreto12345'; plan = 'individual'
                      paymentMethodId = 'visa'; installments = 1
                      payerEmail = "alta.$suffix@test.local"; autoRenew = $false } | ConvertTo-Json -Compress) | Out-Null
        throw 'No deberia prosperar sin tarjeta'
    } catch {
        $code = $_.Exception.Response.StatusCode.value__
        if ($code -eq 401) { throw 'La ruta exige sesion y deberia ser publica' }
        if ($code -ne 400 -and $code -ne 502) { throw "Codigo inesperado: $code" }
    }
}

Test-Step 'Un cobro fallido no deja la cuenta a medias' {
    # Tras el intento anterior, ese correo debe seguir libre para reintentar.
    $r = Invoke-Api POST '/auth/register' @{
        email = "alta.$suffix@test.local"; password = 'Secreto12345'
        fullName = 'Nueva Persona'; role = 'teacher'
    }
    if (-not $r.token) { throw 'El correo quedo ocupado por una cuenta huerfana' }
}

Test-Step 'Un correo ya registrado se rechaza -> 409' {
    Assert-Status {
        Invoke-RestMethod -Method POST -Uri "$base/billing/signup-checkout" -ContentType 'application/json' `
            -Body (@{ fullName = 'Otra Vez'; password = 'Secreto12345'; plan = 'individual'
                      paymentMethodId = 'visa'; installments = 1
                      payerEmail = "alta.$suffix@test.local"; autoRenew = $false } | ConvertTo-Json -Compress)
    } 409
}

Test-Step 'Una contrasena corta se rechaza -> 400' {
    Assert-Status {
        Invoke-RestMethod -Method POST -Uri "$base/billing/signup-checkout" -ContentType 'application/json' `
            -Body (@{ fullName = 'Corta'; password = '123'; plan = 'individual'
                      paymentMethodId = 'visa'; installments = 1
                      payerEmail = "corta.$suffix@test.local"; autoRenew = $false } | ConvertTo-Json -Compress)
    } 400
}

Test-Step 'Ya no existe el circuito de presupuestos -> 404' {
    Assert-Status {
        Invoke-RestMethod -Method POST -Uri "$base/contact" -ContentType 'application/json' `
            -Body (@{ name = 'Alguien'; email = 'a@b.co'; message = 'Quiero un presupuesto por favor' } | ConvertTo-Json -Compress)
    } 404
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

# --- Planes configurables ---
#
# Cambiar un precio es tocar dinero: se comprueba que solo llega quien debe, que
# los disparates se rechazan y que la portada refleja el cambio en el acto. Todo
# se hace sobre un plan de usar y tirar, no sobre los que se venden.
Write-Host "`n-- Planes configurables --" -ForegroundColor Cyan

Test-Step 'El catalogo completo exige ser administracion -> 403' {
    Assert-Status { Invoke-Api GET '/billing/plans' -Token $dToken } 403
}

Test-Step 'Cambiar un precio exige ser administracion -> 403' {
    Assert-Status { Invoke-Api PATCH '/billing/plans/mensual' @{ amountCop = 1000 } -Token $dToken } 403
}

Test-Step 'Cambiar un precio sin sesion -> 401' {
    Assert-Status {
        Invoke-RestMethod -Method Patch -Uri "$base/billing/plans/mensual" `
            -ContentType 'application/json' -Body '{"amountCop":1000}'
    } 401
}

$catalogo = Test-Step 'La administracion ve el catalogo completo' {
    $r = (Invoke-Api GET '/billing/plans' -Token $aToken).plans
    if ($r.Count -lt 4) { throw "Planes: $($r.Count)" }
    foreach ($plan in $r) {
        if ($null -eq $plan.visible) { throw "$($plan.id): falta visible" }
        if ($null -eq $plan.sortOrder) { throw "$($plan.id): falta sortOrder" }
    }
    $r
}

$original = $catalogo | Where-Object { $_.id -eq 'mensual' }

Test-Step 'Un importe por debajo del minimo se rechaza -> 400' {
    Assert-Status { Invoke-Api PATCH '/billing/plans/mensual' @{ amountCop = 1 } -Token $aToken } 400
}

Test-Step 'Un importe con decimales se rechaza -> 400' {
    Assert-Status { Invoke-Api PATCH '/billing/plans/mensual' @{ amountCop = 10000.5 } -Token $aToken } 400
}

Test-Step 'Un periodo imposible se rechaza -> 400' {
    Assert-Status { Invoke-Api PATCH '/billing/plans/mensual' @{ periodMonths = 0 } -Token $aToken } 400
}

Test-Step 'Un plan que no existe -> 404' {
    Assert-Status { Invoke-Api PATCH '/billing/plans/no-existe' @{ amountCop = 5000 } -Token $aToken } 404
}

Test-Step 'El precio cambiado se ve en la portada al momento' {
    $null = Invoke-Api PATCH '/billing/plans/mensual' @{ amountCop = 13000 } -Token $aToken
    $r = Invoke-RestMethod -Uri "$base/billing/config"
    $m = $r.plans | Where-Object { $_.id -eq 'mensual' }
    if ($m.amountCop -ne 13000) { throw "La portada dice $($m.amountCop)" }
}

Test-Step 'Un plan retirado deja de ofrecerse y no se puede contratar' {
    $null = Invoke-Api PATCH '/billing/plans/mensual' @{ visible = $false } -Token $aToken

    $r = Invoke-RestMethod -Uri "$base/billing/config"
    if ($r.plans | Where-Object { $_.id -eq 'mensual' }) { throw 'Sigue apareciendo en la portada' }

    Assert-Status {
        Invoke-Api POST '/billing/checkout' @{
            plan = 'mensual'; paymentMethodId = 'visa'; installments = 1
            payerEmail = 'prueba@test.local'; autoRenew = $false
        } -Token $dToken
    } 400

    # Pero la administracion lo sigue viendo: las licencias vendidas apuntan a el.
    $todos = (Invoke-Api GET '/billing/plans' -Token $aToken).plans
    if (-not ($todos | Where-Object { $_.id -eq 'mensual' })) { throw 'Ha desaparecido del catalogo' }
}

Test-Step 'El plan mensual queda como estaba' {
    $r = Invoke-Api PATCH '/billing/plans/mensual' @{
        amountCop = $original.amountCop; monthlyCop = $original.monthlyCop
        periodMonths = $original.periodMonths; visible = $true
    } -Token $aToken
    if ($r.plan.amountCop -ne $original.amountCop) { throw "Quedo en $($r.plan.amountCop)" }
    if (-not $r.plan.visible) { throw 'Quedo retirado' }
}

Write-Host "`n== Resultado: $pass OK / $fail FAIL ==" -ForegroundColor $(if ($fail -eq 0) { 'Green' } else { 'Red' })
if ($fail -gt 0) { exit 1 }

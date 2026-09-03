# Ensayo funcional de la Etapa 5: usuarios, colaboracion, graficas, formulas y Phidias.
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
    param([string]$Method, [string]$Path, $Body, [string]$Token, [int]$TimeoutSec = 100)
    $headers = @{}
    if ($Token) { $headers['Authorization'] = "Bearer $Token" }
    $args = @{ Method = $Method; Uri = "$base$Path"; Headers = $headers; TimeoutSec = $TimeoutSec }
    if ($null -ne $Body) {
        $args['Body'] = [Text.Encoding]::UTF8.GetBytes(($Body | ConvertTo-Json -Depth 12 -Compress))
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

Write-Host "`n== Etapa 5: ensayo funcional ==" -ForegroundColor Cyan

$suffix = [guid]::NewGuid().ToString('N').Substring(0, 6)
$admin = Invoke-Api POST '/auth/register' @{ email = "e5.adm.$suffix@test.local"; password = 'Secreto12345'; fullName = 'Admin Etapa5'; role = 'admin' }
$aToken = $admin.token
$doc = Invoke-Api POST '/auth/register' @{ email = "e5.doc.$suffix@test.local"; password = 'Secreto12345'; fullName = 'Docente Etapa5'; role = 'teacher' }
$dToken = $doc.token
# Un docente sin relacion con la clase. Antes este papel lo hacia el administrador,
# pero desde que la administracion manda sobre todo ya no sirve para comprobar que
# a un extrano se le cierra la puerta.
$ext = Invoke-Api POST '/auth/register' @{ email = "e5.ext.$suffix@test.local"; password = 'Secreto12345'; fullName = 'Docente Ajeno'; role = 'teacher' }
$xToken = $ext.token

# --- Gestion de usuarios ---
Write-Host "`n-- Gestion de usuarios --" -ForegroundColor Cyan

$nuevo = Test-Step 'Un admin crea una cuenta' {
    $r = Invoke-Api POST '/users' @{ email = "e5.new.$suffix@test.local"; password = 'Secreto12345'; fullName = 'Alumno Nuevo'; role = 'student' } -Token $aToken
    if ($r.user.role -ne 'student') { throw "Rol: $($r.user.role)" }
    if (-not $r.user.isActive) { throw 'Deberia nacer activo' }
    $r.user
}

Test-Step 'Un docente no puede gestionar usuarios -> 403' {
    Assert-Status { Invoke-Api GET '/users' -Token $dToken } 403
}

Test-Step 'El listado pagina y filtra por rol' {
    $r = Invoke-Api GET '/users?role=student&pageSize=5' -Token $aToken
    if ($r.items.Count -gt 5) { throw 'No respeto pageSize' }
    foreach ($u in $r.items) { if ($u.role -ne 'student') { throw "Filtro roto: $($u.role)" } }
}

Test-Step 'El listado busca por nombre' {
    $r = Invoke-Api GET '/users?search=Alumno%20Nuevo' -Token $aToken
    if (-not ($r.items | Where-Object { $_.id -eq $nuevo.id })) { throw 'No lo encontro' }
}

Test-Step 'Cambiar el rol de una cuenta' {
    $r = Invoke-Api PATCH "/users/$($nuevo.id)" @{ role = 'teacher' } -Token $aToken
    if ($r.user.role -ne 'teacher') { throw "Rol: $($r.user.role)" }
}

Test-Step 'Restablecer la contrasena y poder entrar con ella' {
    Invoke-Api POST "/users/$($nuevo.id)/password" @{ password = 'NuevaClave123' } -Token $aToken | Out-Null
    $login = Invoke-Api POST '/auth/login' @{ email = "e5.new.$suffix@test.local"; password = 'NuevaClave123' }
    if (-not $login.token) { throw 'No pudo iniciar sesion' }
}

Test-Step 'Una cuenta desactivada no puede entrar -> 403' {
    Invoke-Api PATCH "/users/$($nuevo.id)" @{ isActive = $false } -Token $aToken | Out-Null
    Assert-Status {
        Invoke-Api POST '/auth/login' @{ email = "e5.new.$suffix@test.local"; password = 'NuevaClave123' }
    } 403
}

Test-Step 'Reactivar devuelve el acceso' {
    Invoke-Api PATCH "/users/$($nuevo.id)" @{ isActive = $true } -Token $aToken | Out-Null
    $login = Invoke-Api POST '/auth/login' @{ email = "e5.new.$suffix@test.local"; password = 'NuevaClave123' }
    if (-not $login.token) { throw 'Sigue bloqueado' }
}

Test-Step 'Un admin no puede quitarse su propio rol -> 400' {
    Assert-Status { Invoke-Api PATCH "/users/$($admin.user.id)" @{ role = 'teacher' } -Token $aToken } 400
}

Test-Step 'Un admin no puede desactivarse a si mismo -> 400' {
    Assert-Status { Invoke-Api PATCH "/users/$($admin.user.id)" @{ isActive = $false } -Token $aToken } 400
}

Test-Step 'Contrasena demasiado corta -> 400' {
    Assert-Status { Invoke-Api POST "/users/$($nuevo.id)/password" @{ password = '123' } -Token $aToken } 400
}

Test-Step 'Las estadisticas cuadran con el listado' {
    $stats = (Invoke-Api GET '/users/stats' -Token $aToken).stats
    $lista = Invoke-Api GET '/users?pageSize=1' -Token $aToken
    if ($stats.total -ne $lista.total) { throw "stats $($stats.total) vs lista $($lista.total)" }
}

# --- Colaboracion ---
Write-Host "`n-- Edicion colaborativa --" -ForegroundColor Cyan

$lib = (Invoke-Api POST '/libraries' @{ name = "Clase E5 $suffix" } -Token $dToken).library
$libro = (Invoke-Api POST '/books' @{ title = 'Libro del grupo'; libraryId = $lib.id } -Token $dToken).book
$alumno = Invoke-Api POST '/auth/students' @{ fullName = 'Alumna Colaboradora'; libraryId = $lib.id } -Token $dToken
$sToken = (Invoke-Api POST '/auth/login/qr' @{ token = $alumno.qrToken }).token

Test-Step 'Sin colaboracion, el alumno no puede editar el libro del docente' {
    $d = (Invoke-Api GET "/books/$($libro.id)" -Token $sToken).book
    if ($d.permissions.canEdit) { throw 'No deberia poder editar' }
}

Test-Step 'Activar la edicion compartida' {
    $r = Invoke-Api PUT "/books/$($libro.id)/collaborative" @{ collaborative = $true } -Token $dToken
    if (-not $r.book.collaborative) { throw 'No se activo' }
}

Test-Step 'Ahora el alumno si puede editar y anadir contenido' {
    $d = (Invoke-Api GET "/books/$($libro.id)" -Token $sToken).book
    if (-not $d.permissions.canEdit) { throw 'Deberia poder editar' }
    $el = Invoke-Api POST "/books/$($libro.id)/pages/$($d.pages[0].id)/elements" @{
        type = 'text'; transformMatrix = @{ x = 10; y = 10; width = 40; height = 20; angle = 0 }
        properties = @{ text = 'Aporte de la alumna' }
    } -Token $sToken
    if ($el.element.properties.text -ne 'Aporte de la alumna') { throw 'No se guardo' }
}

Test-Step 'Un docente ajeno a la clase sigue sin poder -> 403' {
    Assert-Status { Invoke-Api GET "/books/$($libro.id)" -Token $xToken } 403
}

Test-Step 'La administracion si entra, para poder dar soporte' {
    $d = (Invoke-Api GET "/books/$($libro.id)" -Token $aToken).book
    if (-not $d.permissions.canEdit) { throw 'La administracion deberia poder editarlo' }
}

Test-Step 'Desactivar la colaboracion revoca la edicion' {
    Invoke-Api PUT "/books/$($libro.id)/collaborative" @{ collaborative = $false } -Token $dToken | Out-Null
    $d = (Invoke-Api GET "/books/$($libro.id)" -Token $sToken).book
    if ($d.permissions.canEdit) { throw 'Sigue pudiendo editar' }
}

Test-Step 'Un libro personal no admite colaboracion -> 400' {
    $personal = (Invoke-Api POST '/books' @{ title = 'Mio' } -Token $dToken).book
    Assert-Status { Invoke-Api PUT "/books/$($personal.id)/collaborative" @{ collaborative = $true } -Token $dToken } 400
}

# --- Graficas, formulas y duplicado ---
Write-Host "`n-- Elementos nuevos --" -ForegroundColor Cyan

$book2 = (Invoke-Api POST '/books' @{ title = 'Elementos E5' } -Token $dToken).book
$page2 = ((Invoke-Api GET "/books/$($book2.id)" -Token $dToken).book).pages[0].id
$path2 = "/books/$($book2.id)/pages/$page2/elements"
$box = @{ x = 10; y = 10; width = 40; height = 30; angle = 0 }

Test-Step 'Los seis tipos de grafica se guardan' {
    foreach ($tipo in @('bar', 'column', 'line', 'area', 'pie', 'doughnut')) {
        $r = Invoke-Api POST $path2 @{
            type = 'chart'; transformMatrix = $box
            properties = @{ chartType = $tipo; title = "Grafica $tipo"
                series = @(@{ label = 'A'; value = 3 }, @{ label = 'B'; value = 5 }) }
        } -Token $dToken
        if ($r.element.properties.chartType -ne $tipo) { throw "No persistio $tipo" }
    }
}

Test-Step 'Una grafica sin datos -> 400' {
    Assert-Status {
        Invoke-Api POST $path2 @{ type = 'chart'; transformMatrix = $box; properties = @{ chartType = 'pie'; series = @() } } -Token $dToken
    } 400
}

Test-Step 'Una formula matematica se guarda en LaTeX' {
    $r = Invoke-Api POST $path2 @{
        type = 'math'; transformMatrix = $box
        properties = @{ latex = 'a^2 + b^2 = c^2'; displayMode = $true }
    } -Token $dToken
    if ($r.element.properties.latex -ne 'a^2 + b^2 = c^2') { throw 'No persistio' }
}

Test-Step 'Las formas cuadrado y ovalo existen' {
    foreach ($forma in @('square', 'oval')) {
        $r = Invoke-Api POST $path2 @{ type = 'shape'; transformMatrix = $box; properties = @{ shape = $forma } } -Token $dToken
        if ($r.element.properties.shape -ne $forma) { throw "No persistio $forma" }
    }
}

Test-Step 'El texto admite listas e interlineado' {
    $r = Invoke-Api POST $path2 @{
        type = 'text'; transformMatrix = $box
        properties = @{ text = "Uno`nDos"; listStyle = 'number'; lineHeight = 1.8 }
    } -Token $dToken
    if ($r.element.properties.listStyle -ne 'number') { throw 'Lista no persistida' }
    if ($r.element.properties.lineHeight -ne 1.8) { throw 'Interlineado no persistido' }
}

Test-Step 'Duplicar una pagina copia todo su contenido' {
    $antes = ((Invoke-Api GET "/books/$($book2.id)" -Token $dToken).book).pages | Where-Object { $_.id -eq $page2 }
    $copia = (Invoke-Api POST "/books/$($book2.id)/pages/$page2/duplicate" -Token $dToken).page
    if ($copia.elements.Count -ne $antes.elements.Count) {
        throw "Copio $($copia.elements.Count) de $($antes.elements.Count)"
    }
    if ($copia.id -eq $page2) { throw 'Devolvio la misma pagina' }
}

Test-Step 'La copia queda justo detras de la original' {
    $d = (Invoke-Api GET "/books/$($book2.id)" -Token $dToken).book
    $i = 0; $indice = -1
    foreach ($p in $d.pages) { if ($p.id -eq $page2) { $indice = $i }; $i++ }
    if ($indice -lt 0) { throw 'No esta la original' }
    if ($d.pages[$indice + 1].pageNumber -ne $d.pages[$indice].pageNumber + 1) { throw 'Numeracion rota' }
}

Test-Step 'Duplicar una pagina de otro libro -> 404' {
    Assert-Status { Invoke-Api POST "/books/$($libro.id)/pages/$page2/duplicate" -Token $dToken } 404
}

# --- Mover varios elementos a la vez ---
Test-Step 'Mover varios elementos conserva sus distancias' {
    $ids = @()
    $origen = @(@{ x = 10; y = 10 }, @{ x = 40; y = 20 }, @{ x = 65; y = 45 })
    foreach ($pos in $origen) {
        $r = Invoke-Api POST $path2 @{
            type = 'shape'
            transformMatrix = @{ x = $pos.x; y = $pos.y; width = 15; height = 12; angle = 0 }
            properties = @{ shape = 'square' }
        } -Token $dToken
        $ids += $r.element.id
    }

    # El cliente manda un PATCH por elemento con el mismo desplazamiento.
    $dx = 8; $dy = 5
    for ($i = 0; $i -lt $ids.Count; $i++) {
        Invoke-Api PATCH "$path2/$($ids[$i])" @{
            transformMatrix = @{ x = $origen[$i].x + $dx; y = $origen[$i].y + $dy; width = 15; height = 12; angle = 0 }
        } -Token $dToken | Out-Null
    }

    $d = (Invoke-Api GET "/books/$($book2.id)" -Token $dToken).book
    $pagina = $d.pages | Where-Object { $_.id -eq $page2 }
    for ($i = 0; $i -lt $ids.Count; $i++) {
        $el = $pagina.elements | Where-Object { $_.id -eq $ids[$i] }
        $esperadoX = $origen[$i].x + $dx
        $esperadoY = $origen[$i].y + $dy
        if ([math]::Abs($el.transformMatrix.x - $esperadoX) -gt 0.01) {
            throw "Elemento $i en x=$($el.transformMatrix.x), esperaba $esperadoX"
        }
        if ([math]::Abs($el.transformMatrix.y - $esperadoY) -gt 0.01) {
            throw "Elemento $i en y=$($el.transformMatrix.y), esperaba $esperadoY"
        }
    }
}

# --- Nuevos servicios incrustables ---
Test-Step 'Canva, Genially y GeoGebra se incrustan' {
    $enlaces = @(
        @{ url = 'https://www.canva.com/design/DAFxyz12345/AbCdEfGhIjKl/view'; proveedor = 'canva' },
        @{ url = 'https://view.genially.com/6512ab34cd9ef0'; proveedor = 'genially' },
        @{ url = 'https://www.geogebra.org/m/abcd1234'; proveedor = 'geogebra' }
    )
    foreach ($e in $enlaces) {
        $r = Invoke-Api POST $path2 @{ type = 'embed'; transformMatrix = $box; properties = @{ sourceUrl = $e.url } } -Token $dToken
        if ($r.element.properties.provider -ne $e.proveedor) { throw "$($e.proveedor) -> $($r.element.properties.provider)" }
    }
}

# --- Phidias ---
Write-Host "`n-- Phidias --" -ForegroundColor Cyan

$habilitado = (Invoke-Api GET '/phidias/status' -Token $dToken).enabled

Test-Step 'Un alumno no puede consultar Phidias -> 403' {
    Assert-Status { Invoke-Api GET '/phidias/status' -Token $sToken } 403
}

if ($habilitado) {
    $secciones = Test-Step 'Phidias devuelve las secciones' {
        $r = Invoke-Api GET '/phidias/sections' -Token $dToken -TimeoutSec 180
        if ($r.sections.Count -lt 1) { throw 'Sin secciones' }
        foreach ($campo in @('id', 'name', 'course', 'level')) {
            if (-not $r.sections[0].$campo) { throw "Falta el campo $campo" }
        }
        $r.sections
    }

    Test-Step 'Importar una seccion crea la biblioteca con sus alumnos' {
        $sec = $secciones | Sort-Object studentCount | Where-Object { $_.studentCount -gt 0 } | Select-Object -First 1
        $r = (Invoke-Api POST '/phidias/import' @{ sectionId = $sec.id } -Token $dToken -TimeoutSec 240).result
        if (-not $r.libraryId) { throw 'Sin biblioteca' }
        if (($r.created + $r.reused) -lt 1) { throw 'No dio de alta a nadie' }
    }

    Test-Step 'Reimportar no duplica nada' {
        $sec = $secciones | Sort-Object studentCount | Where-Object { $_.studentCount -gt 0 } | Select-Object -First 1
        $r = (Invoke-Api POST '/phidias/import' @{ sectionId = $sec.id } -Token $dToken -TimeoutSec 240).result
        if ($r.created -ne 0) { throw "Creo $($r.created) cuentas de nuevo" }
        if ($r.enrolled -ne 0) { throw "Inscribio $($r.enrolled) veces mas" }
    }

    Test-Step 'Una seccion inexistente -> 404' {
        Assert-Status { Invoke-Api POST '/phidias/import' @{ sectionId = 99999999 } -Token $dToken } 404
    }

    Test-Step 'Un docente vuelca alumnos en una clase suya ya existente' {
        $sec = $secciones | Where-Object { $_.studentCount -gt 0 -and $_.studentCount -lt 20 } | Select-Object -First 1
        $propia = (Invoke-Api POST '/libraries' @{ name = "Clase propia $suffix" } -Token $dToken).library
        $r = (Invoke-Api POST '/phidias/import' @{ sectionId = $sec.id; libraryId = $propia.id } -Token $dToken -TimeoutSec 240).result
        if ($r.libraryId -ne $propia.id) { throw 'Creo otra biblioteca en vez de usar la indicada' }
        $miembros = Invoke-Api GET "/libraries/$($propia.id)/members" -Token $dToken
        if ($miembros.students.Count -lt 1) { throw 'No inscribio a nadie' }
    }

    Test-Step 'No se pueden volcar alumnos en una clase ajena -> 403' {
        $sec = $secciones | Where-Object { $_.studentCount -gt 0 } | Select-Object -First 1
        $ajena = (Invoke-Api POST '/libraries' @{ name = "Ajena $suffix" } -Token $aToken).library
        Assert-Status {
            Invoke-Api POST '/phidias/import' @{ sectionId = $sec.id; libraryId = $ajena.id } -Token $dToken -TimeoutSec 240
        } 403
    }
} else {
    Write-Host '  --   Phidias no configurado: se omiten sus comprobaciones' -ForegroundColor DarkGray
}

Write-Host "`n== Resultado: $pass OK / $fail FAIL ==" -ForegroundColor $(if ($fail -eq 0) { 'Green' } else { 'Red' })
if ($fail -gt 0) { exit 1 }

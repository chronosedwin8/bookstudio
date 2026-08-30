# Ensayo funcional de la Etapa 2 (libros, paginas, elementos, capas).
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
        $args['Body'] = ($Body | ConvertTo-Json -Depth 10 -Compress)
        $args['ContentType'] = 'application/json'
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

Write-Host "`n== Etapa 2: ensayo funcional ==" -ForegroundColor Cyan

$suffix = [guid]::NewGuid().ToString('N').Substring(0, 6)
$teacher = Invoke-Api POST '/auth/register' @{ email = "t2.$suffix@test.local"; password = 'Secreto12345'; fullName = 'Profe Etapa2'; role = 'teacher' }
$tToken = $teacher.token
$lib = (Invoke-Api POST '/libraries' @{ name = "Aula $suffix" } -Token $tToken).library

$book = Test-Step 'POST /books (crea libro con portada)' {
    $r = Invoke-Api POST '/books' @{ title = 'Mi primer libro'; libraryId = $lib.id; layoutFormat = 'portrait' } -Token $tToken
    if ($r.book.layoutFormat -ne 'portrait') { throw 'Formato incorrecto' }
    $r.book
}

$detail = Test-Step 'GET /books/:id devuelve pagina inicial y permisos' {
    $r = (Invoke-Api GET "/books/$($book.id)" -Token $tToken).book
    if ($r.pages.Count -ne 1) { throw "Esperaba 1 pagina, hay $($r.pages.Count)" }
    if ($r.pages[0].pageNumber -ne 1) { throw 'La portada no es la pagina 1' }
    if (-not $r.permissions.canEdit) { throw 'Faltan permisos de edicion' }
    $r
}
$pageId = $detail.pages[0].id

Test-Step 'POST /books layoutFormat invalido -> 400' {
    Assert-Status { Invoke-Api POST '/books' @{ libraryId = $lib.id; layoutFormat = 'circular' } -Token $tToken } 400
}

$textEl = Test-Step 'POST elemento de texto' {
    $r = Invoke-Api POST "/books/$($book.id)/pages/$pageId/elements" @{
        type = 'text'
        transformMatrix = @{ x = 10; y = 10; width = 40; height = 20; angle = 0 }
        properties = @{ text = 'Hola Mundo'; fontFamily = 'OpenDyslexic'; fontSize = 32 }
    } -Token $tToken
    if ($r.element.zIndex -ne 0) { throw "z_index inicial deberia ser 0, es $($r.element.zIndex)" }
    if ($r.element.properties.textAlign -ne 'left') { throw 'No aplico el default de alineacion izquierda' }
    $r.element
}

Test-Step 'Rechaza fontSize < 24 (accesibilidad) -> 400' {
    Assert-Status {
        Invoke-Api POST "/books/$($book.id)/pages/$pageId/elements" @{
            type = 'text'
            transformMatrix = @{ x = 0; y = 0; width = 10; height = 10; angle = 0 }
            properties = @{ text = 'Chico'; fontSize = 10 }
        } -Token $tToken
    } 400
}

Test-Step 'Rechaza properties que no coinciden con el type -> 400' {
    Assert-Status {
        Invoke-Api POST "/books/$($book.id)/pages/$pageId/elements" @{
            type = 'shape'
            transformMatrix = @{ x = 0; y = 0; width = 10; height = 10; angle = 0 }
            properties = @{ shape = 'dodecaedro' }
        } -Token $tToken
    } 400
}

Test-Step 'Rechaza transformMatrix fuera de rango -> 400' {
    Assert-Status {
        Invoke-Api POST "/books/$($book.id)/pages/$pageId/elements" @{
            type = 'shape'
            transformMatrix = @{ x = 9999; y = 0; width = 10; height = 10; angle = 0 }
            properties = @{ shape = 'rectangle' }
        } -Token $tToken
    } 400
}

$shapeEl = Test-Step 'POST elemento de forma (z_index autoincremental)' {
    $r = Invoke-Api POST "/books/$($book.id)/pages/$pageId/elements" @{
        type = 'shape'
        transformMatrix = @{ x = 30; y = 30; width = 25; height = 25; angle = 15 }
        properties = @{ shape = 'star'; fillColor = '#FFCC00' }
    } -Token $tToken
    if ($r.element.zIndex -ne 1) { throw "Esperaba z_index 1, llego $($r.element.zIndex)" }
    $r.element
}

Test-Step 'PATCH transformMatrix (mover y rotar)' {
    $r = Invoke-Api PATCH "/books/$($book.id)/pages/$pageId/elements/$($shapeEl.id)" @{
        transformMatrix = @{ x = 55; y = 40; width = 30; height = 30; angle = 45 }
    } -Token $tToken
    if ($r.element.transformMatrix.angle -ne 45) { throw 'No roto' }
    if ($r.element.transformMatrix.x -ne 55) { throw 'No se movio' }
}

Test-Step 'PATCH opacidad' {
    $r = Invoke-Api PATCH "/books/$($book.id)/pages/$pageId/elements/$($shapeEl.id)" @{ opacity = 0.35 } -Token $tToken
    if ([math]::Abs($r.element.opacity - 0.35) -gt 0.001) { throw "Opacidad incorrecta: $($r.element.opacity)" }
}

Test-Step 'Rechaza opacidad > 1 -> 400' {
    Assert-Status { Invoke-Api PATCH "/books/$($book.id)/pages/$pageId/elements/$($shapeEl.id)" @{ opacity = 5 } -Token $tToken } 400
}

Test-Step 'PATCH reordenar capas (star al fondo)' {
    $r = Invoke-Api PATCH "/books/$($book.id)/pages/$pageId/elements/reorder" @{
        elementIds = @($shapeEl.id, $textEl.id)
    } -Token $tToken
    $star = $r.elements | Where-Object { $_.id -eq $shapeEl.id }
    $txt  = $r.elements | Where-Object { $_.id -eq $textEl.id }
    if ($star.zIndex -ne 0 -or $txt.zIndex -ne 1) { throw "Orden incorrecto: star=$($star.zIndex) text=$($txt.zIndex)" }
}

Test-Step 'Reorder con lista incompleta -> 400' {
    Assert-Status { Invoke-Api PATCH "/books/$($book.id)/pages/$pageId/elements/reorder" @{ elementIds = @($textEl.id) } -Token $tToken } 400
}

Test-Step 'PATCH bloquear elemento (docente)' {
    $r = Invoke-Api PATCH "/books/$($book.id)/pages/$pageId/elements/$($textEl.id)" @{ isLocked = $true } -Token $tToken
    if (-not $r.element.isLocked) { throw 'No se bloqueo' }
}

$page2 = Test-Step 'POST nueva pagina' {
    $r = Invoke-Api POST "/books/$($book.id)/pages" @{ backgroundColor = '#F7F4EC' } -Token $tToken
    if ($r.page.pageNumber -ne 2) { throw "Esperaba pagina 2, llego $($r.page.pageNumber)" }
    $r.page
}

$page3 = Test-Step 'POST pagina insertada en medio renumera' {
    $r = Invoke-Api POST "/books/$($book.id)/pages" @{ afterPageNumber = 1 } -Token $tToken
    if ($r.page.pageNumber -ne 2) { throw "Esperaba insertar en 2, llego $($r.page.pageNumber)" }
    $d = (Invoke-Api GET "/books/$($book.id)" -Token $tToken).book
    $numbers = ($d.pages | ForEach-Object { $_.pageNumber }) -join ','
    if ($numbers -ne '1,2,3') { throw "Numeracion rota: $numbers" }
    $r.page
}

Test-Step 'PATCH reordenar paginas' {
    $d = (Invoke-Api GET "/books/$($book.id)" -Token $tToken).book
    $reversed = @($d.pages[2].id, $d.pages[1].id, $d.pages[0].id)
    $r = Invoke-Api PATCH "/books/$($book.id)/pages/reorder" @{ pageIds = $reversed } -Token $tToken
    if ($r.book.pages[0].id -ne $reversed[0]) { throw 'No reordeno' }
    $numbers = ($r.book.pages | ForEach-Object { $_.pageNumber }) -join ','
    if ($numbers -ne '1,2,3') { throw "Numeracion rota tras reordenar: $numbers" }
}

Test-Step 'DELETE pagina renumera el resto' {
    Invoke-Api DELETE "/books/$($book.id)/pages/$($page3.id)" -Token $tToken
    $d = (Invoke-Api GET "/books/$($book.id)" -Token $tToken).book
    $numbers = ($d.pages | ForEach-Object { $_.pageNumber }) -join ','
    if ($numbers -ne '1,2') { throw "Numeracion rota: $numbers" }
}

Test-Step 'PATCH color de fondo de pagina' {
    $r = Invoke-Api PATCH "/books/$($book.id)/pages/$($page2.id)" @{ backgroundColor = '#EDF2F0' } -Token $tToken
    if ($r.page.backgroundColor -ne '#EDF2F0') { throw 'No cambio el fondo' }
}

Test-Step 'Rechaza color de fondo invalido -> 400' {
    Assert-Status { Invoke-Api PATCH "/books/$($book.id)/pages/$($page2.id)" @{ backgroundColor = 'rojo' } -Token $tToken } 400
}

# --- Permisos de alumno ---
$student = Invoke-Api POST '/auth/students' @{ fullName = 'Alumno Etapa2'; libraryId = $lib.id } -Token $tToken
$sToken = (Invoke-Api POST '/auth/login/qr' @{ token = $student.qrToken }).token

$studentBook = Test-Step 'Alumno crea su propio libro' {
    $r = Invoke-Api POST '/books' @{ title = 'Libro del alumno'; libraryId = $lib.id } -Token $sToken
    if ($r.book.creatorId -ne $student.user.id) { throw 'creatorId incorrecto' }
    if (-not $r.book.portfolioId) { throw 'No se vinculo al portafolio' }
    $r.book
}

Test-Step 'Alumno no puede crear plantillas -> 403' {
    Assert-Status { Invoke-Api POST '/books' @{ libraryId = $lib.id; isTemplate = $true } -Token $sToken } 403
}

Test-Step 'Alumno no puede editar libro del docente -> 403' {
    Assert-Status {
        Invoke-Api PATCH "/books/$($book.id)" @{ title = 'Hackeado' } -Token $sToken
    } 403
}

Test-Step 'Alumno no puede desbloquear elemento -> 403' {
    Assert-Status {
        Invoke-Api PATCH "/books/$($book.id)/pages/$pageId/elements/$($textEl.id)" @{ isLocked = $false } -Token $sToken
    } 403
}

Test-Step 'Alumno no puede publicar (studentPublishable = false) -> 403' {
    Assert-Status { Invoke-Api PATCH "/books/$($studentBook.id)" @{ isPublished = $true } -Token $sToken } 403
}

Test-Step 'Docente habilita publicacion y el alumno publica' {
    Invoke-Api PATCH "/libraries/$($lib.id)" @{ studentPublishable = $true } -Token $tToken | Out-Null
    $r = Invoke-Api PATCH "/books/$($studentBook.id)" @{ isPublished = $true } -Token $sToken
    if (-not $r.book.isPublished) { throw 'No publico' }
}

Test-Step 'Docente bloquea edicion y el alumno pierde permiso -> 403' {
    Invoke-Api PATCH "/libraries/$($lib.id)" @{ studentEditable = $false } -Token $tToken | Out-Null
    Assert-Status { Invoke-Api PATCH "/books/$($studentBook.id)" @{ title = 'Nuevo' } -Token $sToken } 403
    Invoke-Api PATCH "/libraries/$($lib.id)" @{ studentEditable = $true } -Token $tToken | Out-Null
}

Test-Step 'Limite de libros por alumno' {
    Invoke-Api PATCH "/libraries/$($lib.id)" @{ studentBookLimit = 1 } -Token $tToken | Out-Null
    Assert-Status { Invoke-Api POST '/books' @{ libraryId = $lib.id } -Token $sToken } 403
}

Test-Step 'Usuario ajeno no ve el libro -> 403' {
    $outsider = Invoke-Api POST '/auth/register' @{ email = "out.$suffix@test.local"; password = 'Secreto12345'; fullName = 'Ajeno Total'; role = 'teacher' }
    Assert-Status { Invoke-Api GET "/books/$($book.id)" -Token $outsider.token } 403
}

Test-Step 'No se puede borrar la ultima pagina -> 400' {
    $b = Invoke-Api POST '/books' @{ title = 'Una sola pagina'; libraryId = $lib.id } -Token $tToken
    $d = (Invoke-Api GET "/books/$($b.book.id)" -Token $tToken).book
    Assert-Status { Invoke-Api DELETE "/books/$($b.book.id)/pages/$($d.pages[0].id)" -Token $tToken } 400
}

Test-Step 'Pagina de otro libro -> 404' {
    Assert-Status {
        Invoke-Api POST "/books/$($studentBook.id)/pages/$pageId/elements" @{
            type = 'shape'
            transformMatrix = @{ x = 0; y = 0; width = 10; height = 10; angle = 0 }
            properties = @{ shape = 'rectangle' }
        } -Token $tToken
    } 404
}

Test-Step 'DELETE elemento' {
    Invoke-Api DELETE "/books/$($book.id)/pages/$pageId/elements/$($shapeEl.id)" -Token $tToken
    $d = (Invoke-Api GET "/books/$($book.id)" -Token $tToken).book
    $target = $d.pages | Where-Object { $_.id -eq $pageId }
    if ($target.elements.Count -ne 1) { throw "Esperaba 1 elemento, quedan $($target.elements.Count)" }
    if ($target.elements[0].id -ne $textEl.id) { throw 'Se elimino el elemento equivocado' }
}

Test-Step 'DELETE libro elimina paginas en cascada' {
    Invoke-Api DELETE "/books/$($book.id)" -Token $tToken
    Assert-Status { Invoke-Api GET "/books/$($book.id)" -Token $tToken } 404
}

Write-Host "`n== Resultado: $pass OK / $fail FAIL ==" -ForegroundColor $(if ($fail -eq 0) { 'Green' } else { 'Red' })
if ($fail -gt 0) { exit 1 }

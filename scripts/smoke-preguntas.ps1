# Ensayo funcional de los bloques de pregunta interactiva.
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

Write-Host "`n== Preguntas interactivas: ensayo funcional ==" -ForegroundColor Cyan

$suffix = [guid]::NewGuid().ToString('N').Substring(0, 6)
$doc = Invoke-Api POST '/auth/register' @{ email = "pr.d.$suffix@test.local"; password = 'Secreto12345'; fullName = 'Docente Preguntas'; role = 'teacher' }
$dToken = $doc.token
$lib = (Invoke-Api POST '/libraries' @{ name = "Clase preguntas $suffix" } -Token $dToken).library
$book = (Invoke-Api POST '/books' @{ title = 'Cuestionario'; libraryId = $lib.id } -Token $dToken).book
$pageId = ((Invoke-Api GET "/books/$($book.id)" -Token $dToken).book).pages[0].id
$path = "/books/$($book.id)/pages/$pageId/elements"
$box = @{ x = 10; y = 10; width = 50; height = 45; angle = 0 }

# --- Creacion ---
$unica = Test-Step 'Crear una pregunta de respuesta unica' {
    $r = Invoke-Api POST $path @{
        type = 'question'; transformMatrix = $box
        properties = @{
            kind = 'single'; prompt = 'Cual es la capital de Peru?'
            options = @(
                @{ id = 'a'; text = 'Lima'; correct = $true },
                @{ id = 'b'; text = 'Quito'; correct = $false },
                @{ id = 'c'; text = 'La Paz'; correct = $false }
            )
        }
    } -Token $dToken
    if ($r.element.type -ne 'question') { throw "Tipo: $($r.element.type)" }
    if ($r.element.properties.options.Count -ne 3) { throw 'Opciones no persistidas' }
    $r.element
}

$multiple = Test-Step 'Crear una pregunta de varias respuestas' {
    $r = Invoke-Api POST $path @{
        type = 'question'; transformMatrix = $box
        properties = @{
            kind = 'multiple'; prompt = 'Cuales son mamiferos?'
            options = @(
                @{ id = 'a'; text = 'Ballena'; correct = $true },
                @{ id = 'b'; text = 'Tiburon'; correct = $false },
                @{ id = 'c'; text = 'Murcielago'; correct = $true },
                @{ id = 'd'; text = 'Cocodrilo'; correct = $false }
            )
        }
    } -Token $dToken
    $r.element
}

$orden = Test-Step 'Crear una pregunta de ordenar' {
    $r = Invoke-Api POST $path @{
        type = 'question'; transformMatrix = $box
        properties = @{
            kind = 'order'; prompt = 'Ordena de mas pequeno a mas grande'
            options = @(
                @{ id = 'p1'; text = 'Hormiga' },
                @{ id = 'p2'; text = 'Gato' },
                @{ id = 'p3'; text = 'Caballo' },
                @{ id = 'p4'; text = 'Elefante' }
            )
        }
    } -Token $dToken
    $r.element
}

Test-Step 'Una pregunta admite imagenes en enunciado y opciones' {
    $r = Invoke-Api POST $path @{
        type = 'question'; transformMatrix = $box
        properties = @{
            kind = 'single'; prompt = 'Que animal es?'
            promptImageUrl = '/storage/image/demo/enunciado.png'
            options = @(
                @{ id = 'a'; text = 'Gato'; imageUrl = '/storage/image/demo/gato.png'; correct = $true },
                @{ id = 'b'; text = 'Perro'; imageUrl = '/storage/image/demo/perro.png'; correct = $false }
            )
        }
    } -Token $dToken
    if (-not $r.element.properties.promptImageUrl) { throw 'Imagen del enunciado no persistida' }
    if (-not $r.element.properties.options[0].imageUrl) { throw 'Imagen de la opcion no persistida' }
}

# --- Validacion ---
Test-Step 'Una pregunta con una sola opcion -> 400' {
    Assert-Status {
        Invoke-Api POST $path @{
            type = 'question'; transformMatrix = $box
            properties = @{ kind = 'single'; prompt = 'Sola'; options = @(@{ id = 'a'; text = 'Unica'; correct = $true }) }
        } -Token $dToken
    } 400
}

Test-Step 'Respuesta unica sin ninguna correcta -> 400' {
    Assert-Status {
        Invoke-Api POST $path @{
            type = 'question'; transformMatrix = $box
            properties = @{
                kind = 'single'; prompt = 'Sin solucion'
                options = @(@{ id = 'a'; text = 'A'; correct = $false }, @{ id = 'b'; text = 'B'; correct = $false })
            }
        } -Token $dToken
    } 400
}

Test-Step 'Respuesta unica con dos correctas -> 400' {
    Assert-Status {
        Invoke-Api POST $path @{
            type = 'question'; transformMatrix = $box
            properties = @{
                kind = 'single'; prompt = 'Dos soluciones'
                options = @(@{ id = 'a'; text = 'A'; correct = $true }, @{ id = 'b'; text = 'B'; correct = $true })
            }
        } -Token $dToken
    } 400
}

Test-Step 'Opciones con el mismo id -> 400' {
    Assert-Status {
        Invoke-Api POST $path @{
            type = 'question'; transformMatrix = $box
            properties = @{
                kind = 'single'; prompt = 'Ids repetidos'
                options = @(@{ id = 'a'; text = 'A'; correct = $true }, @{ id = 'a'; text = 'B'; correct = $false })
            }
        } -Token $dToken
    } 400
}

# --- El autor si ve la solucion ---
Test-Step 'El autor recibe las opciones marcadas para poder editarlas' {
    $d = (Invoke-Api GET "/books/$($book.id)" -Token $dToken).book
    $pagina = $d.pages | Where-Object { $_.id -eq $pageId }
    $q = $pagina.elements | Where-Object { $_.id -eq $unica.id }
    if ($null -eq $q.properties.options[0].correct) { throw 'El autor deberia ver la marca de correcta' }
}

# --- El alumno NO ve la solucion ---
$alumno = Invoke-Api POST '/auth/students' @{ fullName = 'Alumna Preguntas'; libraryId = $lib.id } -Token $dToken
$sToken = (Invoke-Api POST '/auth/login/qr' @{ token = $alumno.qrToken }).token

Test-Step 'Al alumno le llegan las opciones sin la marca de correcta' {
    $d = (Invoke-Api GET "/books/$($book.id)" -Token $sToken).book
    $pagina = $d.pages | Where-Object { $_.id -eq $pageId }
    foreach ($q in ($pagina.elements | Where-Object { $_.type -eq 'question' })) {
        foreach ($opcion in $q.properties.options) {
            if ($null -ne $opcion.correct) { throw "Se filtro la solucion en '$($q.properties.prompt)'" }
        }
    }
}

Test-Step 'Al alumno le llegan las opciones de ordenar barajadas' {
    # Con 4 opciones, 12 lecturas seguidas en el orden exacto serian 1 entre 24^12.
    $original = @('p1', 'p2', 'p3', 'p4')
    $baraja = $false
    for ($i = 0; $i -lt 12 -and -not $baraja; $i++) {
        $d = (Invoke-Api GET "/books/$($book.id)" -Token $sToken).book
        $pagina = $d.pages | Where-Object { $_.id -eq $pageId }
        $q = $pagina.elements | Where-Object { $_.id -eq $orden.id }
        $ids = $q.properties.options | ForEach-Object { $_.id }
        if ("$ids" -ne "$original") { $baraja = $true }
    }
    if (-not $baraja) { throw 'Las opciones llegaron siempre en el orden de la solucion' }
}

# --- Correccion en el servidor ---
Write-Host "`n-- Correccion --" -ForegroundColor Cyan

Test-Step 'Respuesta unica correcta' {
    $r = (Invoke-Api POST "/books/$($book.id)/questions/$($unica.id)/answer" @{ answer = @('a') } -Token $sToken).result
    if (-not $r.correct) { throw 'Deberia ser correcta' }
    if ($r.feedback -ne 'Muy bien!') { throw "Mensaje: $($r.feedback)" }
}

Test-Step 'Respuesta unica incorrecta' {
    $r = (Invoke-Api POST "/books/$($book.id)/questions/$($unica.id)/answer" @{ answer = @('b') } -Token $sToken).result
    if ($r.correct) { throw 'No deberia ser correcta' }
    if ($r.solution -notcontains 'a') { throw 'La solucion deberia revelarse tras responder' }
}

Test-Step 'Varias respuestas: acierta solo con el conjunto exacto' {
    $ok = (Invoke-Api POST "/books/$($book.id)/questions/$($multiple.id)/answer" @{ answer = @('a', 'c') } -Token $sToken).result
    if (-not $ok.correct) { throw 'a+c deberia ser correcta' }

    $parcial = (Invoke-Api POST "/books/$($book.id)/questions/$($multiple.id)/answer" @{ answer = @('a') } -Token $sToken).result
    if ($parcial.correct) { throw 'Una respuesta incompleta no deberia valer' }

    $sobra = (Invoke-Api POST "/books/$($book.id)/questions/$($multiple.id)/answer" @{ answer = @('a', 'b', 'c') } -Token $sToken).result
    if ($sobra.correct) { throw 'Con una de mas no deberia valer' }
}

Test-Step 'Ordenar: solo vale la secuencia exacta' {
    $ok = (Invoke-Api POST "/books/$($book.id)/questions/$($orden.id)/answer" @{ answer = @('p1', 'p2', 'p3', 'p4') } -Token $sToken).result
    if (-not $ok.correct) { throw 'El orden correcto deberia valer' }

    $mal = (Invoke-Api POST "/books/$($book.id)/questions/$($orden.id)/answer" @{ answer = @('p2', 'p1', 'p3', 'p4') } -Token $sToken).result
    if ($mal.correct) { throw 'Un orden distinto no deberia valer' }
}

Test-Step 'Responder una pregunta de un libro ajeno -> 403' {
    $ajeno = Invoke-Api POST '/auth/register' @{ email = "pr.x.$suffix@test.local"; password = 'Secreto12345'; fullName = 'Ajeno'; role = 'teacher' }
    Assert-Status {
        Invoke-Api POST "/books/$($book.id)/questions/$($unica.id)/answer" @{ answer = @('a') } -Token $ajeno.token
    } 403
}

Test-Step 'Responder un elemento que no es pregunta -> 404' {
    $texto = Invoke-Api POST $path @{
        type = 'text'; transformMatrix = $box; properties = @{ text = 'No soy una pregunta' }
    } -Token $dToken
    Assert-Status {
        Invoke-Api POST "/books/$($book.id)/questions/$($texto.element.id)/answer" @{ answer = @('a') } -Token $sToken
    } 404
}

# --- Enlace compartido ---
Write-Host "`n-- Por enlace compartido --" -ForegroundColor Cyan

$share = (Invoke-Api PUT "/books/$($book.id)/share" @{ visibility = 'public' } -Token $dToken).share

Test-Step 'Por enlace publico tampoco se filtra la solucion' {
    $b = (Invoke-RestMethod -Uri "$base/public/books/$($share.token)").book
    $pagina = $b.pages | Where-Object { $_.id -eq $pageId }
    foreach ($q in ($pagina.elements | Where-Object { $_.type -eq 'question' })) {
        foreach ($opcion in $q.properties.options) {
            if ($null -ne $opcion.correct) { throw 'Se filtro la solucion por el enlace publico' }
        }
    }
}

Test-Step 'Un anonimo puede responder por el enlace publico' {
    $body = [Text.Encoding]::UTF8.GetBytes((@{ answer = @('a') } | ConvertTo-Json -Compress))
    $r = (Invoke-RestMethod -Method POST -Uri "$base/public/books/$($share.token)/questions/$($unica.id)/answer" `
            -Body $body -ContentType 'application/json; charset=utf-8').result
    if (-not $r.correct) { throw 'Deberia ser correcta' }
}

Test-Step 'Sin enlace valido no se puede responder -> 404' {
    Assert-Status {
        $body = [Text.Encoding]::UTF8.GetBytes((@{ answer = @('a') } | ConvertTo-Json -Compress))
        Invoke-RestMethod -Method POST -Uri "$base/public/books/$([guid]::NewGuid())/questions/$($unica.id)/answer" `
            -Body $body -ContentType 'application/json; charset=utf-8'
    } 404
}

Test-Step 'Tras revocar el enlace no se puede responder -> 404' {
    $null = Invoke-Api PUT "/books/$($book.id)/share" @{ visibility = 'private' } -Token $dToken
    Assert-Status {
        $body = [Text.Encoding]::UTF8.GetBytes((@{ answer = @('a') } | ConvertTo-Json -Compress))
        Invoke-RestMethod -Method POST -Uri "$base/public/books/$($share.token)/questions/$($unica.id)/answer" `
            -Body $body -ContentType 'application/json; charset=utf-8'
    } 404
}

# --- Edicion ---
Test-Step 'El autor cambia la respuesta correcta' {
    $r = Invoke-Api PATCH "$path/$($unica.id)" @{
        properties = @{
            kind = 'single'; prompt = 'Cual es la capital de Peru?'
            options = @(
                @{ id = 'a'; text = 'Lima'; correct = $false },
                @{ id = 'b'; text = 'Quito'; correct = $true },
                @{ id = 'c'; text = 'La Paz'; correct = $false }
            )
        }
    } -Token $dToken
    if (-not $r.element.properties.options[1].correct) { throw 'No se guardo el cambio' }

    $comprobacion = (Invoke-Api POST "/books/$($book.id)/questions/$($unica.id)/answer" @{ answer = @('b') } -Token $sToken).result
    if (-not $comprobacion.correct) { throw 'La correccion no refleja el cambio' }
}

Write-Host "`n== Resultado: $pass OK / $fail FAIL ==" -ForegroundColor $(if ($fail -eq 0) { 'Green' } else { 'Red' })
if ($fail -gt 0) { exit 1 }

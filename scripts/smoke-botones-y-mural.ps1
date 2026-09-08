# Ensayo funcional de los botones del lienzo y del mural publico.
#
# Del mural interesa sobre todo QUIEN puede publicar y que se ve sin cuenta: es
# la unica parte de la plataforma que sale a internet abierto, asi que un fallo
# de permisos aqui no expone un libro a una clase, lo expone a cualquiera.
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

Write-Host "`n== Botones y mural: ensayo funcional ==" -ForegroundColor Cyan

$suffix = [guid]::NewGuid().ToString('N').Substring(0, 6)
$doc = Invoke-Api POST '/auth/register' @{ email = "bm.$suffix@test.local"; password = 'Secreto12345'; fullName = 'Docente Boton'; role = 'teacher' }
$token = $doc.token
$book = (Invoke-Api POST '/books' @{ title = "Libro con botones $suffix" } -Token $token).book
$pageId = ((Invoke-Api GET "/books/$($book.id)" -Token $token).book).pages[0].id
$path = "/books/$($book.id)/pages/$pageId/elements"
$box = @{ x = 10; y = 10; width = 30; height = 10; angle = 0 }

# --- Botones ---

Write-Host "`n-- Botones --" -ForegroundColor Cyan

$boton = Test-Step 'Se crea un boton con sus colores' {
    $el = (Invoke-Api POST $path @{
        type = 'button'; transformMatrix = $box
        properties = @{
            label = 'Ir a la pagina 3'; variant = 'solid'; shape = 'pill'; size = 'lg'
            backgroundColor = '#16A34A'; textColor = '#FFFFFF'; borderColor = '#15803D'
            fontFamily = 'Fredoka'; iconSource = 'emoji'; iconChar = '➡'; iconPosition = 'right'
            linkUrl = '#pagina-3'; shadow = $true
        }
    } -Token $token).element
    if ($el.type -ne 'button') { throw "Tipo: $($el.type)" }
    if ($el.properties.backgroundColor -ne '#16A34A') { throw 'Se perdio el color' }
    if ($el.properties.iconChar -ne '➡') { throw "Se perdio el icono: $($el.properties.iconChar)" }
    if ($el.properties.linkUrl -ne '#pagina-3') { throw 'Se perdio el enlace interno' }
    $el
}

Test-Step 'Un boton nace con valores por defecto sensatos' {
    $el = (Invoke-Api POST $path @{ type = 'button'; transformMatrix = $box; properties = @{} } -Token $token).element
    if ($el.properties.variant -ne 'solid') { throw "Variante: $($el.properties.variant)" }
    if ($el.properties.size -ne 'md') { throw "Tamano: $($el.properties.size)" }
    if ($el.properties.iconSource -ne 'none') { throw 'Se invento un icono' }
    if ($el.properties.label -ne 'Pulsa aqui') { throw "Etiqueta: $($el.properties.label)" }
}

Test-Step 'Un enlace a una web tambien vale' {
    $el = (Invoke-Api POST $path @{
        type = 'button'; transformMatrix = $box
        properties = @{ label = 'Ver la web'; linkUrl = 'https://ejemplo.org' }
    } -Token $token).element
    if ($el.properties.linkUrl -ne 'https://ejemplo.org') { throw 'Se perdio el enlace' }
}

Test-Step 'Un enlace que no se navega se rechaza' {
    Assert-Status { Invoke-Api POST $path @{
        type = 'button'; transformMatrix = $box
        properties = @{ label = 'Malo'; linkUrl = 'javascript:alert(1)' }
    } -Token $token } 400
}

Test-Step 'Un color que no es hexadecimal se rechaza' {
    Assert-Status { Invoke-Api POST $path @{
        type = 'button'; transformMatrix = $box
        properties = @{ label = 'x'; backgroundColor = 'rojo' }
    } -Token $token } 400
}

Test-Step 'Una variante inventada se rechaza' {
    Assert-Status { Invoke-Api POST $path @{
        type = 'button'; transformMatrix = $box
        properties = @{ label = 'x'; variant = 'neon' }
    } -Token $token } 400
}

Test-Step 'El boton admite interactividad y animacion como cualquier objeto' {
    $el = (Invoke-Api POST $path @{
        type = 'button'; transformMatrix = $box
        properties = @{ label = 'Con ayuda' }
        interaction = @{ kind = 'tooltip'; text = 'Lleva al glosario' }
        animation = @{ trigger = 'hover'; effect = 'bounce'; duration = 0.6; delay = 0 }
    } -Token $token).element
    if ($el.interaction.text -ne 'Lleva al glosario') { throw 'Sin interactividad' }
    if ($el.animation.effect -ne 'bounce') { throw 'Sin animacion' }
}

Test-Step 'El boton aparece en el catalogo de herramientas vetables' {
    $tools = (Invoke-Api GET '/libraries/tools' -Token $token).tools
    if (-not ($tools | Where-Object { $_.id -eq 'button' })) { throw 'No esta en el catalogo' }
}

Test-Step 'Una biblioteca puede vetar los botones a su alumnado' {
    $lib = (Invoke-Api POST '/libraries' @{ name = "Clase sin botones $suffix" } -Token $token).library
    $act = (Invoke-Api PATCH "/libraries/$($lib.id)" @{ disabledTools = @('button') } -Token $token).library
    if ($act.disabledTools -notcontains 'button') { throw "Vetadas: $($act.disabledTools -join ',')" }
}

# --- Mural ---

Write-Host "`n-- Mural --" -ForegroundColor Cyan

Test-Step 'Un libro nace fuera del mural' {
    $estado = (Invoke-Api GET "/books/$($book.id)/mural" -Token $token).mural
    if ($estado.inMural -ne $false) { throw 'Nacio publicado' }
}

Test-Step 'El mural se lee sin sesion' {
    $mural = Invoke-RestMethod "$base/public/mural"
    if ($null -eq $mural.items) { throw 'Sin lista' }
}

Test-Step 'Publicar lo saca al mural' {
    $estado = (Invoke-Api POST "/books/$($book.id)/mural" -Token $token).mural
    if (-not $estado.inMural) { throw 'No se publico' }
    if (-not $estado.shareToken) { throw 'Sin enlace publico' }
}

Test-Step 'Publicar tambien lo vuelve publico por enlace' {
    $b = (Invoke-Api GET '/books?scope=all' -Token $token).books | Where-Object { $_.id -eq $book.id }
    if ($b.shareVisibility -ne 'public') { throw "Visibilidad: $($b.shareVisibility)" }
}

Test-Step 'Y aparece en el mural que ve cualquiera, sin cuenta' {
    $mural = Invoke-RestMethod "$base/public/mural?pageSize=48"
    $mio = $mural.items | Where-Object { $_.id -eq $book.id }
    if (-not $mio) { throw 'No aparece' }
    if ($mio.authorName -ne 'Docente Boton') { throw "Autoria: $($mio.authorName)" }
    if (-not $mio.shareToken) { throw 'Sin token para abrirlo' }
}

Test-Step 'El libro del mural se abre sin cuenta con su token' {
    $mural = Invoke-RestMethod "$base/public/mural?pageSize=48"
    $mio = $mural.items | Where-Object { $_.id -eq $book.id }
    $abierto = Invoke-RestMethod "$base/public/books/$($mio.shareToken)"
    if ($abierto.book.id -ne $book.id) { throw 'Abrio otro libro' }
}

Test-Step 'La busqueda del mural encuentra por titulo' {
    $mural = Invoke-RestMethod "$base/public/mural?search=botones+$suffix"
    if (-not ($mural.items | Where-Object { $_.id -eq $book.id })) { throw 'No lo encuentra' }
}

Test-Step 'Y no devuelve lo que no coincide' {
    $mural = Invoke-RestMethod "$base/public/mural?search=zzzznoexiste$suffix"
    if ($mural.total -ne 0) { throw "Devolvio $($mural.total)" }
}

Test-Step 'Volverlo privado lo esconde del mural sin retirarlo a mano' {
    Invoke-Api PUT "/books/$($book.id)/share" @{ visibility = 'private' } -Token $token | Out-Null
    $mural = Invoke-RestMethod "$base/public/mural?pageSize=48"
    if ($mural.items | Where-Object { $_.id -eq $book.id }) { throw 'Sigue a la vista' }
    # La marca se conserva: al volver a hacerlo publico reaparece solo.
    $estado = (Invoke-Api GET "/books/$($book.id)/mural" -Token $token).mural
    if (-not $estado.inMural) { throw 'Se perdio la marca de publicacion' }
}

Test-Step 'Y al volver a hacerlo publico reaparece' {
    Invoke-Api PUT "/books/$($book.id)/share" @{ visibility = 'public' } -Token $token | Out-Null
    $mural = Invoke-RestMethod "$base/public/mural?pageSize=48"
    if (-not ($mural.items | Where-Object { $_.id -eq $book.id })) { throw 'No reaparecio' }
}

Test-Step 'Retirarlo lo quita del mural pero no rompe el enlace' {
    $estado = (Invoke-Api DELETE "/books/$($book.id)/mural" -Token $token).mural
    if ($estado.inMural) { throw 'Sigue publicado' }
    if (-not $estado.shareToken) { throw 'Se llevo por delante el enlace' }
    $abierto = Invoke-RestMethod "$base/public/books/$($estado.shareToken)"
    if ($abierto.book.id -ne $book.id) { throw 'El enlace dejo de funcionar' }
}

# --- Quien puede publicar ---

Write-Host "`n-- Permisos del mural --" -ForegroundColor Cyan

$otroDoc = Invoke-Api POST '/auth/register' @{ email = "bm2.$suffix@test.local"; password = 'Secreto12345'; fullName = 'Otro Docente'; role = 'teacher' }

Test-Step 'Otro docente no puede publicar un libro ajeno' {
    Assert-Status { Invoke-Api POST "/books/$($book.id)/mural" -Token $otroDoc.token } 403
}

Test-Step 'Ni retirarlo' {
    Assert-Status { Invoke-Api DELETE "/books/$($book.id)/mural" -Token $otroDoc.token } 403
}

$clase = (Invoke-Api POST '/libraries' @{ name = "Clase mural $suffix" } -Token $token).library
$alumna = Invoke-Api POST '/auth/students' @{ fullName = "Alumna Mural $suffix"; libraryId = $clase.id } -Token $token
$sesion = Invoke-Api POST '/auth/login/qr' @{ token = $alumna.qrToken }
$suyo = (Invoke-Api POST '/books' @{ title = "Cuaderno de la alumna $suffix"; libraryId = $clase.id } -Token $sesion.token).book

Test-Step 'El alumnado no publica en el mural ni su propio libro' {
    Assert-Status { Invoke-Api POST "/books/$($suyo.id)/mural" -Token $sesion.token } 403
}

Test-Step 'Pero su docente si puede publicarselo' {
    $estado = (Invoke-Api POST "/books/$($suyo.id)/mural" -Token $token).mural
    if (-not $estado.inMural) { throw 'No se publico' }
}

Test-Step 'Un libro que no existe da 404, no 403' {
    Assert-Status { Invoke-Api POST '/books/00000000-0000-0000-0000-000000000000/mural' -Token $token } 404
}

Test-Step 'El mural no ensena libros privados aunque tengan la marca' {
    Invoke-Api PUT "/books/$($suyo.id)/share" @{ visibility = 'private' } -Token $token | Out-Null
    $mural = Invoke-RestMethod "$base/public/mural?pageSize=48"
    if ($mural.items | Where-Object { $_.id -eq $suyo.id }) { throw 'Se ve un libro privado' }
}

# --- Lo que NO puede salir a internet ---
#
# La portada del mural se arma en SQL y no pasa por el filtro que quita las
# soluciones a quien solo lee. Con una pregunta en la primera pagina, el mural
# publicaba la opcion correcta, la guia del docente y lo que hubiera escrito un
# alumno, a cualquiera y sin cuenta.

Write-Host "`n-- Lo que no puede salir a internet --" -ForegroundColor Cyan

$conPregunta = (Invoke-Api POST '/books' @{ title = "Ficha con pregunta $suffix" } -Token $token).book
$paginaPreg = ((Invoke-Api GET "/books/$($conPregunta.id)" -Token $token).book).pages[0].id
Invoke-Api POST "/books/$($conPregunta.id)/pages/$paginaPreg/elements" @{
    type = 'question'
    transformMatrix = @{ x = 10; y = 10; width = 60; height = 30; angle = 0 }
    properties = @{
        kind = 'single'; prompt = 'Capital de Colombia?'
        options = @(
            @{ id = 'a'; text = 'Bogota'; correct = $true },
            @{ id = 'b'; text = 'Medellin'; correct = $false }
        )
        feedbackCorrect = 'Bien'; feedbackWrong = 'No'; accentColor = '#2563EB'; allowRetry = $true
    }
} -Token $token | Out-Null

Invoke-Api POST "/books/$($conPregunta.id)/mural" -Token $token | Out-Null

Test-Step 'La portada del mural NO publica cual es la respuesta correcta' {
    $mural = Invoke-RestMethod "$base/public/mural?pageSize=48"
    $mio = $mural.items | Where-Object { $_.id -eq $conPregunta.id }
    if (-not $mio) { throw 'No aparece en el mural' }
    $crudo = $mio.cover | ConvertTo-Json -Depth 12 -Compress
    if ($crudo -match '"correct"') { throw "La portada lleva la solucion: $crudo" }
    # La pregunta si se ve; lo que no viaja es cual es la buena.
    if ($crudo -notmatch 'Bogota') { throw 'La portada perdio el contenido de la pregunta' }
}

Test-Step 'Ni la guia de respuesta del docente ni lo que escribio un alumno' {
    $abierta = (Invoke-Api POST "/books/$($conPregunta.id)/pages/$paginaPreg/elements" @{
        type = 'question'
        transformMatrix = @{ x = 10; y = 50; width = 60; height = 30; angle = 0 }
        properties = @{
            kind = 'open'; prompt = 'Explica por que'
            options = @(); expectedAnswer = 'Porque es la capital desde 1538'
            feedbackCorrect = ''; feedbackWrong = ''; accentColor = '#2563EB'; allowRetry = $true
        }
    } -Token $token).element
    if (-not $abierta) { throw 'No se creo la pregunta abierta' }

    $mural = Invoke-RestMethod "$base/public/mural?pageSize=48"
    $mio = $mural.items | Where-Object { $_.id -eq $conPregunta.id }
    $crudo = $mio.cover | ConvertTo-Json -Depth 12 -Compress
    if ($crudo -match 'expectedAnswer') { throw 'La portada lleva la guia del docente' }
    if ($crudo -match '1538') { throw 'La portada lleva el texto de la guia' }
    if ($crudo -match 'studentAnswer') { throw 'La portada lleva la respuesta de un alumno' }
}

Test-Step 'Y la portada del listado normal tampoco' {
    $b = (Invoke-Api GET '/books?scope=all' -Token $token).books | Where-Object { $_.id -eq $conPregunta.id }
    $crudo = $b.cover | ConvertTo-Json -Depth 12 -Compress
    if ($crudo -match '"correct"') { throw 'El listado lleva la solucion en la portada' }
    if ($crudo -match 'expectedAnswer') { throw 'El listado lleva la guia del docente' }
}

Invoke-Api DELETE "/books/$($conPregunta.id)/mural" -Token $token | Out-Null

# --- Limpieza: el mural sale a internet abierto, no se dejan restos ---
Invoke-Api DELETE "/books/$($book.id)/mural" -Token $token | Out-Null
Invoke-Api DELETE "/books/$($suyo.id)/mural" -Token $token | Out-Null

Test-Step 'La limpieza deja el mural sin los libros de prueba' {
    $mural = Invoke-RestMethod "$base/public/mural?pageSize=48"
    if ($mural.items | Where-Object { $_.id -eq $book.id -or $_.id -eq $suyo.id }) {
        throw 'Quedaron libros de prueba publicados'
    }
}

Write-Host "`n== Resultado: $pass OK / $fail FAIL ==" -ForegroundColor $(if ($fail -eq 0) { 'Green' } else { 'Red' })
if ($fail -gt 0) { exit 1 }

# Ensayo funcional de la interactividad y la animacion de los objetos.
#
# Lo que se comprueba aqui no lo ve el compilador: que los dos campos sobrevivan
# al viaje de ida y vuelta a la base, que null los quite y que omitirlos no los
# borre por accidente, y que duplicar una pagina se los lleve consigo.
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
        # Se codifica a UTF-8 a mano: PowerShell 5.1 mandaria las tildes en ANSI.
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

Write-Host "`n== Interactividad y animacion: ensayo funcional ==" -ForegroundColor Cyan

$suffix = [guid]::NewGuid().ToString('N').Substring(0, 6)
$user = Invoke-Api POST '/auth/register' @{ email = "int.$suffix@test.local"; password = 'Secreto12345'; fullName = 'Docente Interactivo'; role = 'teacher' }
$token = $user.token
$book = (Invoke-Api POST '/books' @{ title = 'Libro interactivo' } -Token $token).book
$pageId = ((Invoke-Api GET "/books/$($book.id)" -Token $token).book).pages[0].id
$path = "/books/$($book.id)/pages/$pageId/elements"
$box = @{ x = 10; y = 10; width = 20; height = 20; angle = 0 }

# --- Guardar y recuperar ---

$conGlobo = Test-Step 'Un elemento nace con globo y con animacion' {
    $el = (Invoke-Api POST $path @{
        type = 'text'; transformMatrix = $box; properties = @{ text = 'El roble' }
        interaction = @{ kind = 'tooltip'; trigger = 'hover'; title = 'Quercus'; text = 'Arbol de hoja caduca' }
        animation = @{ trigger = 'entrance'; effect = 'fade'; duration = 1.2; delay = 0.3 }
    } -Token $token).element
    if ($el.interaction.title -ne 'Quercus') { throw "Sin titulo: $($el.interaction | ConvertTo-Json -Compress)" }
    if ($el.animation.effect -ne 'fade') { throw "Sin efecto: $($el.animation | ConvertTo-Json -Compress)" }
    $el
}

Test-Step 'Los dos campos sobreviven a la lectura del libro' {
    $d = (Invoke-Api GET "/books/$($book.id)" -Token $token).book
    $el = ($d.pages | Where-Object { $_.id -eq $pageId }).elements | Where-Object { $_.id -eq $conGlobo.id }
    if ($el.interaction.text -ne 'Arbol de hoja caduca') { throw "Texto perdido" }
    if ([double]$el.animation.duration -ne 1.2) { throw "Duracion perdida: $($el.animation.duration)" }
    if ([double]$el.animation.delay -ne 0.3) { throw "Espera perdida: $($el.animation.delay)" }
}

Test-Step 'Un elemento sin nada trae los dos campos en nulo' {
    $el = (Invoke-Api POST $path @{ type = 'text'; transformMatrix = $box; properties = @{ text = 'Sin nada' } } -Token $token).element
    if ($null -ne $el.interaction) { throw "Interaccion inventada" }
    if ($null -ne $el.animation) { throw "Animacion inventada" }
}

# --- Modificar sin pisar lo que no se toca ---

Test-Step 'Cambiar la animacion no borra el globo' {
    $el = (Invoke-Api PATCH "$path/$($conGlobo.id)" @{
        animation = @{ trigger = 'loop'; effect = 'pulse'; duration = 2; delay = 0 }
    } -Token $token).element
    if ($el.animation.effect -ne 'pulse') { throw "No cambio el efecto" }
    if ($el.interaction.title -ne 'Quercus') { throw "Se llevo por delante el globo" }
}

Test-Step 'Mover el elemento no toca ni el globo ni la animacion' {
    $el = (Invoke-Api PATCH "$path/$($conGlobo.id)" @{
        transformMatrix = @{ x = 40; y = 40; width = 20; height = 20; angle = 0 }
    } -Token $token).element
    if ($null -eq $el.interaction) { throw "Se perdio el globo al mover" }
    if ($null -eq $el.animation) { throw "Se perdio la animacion al mover" }
}

Test-Step 'Mandar null quita el globo y deja la animacion' {
    $el = (Invoke-Api PATCH "$path/$($conGlobo.id)" @{ interaction = $null } -Token $token).element
    if ($null -ne $el.interaction) { throw "El globo sigue ahi" }
    if ($el.animation.effect -ne 'pulse') { throw "Se llevo tambien la animacion" }
}

Test-Step 'Mandar null quita tambien la animacion' {
    $el = (Invoke-Api PATCH "$path/$($conGlobo.id)" @{ animation = $null } -Token $token).element
    if ($null -ne $el.animation) { throw "La animacion sigue ahi" }
}

# --- Lo que el backend no debe aceptar ---

Test-Step 'Un globo con mas de 600 caracteres se rechaza' {
    Assert-Status { Invoke-Api POST $path @{
        type = 'text'; transformMatrix = $box; properties = @{ text = 'x' }
        interaction = @{ kind = 'tooltip'; text = ('a' * 601) }
    } -Token $token } 400
}

Test-Step 'La ventana si admite un texto largo' {
    $el = (Invoke-Api POST $path @{
        type = 'text'; transformMatrix = $box; properties = @{ text = 'x' }
        interaction = @{ kind = 'popup'; title = 'Ficha'; text = ('a' * 3000) }
    } -Token $token).element
    if ($el.interaction.text.Length -ne 3000) { throw "Llego recortado: $($el.interaction.text.Length)" }
}

# El globo admite imagen desde el 7 de septiembre de 2026: se pidio expresamente
# poder ensenar una imagen al pasar el raton, no solo al pulsar.
Test-Step 'Un globo SI admite una imagen' {
    $el = (Invoke-Api POST $path @{
        type = 'text'; transformMatrix = $box; properties = @{ text = 'x' }
        interaction = @{ kind = 'tooltip'; text = 'Corto'; imageUrl = 'https://ejemplo.org/a.png' }
    } -Token $token).element
    if ($el.interaction.imageUrl -ne 'https://ejemplo.org/a.png') { throw 'Se perdio la imagen' }
}

Test-Step 'Pero solo una: la de cabecera mas otra se rechaza' {
    Assert-Status { Invoke-Api POST $path @{
        type = 'text'; transformMatrix = $box; properties = @{ text = 'x' }
        interaction = @{
            kind = 'tooltip'; text = 'Corto'; imageUrl = 'https://ejemplo.org/a.png'
            content = @(@{ type = 'image'; url = 'https://ejemplo.org/b.png' })
        }
    } -Token $token } 400
}

# --- Contenido con formato ---

Test-Step 'Una ficha con titulo, negrita, lista e imagenes se guarda entera' {
    $el = (Invoke-Api POST $path @{
        type = 'text'; transformMatrix = $box; properties = @{ text = 'Ficha' }
        interaction = @{
            kind = 'popup'; trigger = 'click'; title = 'El roble'
            text = "El roble`nArbol de hoja caduca"
            content = @(
                @{ type = 'heading'; spans = @(@{ text = 'Caracteristicas' }) },
                @{ type = 'paragraph'; spans = @(
                    @{ text = 'Arbol de ' },
                    @{ text = 'hoja caduca'; bold = $true; italic = $true }
                ) },
                @{ type = 'list'; ordered = $true; items = @(
                    @(@{ text = 'Vive 500 anos' }),
                    @(@{ text = 'Hasta 40 metros' })
                ) },
                @{ type = 'image'; url = 'https://ejemplo.org/roble.png'; alt = 'Un roble'; caption = 'En otono' },
                @{ type = 'paragraph'; spans = @(@{ text = 'Mas datos'; href = 'https://ejemplo.org' }) }
            )
        }
    } -Token $token).element

    $c = $el.interaction.content
    if (@($c).Count -ne 5) { throw "Llegaron $(@($c).Count) bloques de 5" }
    if ($c[0].type -ne 'heading') { throw "El primero es $($c[0].type)" }
    if ($c[1].spans[1].bold -ne $true) { throw 'Se perdio la negrita' }
    if ($c[1].spans[1].italic -ne $true) { throw 'Se perdio la cursiva' }
    if ($c[2].ordered -ne $true) { throw 'La lista dejo de ser numerada' }
    if (@($c[2].items).Count -ne 2) { throw 'Se perdio un punto de la lista' }
    if ($c[3].caption -ne 'En otono') { throw 'Se perdio el pie de la imagen' }
    if ($c[4].spans[0].href -ne 'https://ejemplo.org') { throw 'Se perdio el enlace' }
}

Test-Step 'El contenido sobrevive a releer el libro' {
    $d = (Invoke-Api GET "/books/$($book.id)" -Token $token).book
    $page = $d.pages | Where-Object { $_.id -eq $pageId }
    $ficha = $page.elements | Where-Object { $_.interaction.title -eq 'El roble' }
    if (-not $ficha) { throw 'No se encontro la ficha' }
    if (@($ficha.interaction.content).Count -ne 5) { throw 'La ficha perdio bloques al releer' }
}

Test-Step 'Un bloque de un tipo inventado se rechaza' {
    Assert-Status { Invoke-Api POST $path @{
        type = 'text'; transformMatrix = $box; properties = @{ text = 'x' }
        interaction = @{ kind = 'popup'; text = 'x'; content = @(@{ type = 'video'; url = 'https://x/y.mp4' }) }
    } -Token $token } 400
}

Test-Step 'Un enlace que no se navega se rechaza' {
    Assert-Status { Invoke-Api POST $path @{
        type = 'text'; transformMatrix = $box; properties = @{ text = 'x' }
        interaction = @{ kind = 'popup'; text = 'x'; content = @(
            @{ type = 'paragraph'; spans = @(@{ text = 'Pulsa'; href = 'javascript:alert(1)' }) }
        ) }
    } -Token $token } 400
}

Test-Step 'Una imagen con direccion rara se rechaza' {
    Assert-Status { Invoke-Api POST $path @{
        type = 'text'; transformMatrix = $box; properties = @{ text = 'x' }
        interaction = @{ kind = 'popup'; text = 'x'; content = @(
            @{ type = 'image'; url = 'javascript:alert(1)' }
        ) }
    } -Token $token } 400
}

Test-Step 'El texto de un bloque se guarda tal cual, sin interpretarlo' {
    $veneno = '<img src=x onerror=alert(1)>'
    $el = (Invoke-Api POST $path @{
        type = 'text'; transformMatrix = $box; properties = @{ text = 'x' }
        interaction = @{ kind = 'popup'; text = $veneno; content = @(
            @{ type = 'paragraph'; spans = @(@{ text = $veneno }) }
        ) }
    } -Token $token).element
    if ($el.interaction.content[0].spans[0].text -ne $veneno) {
        throw "El servidor toco el texto: $($el.interaction.content[0].spans[0].text)"
    }
}

Test-Step 'Un efecto que no existe se rechaza' {
    Assert-Status { Invoke-Api POST $path @{
        type = 'text'; transformMatrix = $box; properties = @{ text = 'x' }
        animation = @{ effect = 'explotar' }
    } -Token $token } 400
}

Test-Step 'Enlace y ventana al pulsar no caben en el mismo elemento' {
    Assert-Status { Invoke-Api POST $path @{
        type = 'text'; transformMatrix = $box
        properties = @{ text = 'x'; linkUrl = 'https://ejemplo.org' }
        interaction = @{ kind = 'popup'; trigger = 'click'; text = 'Detalle' }
    } -Token $token } 400
}

Test-Step 'Enlace y globo al pasar el raton si conviven' {
    $el = (Invoke-Api POST $path @{
        type = 'text'; transformMatrix = $box
        properties = @{ text = 'x'; linkUrl = 'https://ejemplo.org' }
        interaction = @{ kind = 'tooltip'; trigger = 'hover'; text = 'Se abre en otra pestana' }
    } -Token $token).element
    if ($el.interaction.trigger -ne 'hover') { throw "Disparo equivocado: $($el.interaction.trigger)" }
}

# --- Videos y contenido incrustado ---

$VIDEO = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'

Test-Step 'Una ventana admite un video de YouTube' {
    $el = (Invoke-Api POST $path @{
        type = 'text'; transformMatrix = $box; properties = @{ text = 'Ficha' }
        interaction = @{ kind = 'popup'; title = 'El agua'; text = 'Ficha'
            content = @(@{ type = 'embed'; sourceUrl = $VIDEO; caption = 'El ciclo del agua' }) }
    } -Token $token).element
    $b = $el.interaction.content[0]
    if ($b.embedUrl -ne 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ') {
        throw "Direccion mal resuelta: $($b.embedUrl)"
    }
    if ($b.provider -ne 'youtube') { throw "Proveedor: $($b.provider)" }
    if ($b.caption -ne 'El ciclo del agua') { throw 'Se perdio el pie' }
}

Test-Step 'La direccion de incrustacion la pone el servidor, no el cliente' {
    $el = (Invoke-Api POST $path @{
        type = 'text'; transformMatrix = $box; properties = @{ text = 'x' }
        interaction = @{ kind = 'popup'; text = 'x'
            content = @(@{ type = 'embed'; sourceUrl = $VIDEO; provider = 'inventado'
                           embedUrl = 'https://malo.example/incrustar' }) }
    } -Token $token).element
    if ($el.interaction.content[0].embedUrl -like '*malo.example*') {
        throw 'Se colo una direccion elegida por el cliente'
    }
}

Test-Step 'Un proveedor fuera de la lista se rechaza' {
    Assert-Status { Invoke-Api POST $path @{
        type = 'text'; transformMatrix = $box; properties = @{ text = 'x' }
        interaction = @{ kind = 'popup'; text = 'x'
            content = @(@{ type = 'embed'; sourceUrl = 'https://malo.example/video/1' }) }
    } -Token $token } 400
}

Test-Step 'Un dominio que solo se parece a YouTube tampoco cuela' {
    Assert-Status { Invoke-Api POST $path @{
        type = 'text'; transformMatrix = $box; properties = @{ text = 'x' }
        interaction = @{ kind = 'popup'; text = 'x'
            content = @(@{ type = 'embed'; sourceUrl = 'https://youtube.com.malo.net/watch?v=dQw4w9WgXcQ' }) }
    } -Token $token } 400
}

Test-Step 'El globo no admite videos' {
    Assert-Status { Invoke-Api POST $path @{
        type = 'text'; transformMatrix = $box; properties = @{ text = 'x' }
        interaction = @{ kind = 'tooltip'; text = 'x'
            content = @(@{ type = 'embed'; sourceUrl = $VIDEO }) }
    } -Token $token } 400
}

Test-Step 'Otros proveedores de la lista tambien valen' {
    foreach ($enlace in @('https://vimeo.com/123456789',
                          'https://docs.google.com/presentation/d/abcdefghij123/edit',
                          'https://archive.org/details/librodeprueba')) {
        $el = (Invoke-Api POST $path @{
            type = 'text'; transformMatrix = $box; properties = @{ text = 'x' }
            interaction = @{ kind = 'popup'; text = 'x'
                content = @(@{ type = 'embed'; sourceUrl = $enlace }) }
        } -Token $token).element
        if (-not $el.interaction.content[0].embedUrl) { throw "No resolvio $enlace" }
    }
}

# --- Que la copia de una pagina se lo lleve todo ---

Test-Step 'Duplicar la pagina copia globos y animaciones' {
    $marcado = (Invoke-Api POST $path @{
        type = 'text'; transformMatrix = $box; properties = @{ text = 'Se copia' }
        interaction = @{ kind = 'popup'; title = 'Ficha del roble'; text = 'Hasta 40 metros' }
        animation = @{ trigger = 'hover'; effect = 'bounce'; duration = 0.6; delay = 0 }
    } -Token $token).element

    $copia = (Invoke-Api POST "/books/$($book.id)/pages/$pageId/duplicate" -Token $token).page
    $gemelo = $copia.elements | Where-Object { $_.properties.text -eq 'Se copia' }
    if (-not $gemelo) { throw "El elemento no viajo a la copia" }
    if ($gemelo.interaction.title -ne 'Ficha del roble') { throw "La copia perdio la ventana" }
    if ($gemelo.animation.effect -ne 'bounce') { throw "La copia perdio la animacion" }
    if ($gemelo.id -eq $marcado.id) { throw "No es una copia, es el mismo elemento" }
}

# --- Que el reparto a la clase se lo lleve todo ---
#
# Este es el camino por el que mas se pierde contenido sin que nadie se entere:
# el docente prepara una ficha con sus globos, la reparte, y cada alumno recibe
# una copia muda. La copia se hace con un INSERT ... SELECT aparte del de
# duplicar pagina, asi que hay que comprobar los dos.

Test-Step 'El material repartido a la clase conserva globos y animaciones' {
    $clase = (Invoke-Api POST '/libraries' @{ name = "Clase interactiva $suffix" } -Token $token).library
    $alumno = Invoke-Api POST '/auth/students' @{ fullName = "Alumna Prueba $suffix"; libraryId = $clase.id } -Token $token

    $ficha = (Invoke-Api POST '/books' @{ title = "Ficha interactiva $suffix"; libraryId = $clase.id } -Token $token).book
    $fichaPagina = ((Invoke-Api GET "/books/$($ficha.id)" -Token $token).book).pages[0].id
    $null = Invoke-Api POST "/books/$($ficha.id)/pages/$fichaPagina/elements" @{
        type = 'text'; transformMatrix = $box; properties = @{ text = 'El ciclo del agua' }
        interaction = @{
            kind = 'popup'; title = 'Evaporacion'; text = 'El sol calienta el agua'
            content = @(
                @{ type = 'paragraph'; spans = @(@{ text = 'El sol '; }, @{ text = 'calienta'; bold = $true }) },
                @{ type = 'image'; url = 'https://ejemplo.org/agua.png'; alt = 'Ciclo'; caption = 'El ciclo' }
            )
        }
        animation = @{ trigger = 'entrance'; effect = 'zoom'; duration = 1; delay = 0 }
    } -Token $token

    $entrega = Invoke-Api POST "/libraries/$($clase.id)/distribute" @{ sourceBookId = $ficha.id } -Token $token
    if ($entrega.delivered -lt 1) { throw "No se entrego a nadie" }

    $sesion = Invoke-Api POST '/auth/login/qr' @{ token = $alumno.qrToken }
    $suyo = (Invoke-Api GET '/books?scope=all' -Token $sesion.token).books |
        Where-Object { $_.originBookId -eq $ficha.id } | Select-Object -First 1
    if (-not $suyo) { throw "La alumna no recibio el libro" }

    $copia = (Invoke-Api GET "/books/$($suyo.id)" -Token $sesion.token).book
    $recibido = $copia.pages[0].elements | Where-Object { $_.properties.text -eq 'El ciclo del agua' }
    if (-not $recibido) { throw "El elemento no llego a la copia" }
    if ($recibido.interaction.title -ne 'Evaporacion') { throw "La copia llego sin la ventana" }
    if ($recibido.animation.effect -ne 'zoom') { throw "La copia llego sin la animacion" }
    if (@($recibido.interaction.content).Count -ne 2) { throw 'La copia llego sin el contenido con formato' }
    if ($recibido.interaction.content[0].spans[1].bold -ne $true) { throw 'La copia perdio la negrita' }
}

Write-Host "`n== Resultado: $pass OK / $fail FAIL ==" -ForegroundColor $(if ($fail -eq 0) { 'Green' } else { 'Red' })
if ($fail -gt 0) { exit 1 }

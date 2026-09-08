# Ensayo funcional: el profesorado manda sobre el alumnado de sus bibliotecas.
#
# Lo que de verdad se vigila aqui son los LIMITES. Cambiar la contrasena de otra
# persona es de las cosas mas fuertes que hace la plataforma, y abrirlo al
# profesorado solo vale la pena si el alcance esta bien cerrado: su alumnado, y
# nadie mas. Un docente que pueda cambiarle la clave a otro docente puede entrar
# en su cuenta.
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

function Sql($sentencia) {
    npm run --silent sql --workspace @bookstudio/api -- $sentencia | Out-Null
}

function Puede-Entrar {
    param([string]$Correo, [string]$Clave)
    try { $null = Invoke-Api POST '/auth/login' @{ email = $Correo; password = $Clave }; return $true }
    catch { return $false }
}

Write-Host "`n== Claves y dominio del docente: ensayo funcional ==" -ForegroundColor Cyan

$sufijo = [guid]::NewGuid().ToString('N').Substring(0, 6)

$doc = Invoke-Api POST '/auth/register' @{ email = "cd.$sufijo@test.local"; password = 'Secreto12345'; fullName = 'Docente Titular'; role = 'teacher' }
$otro = Invoke-Api POST '/auth/register' @{ email = "cd2.$sufijo@test.local"; password = 'Secreto12345'; fullName = 'Docente Ajeno'; role = 'teacher' }

$clase = (Invoke-Api POST '/libraries' @{ name = "Clase de claves $sufijo" } -Token $doc.token).library
$otraClase = (Invoke-Api POST '/libraries' @{ name = "Clase ajena $sufijo" } -Token $otro.token).library

# Alumnado propio (por QR: nace sin contrasena) y ajeno
$ana = Invoke-Api POST '/auth/students' @{ fullName = "Ana Alumna $sufijo"; libraryId = $clase.id } -Token $doc.token
$beto = Invoke-Api POST '/auth/students' @{ fullName = "Beto Alumno $sufijo"; libraryId = $clase.id } -Token $doc.token
$ajeno = Invoke-Api POST '/auth/students' @{ fullName = "Carla Ajena $sufijo"; libraryId = $otraClase.id } -Token $otro.token

# --- Una a una ---

Write-Host "`n-- Cambiar la contrasena de un alumno --" -ForegroundColor Cyan

Test-Step 'El docente cambia la contrasena de su alumna' {
    $null = Invoke-Api POST "/users/$($ana.user.id)/password" @{ password = 'ClaveNueva123' } -Token $doc.token
    if (-not (Puede-Entrar $ana.user.email 'ClaveNueva123')) { throw 'La alumna no puede entrar con la clave nueva' }
}

Test-Step 'La clave anterior deja de servir' {
    if (Puede-Entrar $ana.user.email 'Secreto12345') { throw 'La clave vieja sigue valiendo' }
}

Test-Step 'Pero NO la de una alumna de otro docente' {
    Assert-Status { Invoke-Api POST "/users/$($ajeno.user.id)/password" @{ password = 'Intrusa12345' } -Token $doc.token } 403
}

Test-Step 'Ni la de otro docente, aunque compartan centro' {
    Assert-Status { Invoke-Api POST "/users/$($otro.user.id)/password" @{ password = 'Intrusa12345' } -Token $doc.token } 403
}

Test-Step 'Ni la suya propia por esta via' {
    Assert-Status { Invoke-Api POST "/users/$($doc.user.id)/password" @{ password = 'Intrusa12345' } -Token $doc.token } 400
}

Test-Step 'Una clave corta se rechaza' {
    Assert-Status { Invoke-Api POST "/users/$($ana.user.id)/password" @{ password = 'corta' } -Token $doc.token } 400
}

Test-Step 'El alumnado no puede cambiar la clave de nadie' {
    $sesion = Invoke-Api POST '/auth/login' @{ email = $ana.user.email; password = 'ClaveNueva123' }
    Assert-Status { Invoke-Api POST "/users/$($beto.user.id)/password" @{ password = 'Travesura123' } -Token $sesion.token } 403
}

# --- Renombrar ---

Write-Host "`n-- Corregir el nombre --" -ForegroundColor Cyan

Test-Step 'El docente corrige el nombre de su alumna' {
    $u = (Invoke-Api PATCH "/users/$($ana.user.id)" @{ fullName = "Ana Maria Alumna $sufijo" } -Token $doc.token).user
    if ($u.fullName -ne "Ana Maria Alumna $sufijo") { throw "Nombre: $($u.fullName)" }
}

Test-Step 'Pero no puede cambiarle el rol' {
    Assert-Status { Invoke-Api PATCH "/users/$($ana.user.id)" @{ role = 'teacher' } -Token $doc.token } 403
}

Test-Step 'Ni darla de baja' {
    Assert-Status { Invoke-Api PATCH "/users/$($ana.user.id)" @{ isActive = $false } -Token $doc.token } 403
}

Test-Step 'Ni tocar a alumnado ajeno' {
    Assert-Status { Invoke-Api PATCH "/users/$($ajeno.user.id)" @{ fullName = 'Robada' } -Token $doc.token } 403
}

# --- Masivo ---

Write-Host "`n-- Toda la clase de golpe --" -ForegroundColor Cyan

Test-Step 'El docente pone la misma clave a toda su clase' {
    $r = (Invoke-Api POST "/libraries/$($clase.id)/students/password" @{ password = 'ClaseEntera123' } -Token $doc.token).result
    if ($r.changed -ne 2) { throw "Cambiadas: $($r.changed), esperaba 2" }
    foreach ($alumno in @($ana, $beto)) {
        if (-not (Puede-Entrar $alumno.user.email 'ClaseEntera123')) { throw "$($alumno.user.email) no entra" }
    }
}

Test-Step 'Y no toca al alumnado de otra biblioteca' {
    # A la ajena nunca se le puso clave: sigue con su codigo de alta.
    if (Puede-Entrar $ajeno.user.email 'ClaseEntera123') { throw 'Alcanzo a una alumna ajena' }
}

Test-Step 'Un docente ajeno no puede hacerlo sobre esta clase' {
    Assert-Status { Invoke-Api POST "/libraries/$($clase.id)/students/password" @{ password = 'Intrusa12345' } -Token $otro.token } 403
}

Test-Step 'El alumnado tampoco' {
    $sesion = Invoke-Api POST '/auth/login' @{ email = $ana.user.email; password = 'ClaseEntera123' }
    Assert-Status { Invoke-Api POST "/libraries/$($clase.id)/students/password" @{ password = 'Travesura123' } -Token $sesion.token } 403
}

Test-Step 'Una clave corta se rechaza tambien en masa' {
    Assert-Status { Invoke-Api POST "/libraries/$($clase.id)/students/password" @{ password = 'corta' } -Token $doc.token } 400
}

Test-Step 'Una biblioteca sin alumnado avisa en vez de decir que cambio cero' {
    $vacia = (Invoke-Api POST '/libraries' @{ name = "Clase vacia $sufijo" } -Token $doc.token).library
    Assert-Status { Invoke-Api POST "/libraries/$($vacia.id)/students/password" @{ password = 'ClaseEntera123' } -Token $doc.token } 400
}

Test-Step 'El cambio masivo NO alcanza a los docentes de la biblioteca' {
    Invoke-Api POST "/libraries/$($clase.id)/teachers" @{ email = $otro.user.email } -Token $doc.token | Out-Null
    $r = (Invoke-Api POST "/libraries/$($clase.id)/students/password" @{ password = 'OtraVez12345' } -Token $doc.token).result
    if ($r.changed -ne 2) { throw "Cambiadas: $($r.changed), esperaba solo las 2 alumnas" }
    if (-not (Puede-Entrar $otro.user.email 'Secreto12345')) { throw 'Le cambio la clave al otro docente' }
}

Test-Step 'El masivo alcanza a una clase mas grande que una pagina de la tabla' {
    # La tabla pagina de doce en doce. El servidor tiene que cambiar TODAS, no las
    # que se ven: con quince alumnos el aviso decia doce y cambiaba quince.
    $grande = (Invoke-Api POST '/libraries' @{ name = "Clase grande $sufijo" } -Token $doc.token).library
    for ($i = 1; $i -le 15; $i++) {
        Invoke-Api POST '/auth/students' @{ fullName = "Alumno $i de quince $sufijo"; libraryId = $grande.id } -Token $doc.token | Out-Null
    }
    $r = (Invoke-Api POST "/libraries/$($grande.id)/students/password" @{ password = 'ClaseGrande789' } -Token $doc.token).result
    if ($r.changed -ne 15) { throw "Cambiadas: $($r.changed), esperaba 15" }
}

# --- El curso ---

Write-Host "`n-- El curso en las listas --" -ForegroundColor Cyan

Test-Step 'Los miembros de la biblioteca traen el campo del curso' {
    $m = Invoke-Api GET "/libraries/$($clase.id)/members" -Token $doc.token
    $alumna = $m.students | Where-Object { $_.id -eq $ana.user.id }
    if (-not $alumna) { throw 'No aparece la alumna' }
    if (-not ($alumna.PSObject.Properties.Name -contains 'course')) { throw 'Falta el campo course' }
}

Test-Step 'Sin rol de administracion no se puede listar usuarios' {
    Assert-Status { Invoke-Api GET '/users' -Token $doc.token } 403
}

# Se simula lo que deja la importacion de Phidias: external_group con el "name"
# de la seccion ("K2D"), que es el campo que se pidio mostrar.
$conCurso = Invoke-Api POST '/auth/students' @{ fullName = "Dani Con Curso $sufijo"; libraryId = $clase.id } -Token $doc.token
Sql "UPDATE users SET external_group='K2D' WHERE id='$($conCurso.user.id)'"

Invoke-Api POST '/auth/register' @{ email = "cdadm.$sufijo@test.local"; password = 'Secreto12345'; fullName = 'Admin Claves'; role = 'teacher' } | Out-Null
Sql "UPDATE users SET role='admin' WHERE email='cdadm.$sufijo@test.local'"
$tokenAdmin = (Invoke-Api POST '/auth/login' @{ email = "cdadm.$sufijo@test.local"; password = 'Secreto12345' }).token

Test-Step 'El listado de la administracion trae el curso' {
    $u = (Invoke-Api GET "/users?search=Dani+Con+Curso+$sufijo" -Token $tokenAdmin).items | Select-Object -First 1
    if (-not $u) { throw 'No se encontro' }
    if ($u.course -ne 'K2D') { throw "Curso: $($u.course)" }
}

Test-Step 'Y se puede buscar por curso' {
    $r = Invoke-Api GET '/users?search=K2D' -Token $tokenAdmin
    if (-not ($r.items | Where-Object { $_.id -eq $conCurso.user.id })) { throw 'La busqueda por curso no lo encuentra' }
}

Test-Step 'La biblioteca ensena el curso de ese alumno' {
    $m = Invoke-Api GET "/libraries/$($clase.id)/members" -Token $doc.token
    $dani = $m.students | Where-Object { $_.id -eq $conCurso.user.id }
    if ($dani.course -ne 'K2D') { throw "Curso en la biblioteca: $($dani.course)" }
}

Test-Step 'Renombrar a un alumno no le borra el curso' {
    $u = (Invoke-Api PATCH "/users/$($conCurso.user.id)" @{ fullName = "Daniela Con Curso $sufijo" } -Token $doc.token).user
    if ($u.course -ne 'K2D') { throw "Se perdio el curso al renombrar: $($u.course)" }
}

Write-Host "`n== Resultado: $pass OK / $fail FAIL ==" -ForegroundColor $(if ($fail -eq 0) { 'Green' } else { 'Red' })
if ($fail -gt 0) { exit 1 }

# Ensayo funcional de la Etapa 1 contra la API en ejecucion.
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
        $args['Body'] = ($Body | ConvertTo-Json -Depth 6 -Compress)
        $args['ContentType'] = 'application/json'
    }
    Invoke-RestMethod @args
}

Write-Host "`n== Etapa 1: ensayo funcional ==" -ForegroundColor Cyan

Test-Step 'GET /health' { 
    $r = Invoke-Api GET '/health'
    if ($r.database -ne 'up') { throw 'BD no disponible' }
}

$suffix = [guid]::NewGuid().ToString('N').Substring(0, 6)
$teacherEmail = "profe.$suffix@test.local"

$teacher = Test-Step 'POST /auth/register (docente)' {
    Invoke-Api POST '/auth/register' @{ email = $teacherEmail; password = 'Secreto12345'; fullName = 'Carlos Prueba'; role = 'teacher' }
}
$tToken = $teacher.token

Test-Step 'POST /auth/register duplicado -> 409' {
    try { Invoke-Api POST '/auth/register' @{ email = $teacherEmail; password = 'Secreto12345'; fullName = 'Otro Nombre'; role = 'teacher' }; throw 'No rechazo el duplicado' }
    catch { if ($_.Exception.Response.StatusCode.value__ -ne 409) { throw "Esperaba 409, llego $($_.Exception.Response.StatusCode.value__)" } }
}

Test-Step 'POST /auth/register password corta -> 400' {
    try { Invoke-Api POST '/auth/register' @{ email = "x.$suffix@test.local"; password = '123'; fullName = 'Nombre Valido' }; throw 'No valido' }
    catch { if ($_.Exception.Response.StatusCode.value__ -ne 400) { throw "Esperaba 400" } }
}

Test-Step 'POST /auth/login' {
    $r = Invoke-Api POST '/auth/login' @{ email = $teacherEmail; password = 'Secreto12345' }
    if (-not $r.token) { throw 'Sin token' }
}

Test-Step 'POST /auth/login clave incorrecta -> 401' {
    try { Invoke-Api POST '/auth/login' @{ email = $teacherEmail; password = 'malaclave' }; throw 'No rechazo' }
    catch { if ($_.Exception.Response.StatusCode.value__ -ne 401) { throw "Esperaba 401" } }
}

Test-Step 'GET /auth/me sin token -> 401' {
    try { Invoke-Api GET '/auth/me'; throw 'No rechazo' }
    catch { if ($_.Exception.Response.StatusCode.value__ -ne 401) { throw "Esperaba 401" } }
}

Test-Step 'GET /auth/me con token' {
    $r = Invoke-Api GET '/auth/me' -Token $tToken
    if ($r.user.email -ne $teacherEmail) { throw 'Usuario incorrecto' }
}

$lib = Test-Step 'POST /libraries (codigo de 5 chars)' {
    $r = Invoke-Api POST '/libraries' @{ name = "Clase $suffix" } -Token $tToken
    if ($r.library.codeInvite.Length -ne 5) { throw "Codigo invalido: $($r.library.codeInvite)" }
    if ($r.library.codeInvite -cne $r.library.codeInvite.ToUpper()) { throw 'Codigo no esta en mayusculas' }
    if ($r.library.studentBookLimit -ne 40) { throw 'Limite por defecto incorrecto' }
    $r.library
}

Test-Step 'GET /libraries' {
    $r = Invoke-Api GET '/libraries' -Token $tToken
    if (-not ($r.libraries.id -contains $lib.id)) { throw 'Biblioteca no listada' }
}

Test-Step 'PATCH /libraries/:id' {
    $r = Invoke-Api PATCH "/libraries/$($lib.id)" @{ studentPublishable = $true; studentBookLimit = 10 } -Token $tToken
    if (-not $r.library.studentPublishable) { throw 'No se actualizo' }
    if ($r.library.studentBookLimit -ne 10) { throw 'Limite no actualizado' }
}

$student = Test-Step 'POST /auth/students (alumno + QR)' {
    $r = Invoke-Api POST '/auth/students' @{ fullName = 'Nino Prueba'; libraryId = $lib.id } -Token $tToken
    if (-not $r.qrToken) { throw 'Sin token QR' }
    if ($r.qrDataUrl -notlike 'data:image/png;base64,*') { throw 'QR no es PNG data URL' }
    $r
}

$sToken = Test-Step 'POST /auth/login/qr' {
    $r = Invoke-Api POST '/auth/login/qr' @{ token = $student.qrToken }
    if ($r.user.id -ne $student.user.id) { throw 'Alumno incorrecto' }
    if ($r.user.role -ne 'student') { throw 'Rol incorrecto' }
    $r.token
}

Test-Step 'Alumno NO puede crear biblioteca -> 403' {
    try { Invoke-Api POST '/libraries' @{ name = 'Hackeo' } -Token $sToken; throw 'No rechazo' }
    catch { if ($_.Exception.Response.StatusCode.value__ -ne 403) { throw "Esperaba 403" } }
}

Test-Step 'Alumno NO puede ver class-view -> 403' {
    try { Invoke-Api GET "/libraries/$($lib.id)/class-view" -Token $sToken; throw 'No rechazo' }
    catch { if ($_.Exception.Response.StatusCode.value__ -ne 403) { throw "Esperaba 403" } }
}

Test-Step 'GET /libraries/:id/class-view (docente)' {
    $r = Invoke-Api GET "/libraries/$($lib.id)/class-view?page=1&pageSize=10" -Token $tToken
    if ($r.total -lt 1) { throw 'Sin alumnos en la vista' }
    if ($r.items[0].studentName -ne 'Nino Prueba') { throw 'Alumno no aparece' }
    if ($null -eq $r.items[0].bookCount) { throw 'Falta bookCount' }
}

Test-Step 'GET /libraries/:id/members' {
    $r = Invoke-Api GET "/libraries/$($lib.id)/members" -Token $tToken
    if ($r.owner.email -ne $teacherEmail) { throw 'Owner incorrecto' }
    if ($r.students.Count -ne 1) { throw 'Estudiantes incorrectos' }
}

$co = Test-Step 'Registro de co-docente' {
    Invoke-Api POST '/auth/register' @{ email = "co.$suffix@test.local"; password = 'Secreto12345'; fullName = 'Co Docente'; role = 'teacher' }
}

Test-Step 'POST /libraries/:id/teachers (co-docente)' {
    Invoke-Api POST "/libraries/$($lib.id)/teachers" @{ email = "co.$suffix@test.local" } -Token $tToken
    $r = Invoke-Api GET "/libraries/$($lib.id)/members" -Token $tToken
    if ($r.teachers.Count -ne 1) { throw 'Co-docente no agregado' }
}

Test-Step 'Co-docente accede a class-view' {
    $r = Invoke-Api GET "/libraries/$($lib.id)/class-view" -Token $co.token
    if ($null -eq $r.total) { throw 'Sin acceso' }
}

Test-Step 'Co-docente NO puede borrar biblioteca -> 403' {
    try { Invoke-Api DELETE "/libraries/$($lib.id)" -Token $co.token; throw 'No rechazo' }
    catch { if ($_.Exception.Response.StatusCode.value__ -ne 403) { throw "Esperaba 403" } }
}

Test-Step 'POST /libraries/join con codigo valido' {
    $other = Invoke-Api POST '/auth/register' @{ email = "otro.$suffix@test.local"; password = 'Secreto12345'; fullName = 'Otro Profe'; role = 'teacher' }
    $r = Invoke-Api POST '/libraries/join' @{ codeInvite = $lib.codeInvite } -Token $other.token
    if ($r.library.id -ne $lib.id) { throw 'Biblioteca incorrecta' }
}

Test-Step 'POST /libraries/join codigo inexistente -> 404' {
    try { Invoke-Api POST '/libraries/join' @{ codeInvite = 'ZZZZZ' } -Token $tToken; throw 'No rechazo' }
    catch { if ($_.Exception.Response.StatusCode.value__ -ne 404) { throw "Esperaba 404" } }
}

Test-Step 'GET /libraries/:id con UUID malformado -> 400' {
    try { Invoke-Api GET '/libraries/no-es-uuid' -Token $tToken; throw 'No rechazo' }
    catch { if ($_.Exception.Response.StatusCode.value__ -ne 400) { throw "Esperaba 400" } }
}

Test-Step 'Ruta inexistente -> 404' {
    try { Invoke-Api GET '/no-existe' -Token $tToken; throw 'No rechazo' }
    catch { if ($_.Exception.Response.StatusCode.value__ -ne 404) { throw "Esperaba 404" } }
}

Test-Step 'DELETE /libraries/:id (owner)' {
    Invoke-Api DELETE "/libraries/$($lib.id)" -Token $tToken
    try { Invoke-Api GET "/libraries/$($lib.id)" -Token $tToken; throw 'Sigue existiendo' }
    catch { if ($_.Exception.Response.StatusCode.value__ -ne 404) { throw "Esperaba 404" } }
}

Write-Host "`n== Resultado: $pass OK / $fail FAIL ==" -ForegroundColor $(if ($fail -eq 0) { 'Green' } else { 'Red' })
if ($fail -gt 0) { exit 1 }

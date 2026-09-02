# Cuestionarios de examen: redactar, enviar, responder, corregir y ver resultados.
$ErrorActionPreference = 'Stop'
$base = 'http://localhost:4000/api'
$ok = 0; $fail = 0

function Check($nombre, $condicion, $detalle = '') {
  if ($condicion) { $script:ok++; Write-Host "  OK   $nombre" -ForegroundColor Green }
  else { $script:fail++; Write-Host "  FAIL $nombre -> $detalle" -ForegroundColor Red }
}

function Api($metodo, $ruta, $cuerpo, $token) {
  $h = @{}
  if ($token) { $h['Authorization'] = "Bearer $token" }
  $p = @{ Uri = "$base$ruta"; Method = $metodo; Headers = $h; ContentType = 'application/json' }
  if ($null -ne $cuerpo) { $p['Body'] = ($cuerpo | ConvertTo-Json -Depth 8 -Compress) }
  Invoke-RestMethod @p
}

function Codigo($metodo, $ruta, $cuerpo, $token) {
  try { Api $metodo $ruta $cuerpo $token | Out-Null; return 200 }
  catch { return $_.Exception.Response.StatusCode.value__ }
}

$sufijo = [guid]::NewGuid().ToString('N').Substring(0, 8)

Write-Host "`n== Preparacion ==" -ForegroundColor Cyan

$doc = Api POST '/auth/register' @{ email = "doc-$sufijo@test.local"; password = 'Prueba12345'; fullName = 'Docente Examen'; role = 'teacher' } $null
$tokenDoc = $doc.token
$clase = Api POST '/libraries' @{ name = "Clase examen $sufijo" } $tokenDoc
$claseId = $clase.library.id

$a1 = Api POST '/auth/students' @{ fullName = "Ana $sufijo"; libraryId = $claseId } $tokenDoc
$a2 = Api POST '/auth/students' @{ fullName = "Beto $sufijo"; libraryId = $claseId } $tokenDoc
$tokenAna = (Api POST '/auth/login/qr' @{ token = $a1.qrToken } $null).token
$tokenBeto = (Api POST '/auth/login/qr' @{ token = $a2.qrToken } $null).token
Check 'docente, clase y dos alumnos listos' ($null -ne $tokenAna -and $null -ne $tokenBeto)

# Alguien de fuera, para comprobar que no alcanza nada.
$fuera = Api POST '/auth/register' @{ email = "fuera-$sufijo@test.local"; password = 'Prueba12345'; fullName = 'Ajeno'; role = 'teacher' } $null
$tokenFuera = $fuera.token

Write-Host "`n== 1. Crear el cuestionario ==" -ForegroundColor Cyan

$quiz = Api POST '/quizzes' @{ libraryId = $claseId; title = "Examen de ciencias $sufijo"; description = 'Primer parcial' } $tokenDoc
$quizId = $quiz.quiz.id
Check 'se crea el cuestionario' ($null -ne $quizId)
Check 'nace como borrador' ($quiz.quiz.status -eq 'borrador') "$($quiz.quiz.status)"
Check 'un ajeno no puede crearlo en esta clase' ((Codigo POST '/quizzes' @{ libraryId = $claseId; title = 'Intruso' } $tokenFuera) -in @(403, 404))
Check 'un alumno tampoco' ((Codigo POST '/quizzes' @{ libraryId = $claseId; title = 'Intruso' } $tokenAna) -in @(403, 404))

Write-Host "`n== 2. Redactar preguntas de tipos diversos ==" -ForegroundColor Cyan

$preguntas = @(
  @{ kind = 'single'; prompt = 'Cual es el planeta mas cercano al Sol?'; points = 2
     options = @(@{ id = 'a'; text = 'Mercurio'; correct = $true }, @{ id = 'b'; text = 'Venus' }, @{ id = 'c'; text = 'Marte' }) },
  @{ kind = 'multiple'; prompt = 'Cuales son gases nobles?'; points = 2
     options = @(@{ id = 'a'; text = 'Helio'; correct = $true }, @{ id = 'b'; text = 'Oxigeno' }, @{ id = 'c'; text = 'Neon'; correct = $true }) },
  @{ kind = 'order'; prompt = 'Ordena de menor a mayor masa'; points = 1
     options = @(@{ id = 'p1'; text = 'Electron' }, @{ id = 'p2'; text = 'Proton' }, @{ id = 'p3'; text = 'Atomo de helio' }) },
  @{ kind = 'open'; prompt = 'Explica con tus palabras que es la fotosintesis'; points = 5; expectedAnswer = 'Luz a energia quimica'; options = @() }
)

$guardadas = Api PUT "/quizzes/$quizId/questions" @{ questions = $preguntas } $tokenDoc
Check 'guarda las cuatro preguntas' (@($guardadas.questions).Count -eq 4) "$(@($guardadas.questions).Count)"
Check 'conserva el orden' ($guardadas.questions[0].kind -eq 'single' -and $guardadas.questions[3].kind -eq 'open')
Check 'la abierta va sin opciones' (@($guardadas.questions[3].options).Count -eq 0)
Check 'guarda los puntos de cada una' ($guardadas.questions[3].points -eq 5) "$($guardadas.questions[3].points)"

$ids = $guardadas.questions | ForEach-Object { $_.id }

Write-Host "`n== 3. Validacion de las preguntas ==" -ForegroundColor Cyan

$mala = @{ questions = @(@{ kind = 'single'; prompt = 'Sin opciones'; options = @() }) }
Check 'rechaza una de opciones sin opciones' ((Codigo PUT "/quizzes/$quizId/questions" $mala $tokenDoc) -eq 400)

$dosCorrectas = @{ questions = @(@{ kind = 'single'; prompt = 'Dos correctas'
  options = @(@{ id = 'a'; text = 'A'; correct = $true }, @{ id = 'b'; text = 'B'; correct = $true }) }) }
Check 'rechaza respuesta unica con dos correctas' ((Codigo PUT "/quizzes/$quizId/questions" $dosCorrectas $tokenDoc) -eq 400)

$sinCorrecta = @{ questions = @(@{ kind = 'multiple'; prompt = 'Ninguna correcta'
  options = @(@{ id = 'a'; text = 'A' }, @{ id = 'b'; text = 'B' }) }) }
Check 'rechaza multiple sin ninguna correcta' ((Codigo PUT "/quizzes/$quizId/questions" $sinCorrecta $tokenDoc) -eq 400)

# Las malas no deben haber tocado lo ya guardado.
$sigue = Api GET "/quizzes/$quizId" $null $tokenDoc
Check 'las preguntas validas siguen intactas' (@($sigue.quiz.questions).Count -eq 4) "$(@($sigue.quiz.questions).Count)"

Write-Host "`n== 4. El borrador no existe para el alumnado ==" -ForegroundColor Cyan

Check 'un alumno no ve el borrador' ((Codigo GET "/quizzes/$quizId" $null $tokenAna) -eq 404)
$listaAntes = Api GET "/quizzes?libraryId=$claseId" $null $tokenAna
Check 'ni le aparece en su lista' (@($listaAntes.quizzes).Count -eq 0) "$(@($listaAntes.quizzes).Count)"

Write-Host "`n== 5. Enviarlo a la clase ==" -ForegroundColor Cyan

$envio = Api POST "/quizzes/$quizId/assign" @{ studentIds = @() } $tokenDoc
Check 'se envia a los dos alumnos' ($envio.assigned -eq 2) "$($envio.assigned)"

$trasEnvio = Api GET "/quizzes/$quizId" $null $tokenDoc
Check 'pasa a enviado' ($trasEnvio.quiz.status -eq 'enviado') "$($trasEnvio.quiz.status)"

$vistaAna = Api GET "/quizzes/$quizId" $null $tokenAna
Check 'ahora el alumno si lo ve' (@($vistaAna.quiz.questions).Count -eq 4)
$conSolucion = $vistaAna.quiz.questions | Where-Object { $_.options | Where-Object { $null -ne $_.correct } }
Check 'las soluciones no viajan al alumno' (@($conSolucion).Count -eq 0) "$(@($conSolucion).Count)"
$conEsperada = $vistaAna.quiz.questions | Where-Object { $_.expectedAnswer }
Check 'ni lo que se espera en la abierta' (@($conEsperada).Count -eq 0)

Write-Host "`n== 6. Responder ==" -ForegroundColor Cyan

# Ana lo acierta todo lo automatico.
$respAna = @{ submit = $true; answers = @(
  @{ questionId = $ids[0]; answer = @('a') },
  @{ questionId = $ids[1]; answer = @('a', 'c') },
  @{ questionId = $ids[2]; answer = @('p1', 'p2', 'p3') },
  @{ questionId = $ids[3]; answer = @('La planta usa la luz del sol para fabricar su alimento.') }
) }
$entregaAna = Api POST "/quizzes/$quizId/answers" $respAna $tokenAna
Check 'Ana entrega' ($entregaAna.submitted -eq $true)
Check 'suma los 5 puntos automaticos' ($entregaAna.autoScore -eq 5) "$($entregaAna.autoScore)"
Check 'deja la abierta a la espera' ($entregaAna.pendingReview -eq 1) "$($entregaAna.pendingReview)"
Check 'el examen vale 10 puntos' ($entregaAna.totalPoints -eq 10) "$($entregaAna.totalPoints)"

# Beto falla la multiple por marcar de menos y se equivoca en el orden.
$respBeto = @{ submit = $true; answers = @(
  @{ questionId = $ids[0]; answer = @('a') },
  @{ questionId = $ids[1]; answer = @('a') },
  @{ questionId = $ids[2]; answer = @('p3', 'p2', 'p1') },
  @{ questionId = $ids[3]; answer = @('No me acuerdo.') }
) }
$entregaBeto = Api POST "/quizzes/$quizId/answers" $respBeto $tokenBeto
Check 'acertar de menos en la multiple no puntua' ($entregaBeto.autoScore -eq 2) "$($entregaBeto.autoScore)"

Check 'no se puede entregar dos veces' ((Codigo POST "/quizzes/$quizId/answers" $respAna $tokenAna) -eq 400)

Write-Host "`n== 7. Lo que ve el alumno tras entregar ==" -ForegroundColor Cyan

$trasEntregaAna = Api GET "/quizzes/$quizId" $null $tokenAna
Check 'consta la entrega' ($null -ne $trasEntregaAna.quiz.mySubmittedAt)
$suyas = $trasEntregaAna.quiz.myAnswers
Check 'recupera sus cuatro respuestas' (@($suyas).Count -eq 4) "$(@($suyas).Count)"
$abierta = $suyas | Where-Object { $_.questionId -eq $ids[3] }
Check 'la abierta aun no tiene nota' ($null -eq $abierta.score)

Write-Host "`n== 8. Panel de resultados ==" -ForegroundColor Cyan

$res = Api GET "/quizzes/$quizId/results" $null $tokenDoc
Check 'lista a los dos alumnos' (@($res.rows).Count -eq 2) "$(@($res.rows).Count)"
$filaAna = $res.rows | Where-Object { $_.studentName -like "Ana*" }
Check 'Ana lleva 5 de 10' ($filaAna.score -eq 5) "$($filaAna.score)"
Check 'y una pendiente de leer' ($filaAna.pendingReview -eq 1) "$($filaAna.pendingReview)"
Check 'consta cuando entrego' ($null -ne $filaAna.submittedAt)

$porPregunta = $res.perQuestion | Where-Object { $_.questionId -eq $ids[1] }
Check 'la multiple la acerto solo uno' ($porPregunta.correct -eq 1 -and $porPregunta.answered -eq 2) "$($porPregunta.correct)/$($porPregunta.answered)"
Check 'un alumno no puede abrir los resultados' ((Codigo GET "/quizzes/$quizId/results" $null $tokenAna) -eq 403)

Write-Host "`n== 9. Corregir la pregunta abierta ==" -ForegroundColor Cyan

$idAna = $filaAna.studentId
$revisada = Api PATCH "/quizzes/$quizId/answers/$($ids[3])/$idAna" @{ score = 4; teacherNote = 'Bien, falto nombrar el dioxido de carbono.' } $tokenDoc
Check 'se puntua a mano' ($revisada.answer.score -eq 4) "$($revisada.answer.score)"
Check 'guarda el comentario' ($revisada.answer.teacherNote -like '*dioxido*') "[$($revisada.answer.teacherNote)]"
Check 'queda marcada como revisada' ($null -ne $revisada.answer.reviewedAt)
Check 'no deja dar mas puntos de los que vale' ((Codigo PATCH "/quizzes/$quizId/answers/$($ids[3])/$idAna" @{ score = 99 } $tokenDoc) -eq 400)

$resFinal = Api GET "/quizzes/$quizId/results" $null $tokenDoc
$anaFinal = $resFinal.rows | Where-Object { $_.studentId -eq $idAna }
Check 'la nota total sube a 9' ($anaFinal.score -eq 9) "$($anaFinal.score)"
Check 'ya no queda nada por revisar de Ana' ($anaFinal.pendingReview -eq 0) "$($anaFinal.pendingReview)"

$verAna = Api GET "/quizzes/$quizId" $null $tokenAna
$abiertaFinal = $verAna.quiz.myAnswers | Where-Object { $_.questionId -eq $ids[3] }
Check 'el alumno ve su nota de la abierta' ($abiertaFinal.score -eq 4) "$($abiertaFinal.score)"

Write-Host "`n== 10. No se cambian preguntas con entregas hechas ==" -ForegroundColor Cyan

Check 'bloquea reescribir el examen ya entregado' ((Codigo PUT "/quizzes/$quizId/questions" @{ questions = $preguntas } $tokenDoc) -eq 400)

Write-Host "`n== 11. Cerrar ==" -ForegroundColor Cyan

$cerrado = Api PATCH "/quizzes/$quizId" @{ status = 'cerrado' } $tokenDoc
Check 'se cierra' ($cerrado.quiz.status -eq 'cerrado')
Check 'cerrado ya no admite respuestas' ((Codigo POST "/quizzes/$quizId/answers" $respBeto $tokenBeto) -eq 400)

Write-Host "`n== 12. Un examen vacio no se envia ==" -ForegroundColor Cyan

$vacio = Api POST '/quizzes' @{ libraryId = $claseId; title = "Vacio $sufijo" } $tokenDoc
Check 'no se envia sin preguntas' ((Codigo POST "/quizzes/$($vacio.quiz.id)/assign" @{ studentIds = @() } $tokenDoc) -eq 400)
Check 'ni se marca como enviado a mano' ((Codigo PATCH "/quizzes/$($vacio.quiz.id)" @{ status = 'enviado' } $tokenDoc) -eq 400)

Write-Host "`n== 13. Limpieza ==" -ForegroundColor Cyan

Api DELETE "/quizzes/$quizId" $null $tokenDoc | Out-Null
Api DELETE "/quizzes/$($vacio.quiz.id)" $null $tokenDoc | Out-Null
Check 'el cuestionario borrado ya no esta' ((Codigo GET "/quizzes/$quizId" $null $tokenDoc) -eq 404)

Write-Host "`n$ok correctas, $fail fallidas" -ForegroundColor $(if ($fail -eq 0) { 'Green' } else { 'Red' })
exit $(if ($fail -eq 0) { 0 } else { 1 })


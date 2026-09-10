# Ilustraciones educativas: de dónde salen los dibujos

**Resumen corto: BookStudio no incorpora ninguna biblioteca de ilustraciones de
terceros. Todos los personajes, objetos y fondos del motor están dibujados dentro
del propio proyecto, en `apps/web/src/utils/ilustracion/dibujo.ts`.**

Esto no exime de nada, así que aquí queda escrito qué se evaluó, qué se decidió y
por qué, y qué habría que revisar si algún día se cambia de idea.

## Lo que se evaluó

Se estudiaron las tres bibliotecas que se suelen citar para este tipo de motor.
Las condiciones que se indican abajo son las que declaran sus autores en sus
sitios públicos; **si alguna vez se decide usar una, hay que volver a leerlas en
la fuente antes de incorporarla**, porque las licencias cambian y esta nota
envejece.

| Biblioteca  | Autoría | Licencia declarada | Uso comercial | Modificación | Redistribución |
|-------------|---------|--------------------|---------------|--------------|----------------|
| Open Peeps  | Pablo Stanley | CC0 (dominio público) | Sí | Sí | Sí |
| Humaaans    | Pablo Stanley | Libre con atribución | Sí | Sí | Con condiciones |
| unDraw      | Katerina Limpitsouni | Licencia propia | Sí, sin atribución | Sí | **No** como colección ni en un producto que compita con unDraw |

En lo legal, Open Peeps es la más cómoda de las tres: al ser CC0 no obliga ni a
citar. No es ahí donde estaba el problema.

## Por qué no se usan

La razón es técnica, y se ve mejor con un ejemplo. La escena más pedida de todas
es *"estudiantes trabajando con tablets"*. Para dibujarla bien hace falta saber
**dónde están las manos** de cada figura, porque es ahí donde va la tablet.

Esas bibliotecas entregan cada personaje como una ilustración cerrada y ya
compuesta. Son mucho más bonitas que lo que puedo dibujar yo, pero no traen
metadatos de anclaje: no dicen dónde está la mano, ni permiten cambiar el ángulo
de un brazo. Con ellas, un objeto solo se puede colocar *cerca* de la figura, y el
resultado son pegatinas flotando una al lado de otra.

El motor de BookStudio construye cada personaje a partir de un esqueleto: cadera,
hombros, cabeza y unas manos que la pose coloca donde toca. El codo se calcula
resolviendo el triángulo brazo-antebrazo. Eso da tres cosas que las piezas
cerradas no pueden dar:

1. **El objeto queda en las manos**, porque la pose sabe dónde han quedado.
2. **Las poses son de verdad**: señalar, sentarse o leer cambian el cuerpo, no
   son tres dibujos distintos.
3. **Cada parte está identificada**, que es lo que hará falta el día que se quiera
   que un brazo se levante solo o que aparezca un globo al pasar el ratón.

Y de paso desaparece el problema de licencias: no hay obra ajena que redistribuir.

## Qué se distribuye realmente

Nada. No hay archivos SVG de terceros en el repositorio, ni descargados en tiempo
de compilación, ni traídos de una CDN al abrir el editor. El dibujo son funciones
de TypeScript que devuelven rectángulos, círculos y trazos.

Tampoco se guarda ningún SVG en la base de datos: se guarda la escena (qué
aparece) y el dibujo se recompone cada vez.

## Si algún día se incorpora una biblioteca externa

Hay un sitio preparado para hacerlo sin tocar el resto: el catálogo
(`apps/web/src/utils/ilustracion/catalogo.ts`) declara qué se puede pedir, y el
dibujo decide cómo se pinta. Se podría añadir un proveedor alternativo de piezas
sin cambiar ni las escenas ya guardadas ni la API.

Antes de hacerlo, comprobar y anotar aquí:

- La licencia **en la fuente original**, con la fecha de consulta.
- Si exige atribución, dónde se va a mostrar (los libros exportados también salen
  de la plataforma, no solo la pantalla del editor).
- Si permite redistribuir las piezas dentro de un producto de pago, que es lo que
  es BookStudio para el colegio.
- Si permite modificarlas, que es imprescindible para colorearlas por tema.

<script setup lang="ts">
/**
 * Recomendaciones antes de pagar con tarjeta.
 *
 * Las pasarelas de pago en Colombia pasan cada cobro por controles de
 * autenticidad de la persona y del medio de pago. Las compras como invitado, o con
 * datos que no coinciden exactamente con los de la tarjeta, se rechazan mas a
 * menudo, y quien paga no sabe por que. Decirlo ANTES de empezar ahorra el
 * rechazo, el reintento y la llamada preguntando que ha pasado.
 *
 * Vive en un solo componente porque se muestra en todos los sitios donde se paga
 * (contratar un plan y pagar una cuenta de cobro): el texto tiene que ser el mismo.
 */
defineProps<{
  /** Tras un pago rechazado se muestra resumido, orientado al siguiente intento. */
  trasRechazo?: boolean;
}>();

const CREAR_CUENTA = 'https://www.mercadopago.com.co/';
</script>

<template>
  <aside
    class="rounded-lg border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900"
    :aria-label="trasRechazo ? 'Cómo mejorar la aprobación del pago' : 'Recomendaciones antes de pagar'"
  >
    <p class="font-bold">
      {{ trasRechazo
        ? 'Para mejorar la probabilidad de aprobación en el próximo intento'
        : 'Antes de pagar: recomendaciones para que tu pago se apruebe' }}
    </p>

    <p v-if="!trasRechazo" class="mt-1 text-sky-800">
      Son <strong>políticas de las pasarelas de pago en Colombia</strong>: cada transacción pasa controles
      de autenticidad del usuario y de los medios de pago autorizados por los bancos colombianos. Para
      mejorar el proceso de pago, validar tu identidad y aumentar la seguridad de la transacción, te
      recomendamos:
    </p>

    <ul class="mt-2 list-disc space-y-1.5 pl-5 text-sky-900">
      <li>
        <strong>Crea una cuenta de Mercado Pago</strong> y asocia a ella los medios de pago que quieras usar
        (tarjetas de crédito o débito). Así se puede validar y asegurar la transacción.
      </li>
      <li>
        <strong>Completa los datos exactamente como figuran en tu tarjeta</strong>: nombre del titular,
        número de documento y fecha de vencimiento.
      </li>
      <li>
        <strong>De ser posible, paga estando conectado a tu cuenta de Mercado Pago</strong> en este
        navegador: las compras como invitado suelen pasar por controles más estrictos.
      </li>
    </ul>

    <a
      :href="CREAR_CUENTA"
      target="_blank"
      rel="noopener noreferrer"
      class="mt-3 inline-block font-semibold text-sky-700 underline hover:text-sky-900"
    >Crear o abrir mi cuenta de Mercado Pago ↗</a>
  </aside>
</template>

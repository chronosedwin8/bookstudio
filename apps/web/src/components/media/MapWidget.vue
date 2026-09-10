<script setup lang="ts">
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';

const props = defineProps<{
  latitude: number;
  longitude: number;
  zoom: number;
  showMarker: boolean;
  /** Cuando es false el mapa queda fijo, como una ilustracion sobre el lienzo. */
  interactive: boolean;
}>();

const emit = defineEmits<{ moved: [payload: { latitude: number; longitude: number; zoom: number }] }>();

const host = ref<HTMLElement | null>(null);
let map: L.Map | undefined;
let marker: L.Marker | undefined;

// Leaflet resuelve los iconos por URL relativa al CSS; con un bundler hay que darlos explicitos.
const pinIcon = L.divIcon({
  className: '',
  html: '<div style="width:18px;height:18px;border-radius:50%;background:#E11D48;border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4)"></div>',
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});

/*
 * De donde salen las teselas.
 *
 * OpenStreetMap pide en su politica de uso que no se tire de sus servidores como
 * si fueran un servicio gratuito para aplicaciones, y cuando les llega demasiado
 * de una misma red devuelven baldosas de "Access blocked" en vez del mapa. Por eso
 * el primero de la lista es CARTO, que si esta pensado para esto, y OpenStreetMap
 * queda de reserva. Ambos dibujan los mismos datos: la cartografia es de
 * OpenStreetMap en los dos casos, y asi se acredita.
 */
const FUENTES = [
  {
    url: 'https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png',
    maxZoom: 20,
    atribucion:
      '&copy; colaboradores de <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
  },
  {
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    maxZoom: 19,
    atribucion: '&copy; colaboradores de <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  },
];

let capa: L.TileLayer | undefined;

/**
 * Pone las teselas de una fuente y, si fallan, pasa a la siguiente.
 *
 * Se cuentan los fallos en lugar de saltar al primero: una baldosa suelta puede
 * fallar por la red del centro sin que el proveedor este caido, y no seria motivo
 * para cambiar de mapa a mitad.
 */
function ponerTeselas(indice: number): void {
  if (!map || !FUENTES[indice]) return;
  const fuente = FUENTES[indice];
  let fallos = 0;

  capa?.remove();
  capa = L.tileLayer(fuente.url, { maxZoom: fuente.maxZoom, attribution: fuente.atribucion });

  capa.on('tileerror', () => {
    fallos += 1;
    if (fallos === 3 && FUENTES[indice + 1]) ponerTeselas(indice + 1);
  });

  capa.addTo(map);
}

onMounted(() => {
  if (!host.value) return;

  map = L.map(host.value, {
    center: [props.latitude, props.longitude],
    zoom: props.zoom,
    zoomControl: props.interactive,
    dragging: props.interactive,
    scrollWheelZoom: false,
    doubleClickZoom: props.interactive,
    touchZoom: props.interactive,
    keyboard: props.interactive,
    attributionControl: true,
  });

  ponerTeselas(0);

  if (props.showMarker) marker = L.marker([props.latitude, props.longitude], { icon: pinIcon }).addTo(map);

  if (props.interactive) {
    map.on('moveend', () => {
      if (!map) return;
      const center = map.getCenter();
      emit('moved', { latitude: center.lat, longitude: center.lng, zoom: map.getZoom() });
    });
  }

  // El contenedor nace dentro de un elemento escalado; Leaflet necesita recalcular su tamano.
  setTimeout(() => map?.invalidateSize(), 60);
});

watch(
  () => [props.latitude, props.longitude, props.zoom] as const,
  ([lat, lng, zoom]) => {
    map?.setView([lat, lng], zoom);
    marker?.setLatLng([lat, lng]);
  },
);

onBeforeUnmount(() => {
  capa?.remove();
  capa = undefined;
  map?.remove();
  map = undefined;
});
</script>

<template>
  <div ref="host" class="h-full w-full bg-slate-100" />
</template>

<style>
/* Los controles de Leaflet deben quedar bajo los handles del editor. */
.leaflet-container {
  z-index: 0;
  font-family: inherit;
}
.leaflet-control-attribution {
  font-size: 9px;
}
</style>

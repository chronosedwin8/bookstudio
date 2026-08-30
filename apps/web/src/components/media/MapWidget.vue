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

  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; colaboradores de <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(map);

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

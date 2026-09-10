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
 * OpenStreetMap, que es lo unico que sirve mapas sin pedir una clave. Se probo
 * CARTO como principal porque su servicio esta pensado para aplicaciones, pero
 * devuelve las baldosas con "API KEY REQUIRED" estampado encima: cargan con
 * codigo 200, asi que ninguna comprobacion automatica lo nota, y el mapa sale
 * ilegible. Queda escrito aqui para que nadie lo vuelva a intentar sin contratar
 * la clave.
 *
 * La lista sigue siendo una lista a proposito: el dia que se contrate un
 * proveedor con clave, se pone delante y el relevo ya esta hecho.
 */
const FUENTES = [
  {
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    maxZoom: 19,
    atribucion: '&copy; colaboradores de <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  },
];

let capa: L.TileLayer | undefined;

/** Ningun proveedor responde: se avisa en vez de dejar el hueco vacio. */
const sinMapa = ref(false);

/** Margen antes de dar por perdido un mapa: una baldosa suelta puede reintentarse. */
const ESPERA_ANTES_DE_RENDIRSE_MS = 1500;

/**
 * Pone las teselas de una fuente y, si no carga ninguna, pasa a la siguiente.
 *
 * Lo que decide no es cuantas fallan sino que NO cargue ninguna. Contar fallos
 * no vale: un mapa pequeno pide dos o tres baldosas, asi que con un umbral de
 * tres se quedaba gris para siempre sin llegar a avisar nunca. Y una baldosa
 * suelta que falle mientras las demas cargan no es motivo de nada, por eso basta
 * con que una sola llegue bien para dar el mapa por bueno.
 */
function ponerTeselas(indice: number): void {
  if (!map || !FUENTES[indice]) return;
  const fuente = FUENTES[indice];

  let cargoAlguna = false;
  let cuentaAtras: ReturnType<typeof setTimeout> | undefined;

  capa?.remove();
  capa = L.tileLayer(fuente.url, { maxZoom: fuente.maxZoom, attribution: fuente.atribucion });

  capa.on('tileload', () => {
    cargoAlguna = true;
    clearTimeout(cuentaAtras);
    sinMapa.value = false;
  });

  capa.on('tileerror', () => {
    if (cargoAlguna || cuentaAtras) return;
    cuentaAtras = setTimeout(() => {
      if (cargoAlguna) return;
      // Agotados los proveedores, mejor decirlo que dejar un cuadro gris que
      // parece que la pagina esta rota.
      if (FUENTES[indice + 1]) ponerTeselas(indice + 1);
      else sinMapa.value = true;
    }, ESPERA_ANTES_DE_RENDIRSE_MS);
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
  <div class="relative h-full w-full">
    <div ref="host" class="h-full w-full bg-slate-100" />
    <p
      v-if="sinMapa"
      class="absolute inset-0 grid place-items-center bg-slate-100 p-3 text-center text-xs text-slate-500"
    >No se pudo cargar el mapa. Revisa la conexión.</p>
  </div>
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

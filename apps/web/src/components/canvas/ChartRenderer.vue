<script setup lang="ts">
import { computed } from 'vue';
import type { ChartSeries, ChartType } from '@/types/api';

/**
 * Grafica en SVG puro: sin librerias de terceros, escala con el elemento y se
 * exporta igual de bien a HTML o a PDF que cualquier otra forma del lienzo.
 *
 * Se dibuja en un viewBox fijo de 400x260 y el navegador lo escala; asi el codigo
 * trabaja siempre con las mismas coordenadas.
 */
const props = defineProps<{
  chartType: ChartType;
  title: string;
  series: ChartSeries[];
  showValues: boolean;
  showLegend: boolean;
  accentColor: string;
}>();

const W = 400;
const H = 260;
const PAD = { top: 30, right: 14, bottom: 34, left: 40 };

/** Paleta por defecto cuando el dato no trae color propio. */
const PALETTE = ['#2563EB', '#F59E0B', '#16A34A', '#DB2777', '#7C3AED', '#0891B2', '#EA580C', '#65A30D'];

const data = computed(() =>
  props.series.map((item, index) => ({
    label: item.label || `Dato ${index + 1}`,
    value: Number.isFinite(item.value) ? item.value : 0,
    color: item.color || PALETTE[index % PALETTE.length],
  })),
);

const plot = computed(() => ({
  x: PAD.left,
  y: PAD.top,
  width: W - PAD.left - PAD.right,
  height: H - PAD.top - PAD.bottom,
}));

const maxValue = computed(() => Math.max(1, ...data.value.map((d) => Math.abs(d.value))));
const total = computed(() => data.value.reduce((sum, d) => sum + Math.max(0, d.value), 0));

const isRadial = computed(() => props.chartType === 'pie' || props.chartType === 'doughnut');
const isHorizontal = computed(() => props.chartType === 'bar');
const isLinear = computed(() => props.chartType === 'line' || props.chartType === 'area');

/** Cuatro lineas de referencia horizontales. */
const gridLines = computed(() =>
  [0, 0.25, 0.5, 0.75, 1].map((fraction) => ({
    y: plot.value.y + plot.value.height * (1 - fraction),
    label: Math.round(maxValue.value * fraction),
  })),
);

/** Barras verticales (column) u horizontales (bar). */
const bars = computed(() => {
  const { x, y, width, height } = plot.value;
  const count = data.value.length;

  return data.value.map((item, index) => {
    const ratio = Math.abs(item.value) / maxValue.value;
    if (isHorizontal.value) {
      const slot = height / count;
      const barHeight = slot * 0.68;
      return {
        ...item,
        x,
        y: y + slot * index + (slot - barHeight) / 2,
        width: Math.max(1, width * ratio),
        height: barHeight,
      };
    }
    const slot = width / count;
    const barWidth = slot * 0.62;
    const barHeight = Math.max(1, height * ratio);
    return {
      ...item,
      x: x + slot * index + (slot - barWidth) / 2,
      y: y + height - barHeight,
      width: barWidth,
      height: barHeight,
    };
  });
});

/** Puntos de la linea, repartidos por el ancho util. */
const points = computed(() => {
  const { x, y, width, height } = plot.value;
  const count = data.value.length;
  const step = count > 1 ? width / (count - 1) : 0;
  return data.value.map((item, index) => ({
    ...item,
    cx: count > 1 ? x + step * index : x + width / 2,
    cy: y + height - (Math.abs(item.value) / maxValue.value) * height,
  }));
});

const linePath = computed(() => points.value.map((p, i) => `${i ? 'L' : 'M'}${p.cx} ${p.cy}`).join(' '));

const areaPath = computed(() => {
  if (!points.value.length) return '';
  const bottom = plot.value.y + plot.value.height;
  const first = points.value[0];
  const last = points.value[points.value.length - 1];
  return `${linePath.value} L${last.cx} ${bottom} L${first.cx} ${bottom} Z`;
});

/** Sectores del pastel, empezando arriba y en sentido horario. */
const slices = computed(() => {
  const cx = W / 2;
  const cy = PAD.top + plot.value.height / 2;
  const radius = Math.min(plot.value.height, W - 120) / 2;
  const inner = props.chartType === 'doughnut' ? radius * 0.55 : 0;

  let angle = -Math.PI / 2;
  return data.value.map((item) => {
    const portion = total.value > 0 ? Math.max(0, item.value) / total.value : 1 / data.value.length;
    const sweep = portion * Math.PI * 2;
    const end = angle + sweep;
    const large = sweep > Math.PI ? 1 : 0;

    const point = (a: number, r: number) => `${cx + r * Math.cos(a)} ${cy + r * Math.sin(a)}`;
    // Un sector completo no se puede dibujar con un solo arco: se usa un circulo.
    const path =
      portion >= 0.999
        ? `M${cx - radius} ${cy} a${radius} ${radius} 0 1 0 ${radius * 2} 0 a${radius} ${radius} 0 1 0 ${-radius * 2} 0`
        : inner > 0
          ? `M${point(angle, radius)} A${radius} ${radius} 0 ${large} 1 ${point(end, radius)} ` +
            `L${point(end, inner)} A${inner} ${inner} 0 ${large} 0 ${point(angle, inner)} Z`
          : `M${cx} ${cy} L${point(angle, radius)} A${radius} ${radius} 0 ${large} 1 ${point(end, radius)} Z`;

    const mid = angle + sweep / 2;
    angle = end;
    return {
      ...item,
      path,
      percent: Math.round(portion * 100),
      labelX: cx + radius * 0.68 * Math.cos(mid),
      labelY: cy + radius * 0.68 * Math.sin(mid),
    };
  });
});

const formatValue = (value: number) => (Number.isInteger(value) ? String(value) : value.toFixed(1));
</script>

<template>
  <div class="chart-box h-full w-full overflow-hidden rounded-lg bg-white p-1 ring-1 ring-slate-200">
    <svg :viewBox="`0 0 ${W} ${H}`" class="h-full w-full" preserveAspectRatio="xMidYMid meet" role="img">
      <title>{{ title || 'Gráfica' }}</title>

      <text v-if="title" :x="W / 2" y="18" text-anchor="middle" class="chart-title" :fill="accentColor">
        {{ title }}
      </text>

      <!-- Ejes y rejilla (no aplican al pastel) -->
      <template v-if="!isRadial">
        <g v-for="line in gridLines" :key="line.y">
          <line :x1="plot.x" :y1="line.y" :x2="plot.x + plot.width" :y2="line.y" stroke="#E2E8F0" stroke-width="1" />
          <text v-if="!isHorizontal" :x="plot.x - 5" :y="line.y + 3" text-anchor="end" class="chart-axis">
            {{ line.label }}
          </text>
        </g>
      </template>

      <!-- Barras -->
      <template v-if="!isRadial && !isLinear">
        <g v-for="(bar, index) in bars" :key="index">
          <rect :x="bar.x" :y="bar.y" :width="bar.width" :height="bar.height" :fill="bar.color" rx="2" />
          <text
            v-if="showValues"
            :x="isHorizontal ? bar.x + bar.width + 4 : bar.x + bar.width / 2"
            :y="isHorizontal ? bar.y + bar.height / 2 + 3 : bar.y - 4"
            :text-anchor="isHorizontal ? 'start' : 'middle'"
            class="chart-value"
          >{{ formatValue(bar.value) }}</text>
          <text
            :x="isHorizontal ? plot.x - 5 : bar.x + bar.width / 2"
            :y="isHorizontal ? bar.y + bar.height / 2 + 3 : H - 16"
            :text-anchor="isHorizontal ? 'end' : 'middle'"
            class="chart-axis"
          >{{ bar.label }}</text>
        </g>
      </template>

      <!-- Línea y área -->
      <template v-if="isLinear">
        <path v-if="chartType === 'area'" :d="areaPath" :fill="accentColor" fill-opacity="0.18" />
        <path :d="linePath" fill="none" :stroke="accentColor" stroke-width="2.5" stroke-linejoin="round" />
        <g v-for="(point, index) in points" :key="index">
          <circle :cx="point.cx" :cy="point.cy" r="3.5" :fill="point.color" stroke="#FFFFFF" stroke-width="1.5" />
          <text v-if="showValues" :x="point.cx" :y="point.cy - 8" text-anchor="middle" class="chart-value">
            {{ formatValue(point.value) }}
          </text>
          <text :x="point.cx" :y="H - 16" text-anchor="middle" class="chart-axis">{{ point.label }}</text>
        </g>
      </template>

      <!-- Pastel y rosquilla -->
      <template v-if="isRadial">
        <g v-for="(slice, index) in slices" :key="index">
          <path :d="slice.path" :fill="slice.color" stroke="#FFFFFF" stroke-width="1.5" />
          <text
            v-if="showValues && slice.percent >= 6"
            :x="slice.labelX"
            :y="slice.labelY"
            text-anchor="middle"
            class="chart-value-inverse"
          >{{ slice.percent }}%</text>
        </g>
      </template>

      <!-- Leyenda -->
      <g v-if="showLegend && isRadial">
        <g v-for="(slice, index) in slices" :key="`leg-${index}`">
          <rect :x="W - 96" :y="PAD.top + index * 15" width="9" height="9" :fill="slice.color" rx="2" />
          <text :x="W - 83" :y="PAD.top + index * 15 + 8" class="chart-axis">{{ slice.label }}</text>
        </g>
      </g>
    </svg>
  </div>
</template>

<style scoped>
/* Tamanos en unidades del viewBox: escalan con la grafica sin recalcular nada. */
.chart-title {
  font-size: 15px;
  font-weight: 700;
}

.chart-axis {
  font-size: 9px;
  fill: #64748b;
}

.chart-value {
  font-size: 10px;
  font-weight: 700;
  fill: #334155;
}

.chart-value-inverse {
  font-size: 11px;
  font-weight: 700;
  fill: #ffffff;
}
</style>

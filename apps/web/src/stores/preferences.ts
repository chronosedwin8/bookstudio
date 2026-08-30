import { defineStore } from 'pinia';
import { ref, watch } from 'vue';
import { FONT_FAMILIES, type FontFamily } from '@/types/api';

export { FONT_FAMILIES, type FontFamily };

export const BRUSH_STYLES = ['pen', 'paintbrush', 'crayon', 'highlighter'] as const;
export type BrushStyle = (typeof BRUSH_STYLES)[number];

const STORAGE_KEY = 'bookstudio.preferences';

interface StoredPreferences {
  fontFamily: FontFamily;
  fontSize: number;
  textColor: string;
  textBackground: string;
  brushStyle: BrushStyle;
  strokeColor: string;
  strokeWidth: number;
}

const DEFAULTS: StoredPreferences = {
  fontFamily: 'Lato',
  fontSize: 32,
  textColor: '#333333',
  textBackground: 'transparent',
  brushStyle: 'pen',
  strokeColor: '#333333',
  strokeWidth: 6,
};

function readStored(): StoredPreferences {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<StoredPreferences>;
    return {
      ...DEFAULTS,
      ...parsed,
      // Se revalidan los enum por si el almacenamiento quedo de una version anterior.
      fontFamily: FONT_FAMILIES.includes(parsed.fontFamily as FontFamily) ? parsed.fontFamily! : DEFAULTS.fontFamily,
      brushStyle: BRUSH_STYLES.includes(parsed.brushStyle as BrushStyle) ? parsed.brushStyle! : DEFAULTS.brushStyle,
      fontSize: Math.min(Math.max(parsed.fontSize ?? DEFAULTS.fontSize, 24), 200),
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export const usePreferencesStore = defineStore('preferences', () => {
  const stored = readStored();

  const fontFamily = ref<FontFamily>(stored.fontFamily);
  const fontSize = ref(stored.fontSize);
  const textColor = ref(stored.textColor);
  const textBackground = ref(stored.textBackground);
  const brushStyle = ref<BrushStyle>(stored.brushStyle);
  const strokeColor = ref(stored.strokeColor);
  const strokeWidth = ref(stored.strokeWidth);

  watch(
    [fontFamily, fontSize, textColor, textBackground, brushStyle, strokeColor, strokeWidth],
    () => {
      const snapshot: StoredPreferences = {
        fontFamily: fontFamily.value,
        fontSize: fontSize.value,
        textColor: textColor.value,
        textBackground: textBackground.value,
        brushStyle: brushStyle.value,
        strokeColor: strokeColor.value,
        strokeWidth: strokeWidth.value,
      };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
      } catch {
        // Modo privado o cuota llena: las preferencias siguen vivas en memoria.
      }
    },
    { deep: false },
  );

  return { fontFamily, fontSize, textColor, textBackground, brushStyle, strokeColor, strokeWidth };
});

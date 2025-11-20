
export enum AppMode {
  TTS = 'TTS',
  LIVE = 'LIVE',
}

export enum SALanguage {
  ENGLISH = 'English (South African)',
  ZULU = 'isiZulu',
  XHOSA = 'isiXhosa',
  AFRIKAANS = 'Afrikaans',
  SESOTHO = 'Sesotho',
  SETSWANA = 'Setswana',
}

export interface VoiceConfig {
  id: string;
  name: string;
  gender: 'Male' | 'Female';
  description: string;
}

export const GEMINI_VOICES: Record<string, VoiceConfig> = {
  'Kore': { id: 'Kore', name: 'Kore', gender: 'Female', description: 'Calm & soothing' },
  'Puck': { id: 'Puck', name: 'Puck', gender: 'Male', description: 'Energetic' },
  'Fenrir': { id: 'Fenrir', name: 'Fenrir', gender: 'Male', description: 'Deep & authoritative' },
  'Charon': { id: 'Charon', name: 'Charon', gender: 'Male', description: 'Steady & news-like' },
  'Zephyr': { id: 'Zephyr', name: 'Zephyr', gender: 'Female', description: 'Professional' },
};

// Default mapping
export const LANGUAGE_VOICE_MAP: Record<SALanguage, string> = {
  [SALanguage.ENGLISH]: 'Zephyr',
  [SALanguage.ZULU]: 'Kore',
  [SALanguage.XHOSA]: 'Puck',
  [SALanguage.AFRIKAANS]: 'Fenrir',
  [SALanguage.SESOTHO]: 'Charon',
  [SALanguage.SETSWANA]: 'Kore',
};

export interface OfflinePack {
  id: string;
  language: SALanguage;
  localeCode: string; // e.g., 'en-ZA', 'zu-ZA'
  size: string;
  downloaded: boolean;
}

export const INITIAL_OFFLINE_PACKS: OfflinePack[] = [
  { id: 'pack_en', language: SALanguage.ENGLISH, localeCode: 'en-ZA', size: '45 MB', downloaded: true },
  { id: 'pack_af', language: SALanguage.AFRIKAANS, localeCode: 'af-ZA', size: '38 MB', downloaded: false },
  { id: 'pack_zu', language: SALanguage.ZULU, localeCode: 'zu-ZA', size: '42 MB', downloaded: false },
  { id: 'pack_xh', language: SALanguage.XHOSA, localeCode: 'xh-ZA', size: '40 MB', downloaded: false },
  { id: 'pack_st', language: SALanguage.SESOTHO, localeCode: 'st-ZA', size: '35 MB', downloaded: false },
  { id: 'pack_tn', language: SALanguage.SETSWANA, localeCode: 'tn-ZA', size: '36 MB', downloaded: false },
];

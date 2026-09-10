import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import en from './en';
import es from './es';

/**
 * UI language for the public pages.
 *
 * ⚠️ This is the DASHBOARD/MARKETING locale and it is completely independent of
 * `wpm_bot_profiles.response_language`, which decides what language the AGENT
 * answers customers in. A business owner may well want an English dashboard and
 * a Spanish agent, or the reverse. Never infer one from the other, and never let
 * this switch write to the agent's language.
 *
 * Detection order is localStorage first so an explicit choice always wins over
 * the browser's guess. Only the base language is kept ("es-PR" -> "es"): the
 * copy is written in Puerto Rican Spanish, but a visitor whose browser reports
 * es-MX or es-ES should still get Spanish rather than falling back to English.
 */
i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: { en, es },
    fallbackLng: 'en',
    supportedLngs: ['en', 'es'],
    nonExplicitSupportedLngs: true,
    load: 'languageOnly',
    defaultNS: 'common',
    ns: ['common', 'landing', 'pricing', 'auth'],
    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: 'wpm_lang',
      caches: ['localStorage'],
    },
    interpolation: { escapeValue: false },
  });

export default i18n;

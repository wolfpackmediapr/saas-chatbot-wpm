import { useTranslation } from 'react-i18next';
import { Globe } from 'lucide-react';

/**
 * EN/ES switch for the public pages.
 *
 * Lives in the nav rather than in Settings on purpose: choosing a language is a
 * PRE-signup decision. Someone deciding whether this product is for them has
 * not got an account to change a preference in.
 *
 * The choice is persisted by i18next's LanguageDetector under `wpm_lang` in
 * localStorage, so it survives a reload and outranks the browser's guess.
 */
export default function LanguageSwitcher({ className = '' }: { className?: string }) {
  const { i18n, t } = useTranslation('common');
  const current = i18n.resolvedLanguage === 'es' ? 'es' : 'en';
  const next = current === 'es' ? 'en' : 'es';

  return (
    <button
      type="button"
      onClick={() => i18n.changeLanguage(next)}
      className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-secondary-foreground transition-colors hover:bg-secondary hover:text-foreground ${className}`}
      // Always name the language being switched TO, in that language, so it is
      // legible to someone who cannot read the current one.
      aria-label={next === 'es' ? 'Cambiar a español' : 'Switch to English'}
      title={next === 'es' ? 'Cambiar a español' : 'Switch to English'}
    >
      <Globe className="h-4 w-4" />
      <span className="text-sm font-medium">{next === 'es' ? 'ES' : 'EN'}</span>
      <span className="sr-only">{t('nav.language')}</span>
    </button>
  );
}

import type { Lang } from '../types';

interface LanguageSwitcherProps {
  lang: Lang;
  onChange: (lang: Lang) => void;
}

const LANGUAGES: { code: Lang; label: string }[] = [
  { code: 'zh', label: '中文' },
  { code: 'en', label: 'English' },
  { code: 'vi', label: 'Tiếng Việt' },
];

export function LanguageSwitcher({ lang, onChange }: LanguageSwitcherProps) {
  return (
    <div
      className="inline-flex items-center p-1 bg-slate-100 border border-slate-200 rounded-lg"
      role="group"
      aria-label="Language selector"
    >
      {LANGUAGES.map((item) => {
        const active = lang === item.code;
        return (
          <button
            key={item.code}
            type="button"
            onClick={() => onChange(item.code)}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-emerald-700 ${
              active
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { id } from './id';
import { en } from './en';

export type Lang = 'id' | 'en';
export type Key = string;

const dictionaries: Record<Lang, Record<string, string>> = { id, en: { ...id, ...en } };

export function translate(lang: Lang, key: Key | string, params?: Record<string, string | number>): string {
  const raw = dictionaries[lang][key] ?? dictionaries.id[key] ?? key;
  if (!params) return raw;
  return raw.replace(/\{(\w+)\}/g, (_, k: string) => String(params[k] ?? `{${k}}`));
}

interface I18nValue { lang: Lang; t: (key: Key, params?: Record<string, string | number>) => string; locale: string }
const Ctx = createContext<I18nValue>({ lang: 'id', t: (k, p) => translate('id', k, p), locale: 'id-ID' });

export function I18nProvider({ lang, children }: { lang: Lang; children: ReactNode }) {
  const value = useMemo<I18nValue>(() => ({
    lang, t: (k, p) => translate(lang, k, p), locale: lang === 'id' ? 'id-ID' : 'en-US',
  }), [lang]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useI18n = () => useContext(Ctx);

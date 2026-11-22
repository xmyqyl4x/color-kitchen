import { isLocale, locales, type Locale } from '../model/locales.js';

export type Translation = readonly [string, string, string, string, string];
export const clientLocale = (): Locale => {
  const language = document.documentElement.lang;
  return isLocale(language) ? language : 'en';
};
export const translate = (locale: Locale, strings: Translation) => strings[locales.indexOf(locale)]!;
export const get = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

export function node<K extends keyof HTMLElementTagNameMap>(tag: K, text?: string, className?: string): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = text;
  if (className) element.className = className;
  return element;
}

export function press(text: string, action: () => void | Promise<void>, primary = false) {
  const button = node('button', text, primary ? 'button primary' : 'button');
  button.type = 'button';
  button.addEventListener('click', () => { void action(); });
  return button;
}

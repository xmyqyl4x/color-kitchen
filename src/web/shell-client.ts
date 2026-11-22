const returnKey = 'ck-focus-return';

document.addEventListener('click', event => {
  if (!(event.target instanceof Element)) return;
  const link = event.target.closest<HTMLAnchorElement>('a[data-focus-key]');
  if (!link || event.button !== 0 || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
  const url = new URL(link.href);
  if (url.origin !== location.origin || url.pathname === location.pathname) return;
  try {
    sessionStorage.setItem(returnKey, JSON.stringify({ from: location.pathname, id: link.dataset.focusKey, to: url.pathname }));
  } catch { /* Follow the link with regular browser focus behavior. */ }
});

document.addEventListener('keydown', event => {
  if (event.key !== 'Escape' || !(event.target instanceof Element)) return;
  const details = event.target.closest<HTMLDetailsElement>('details[open]');
  if (!details) return;
  details.open = false;
  details.querySelector('summary')?.focus();
});

window.addEventListener('pageshow', event => {
  try {
    const raw = sessionStorage.getItem(returnKey);
    if (!raw) return;
    const state = JSON.parse(raw);
    if (state.from === location.pathname && typeof state.id === 'string') {
      const returning = [...document.querySelectorAll<HTMLElement>('[data-focus-key]')].find(node => node.dataset.focusKey === state.id);
      const parent = returning?.closest<HTMLDetailsElement>('details');
      if (parent) parent.open = true;
      returning?.focus({ preventScroll: true });
      sessionStorage.removeItem(returnKey);
    } else if (!event.persisted && state.to === location.pathname) {
      document.getElementById('main')?.focus({ preventScroll: true });
    }
  } catch { /* Navigation remains usable without session storage. */ }
});

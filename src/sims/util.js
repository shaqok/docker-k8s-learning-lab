export const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');

export const rid = (n) =>
  Array.from({ length: n }, () => 'abcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 36)]).join('');

export const hexid = (n) =>
  Array.from({ length: n }, () => '0123456789abcdef'[Math.floor(Math.random() * 16)]).join('');

export function pad(s, n) {
  s = String(s);
  return s.length >= n ? s + '  ' : s + ' '.repeat(n - s.length);
}

export function agoStr(born) {
  const s = Math.max(1, Math.round((Date.now() - born) / 1000));
  return s < 60 ? s + 's' : Math.round(s / 60) + 'm';
}

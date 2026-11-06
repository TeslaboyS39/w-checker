// ================== INTI: state bersama, preferensi, teks, format ==================
import { STRINGS } from './strings.js';

// ---- Preferensi (disimpan per browser) ----
export const PREF = { lang: 'wchecker.lang', theme: 'wchecker.theme', decimal: 'wchecker.decimalSeparator', lastLocation: 'wchecker.lastLocation' };
export const readPref = key => { try { return localStorage.getItem(key); } catch (e) { return null; } };
export const writePref = (key, value) => { try { localStorage.setItem(key, value); } catch (e) { /* abaikan */ } };

// ---- State bersama antar modul ----
// Disimpan sebagai properti objek karena binding hasil import tidak bisa di-assign ulang dari modul lain.
export const state = {
    lang: readPref(PREF.lang) === 'en' ? 'en' : 'id',
    decimalSep: readPref(PREF.decimal) === ',' ? ',' : '.',
    lastResult: null,  // data mentah hasil fetch terakhir; dipakai ulang untuk render tanpa fetch ulang
    isLoading: false
};

// ---- Bahasa ----
const LOCALES = { id: 'id-ID', en: 'en-GB' };
export const locale = () => LOCALES[state.lang];
export function t(key, params = {}) {
    const s = STRINGS[state.lang][key] ?? STRINGS.id[key] ?? key;
    return s.replace(/\{(\w+)\}/g, (_, k) => (params[k] ?? ''));
}

// ---- Tanggal ----
// Pakai tanggal LOKAL (bukan toISOString yang UTC -> salah hari sebelum jam 08:00 WITA).
const pad = n => String(n).padStart(2, '0');
export const toISODate = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export function addDays(isoDate, n) {
    const d = new Date(`${isoDate}T00:00:00`);
    d.setDate(d.getDate() + n);
    return toISODate(d);
}
export const fmtDateShort = iso => new Date(`${iso}T00:00:00`).toLocaleDateString(locale(), { day: '2-digit', month: 'short', year: 'numeric' });
export const fmtDateTime = d =>
    `${d.toLocaleDateString(locale(), { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })} ${d.toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit', hour12: false })}`;

// ---- Angka & HTML ----
// Semua angka yang tampil/tersalin lewat fmt() agar mengikuti pilihan pemisah desimal.
export const fmt = (v, digits) => {
    if (v === null || v === undefined || Number.isNaN(v)) return '-';
    const s = v.toFixed(digits);
    return state.decimalSep === ',' ? s.replace('.', ',') : s;
};
export const escapeHtml = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const $ = id => document.getElementById(id);

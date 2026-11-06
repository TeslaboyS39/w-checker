// ================== ENTRY POINT: preferensi UI, alur Cek Cuaca, wiring event ==================
// Dimuat sebagai <script type="module">, jadi baru jalan setelah HTML selesai di-parse.
import { state, PREF, readPref, writePref, t, fmtDateShort, $ } from './core.js';
import { getLimits, fetchAllRows, ARCHIVE_MIN_DATE, FORECAST_DAYS_AHEAD } from './api.js';
import { initMap, setMapLayer, updateMapStatus } from './map.js';
import {
    setLocation, readInputCoords, updateLocStatus, setupLocationInputs, closeSearchResults,
    typedButNotChosen, resolveTypedPlace, getSelectedPlaceName
} from './location.js';
import { displayWeather, updateDisplayedResults, hideMessages, showError, switchResultTab, copyTable } from './render.js';

const DEFAULT_LOCATION = { name: 'Makassar, Sulawesi Selatan, Indonesia', lat: -5.14861, lon: 119.43194 };

// ---- Bahasa ----
function applyLanguage() {
    document.documentElement.lang = state.lang;
    document.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
    document.querySelectorAll('[data-i18n-html]').forEach(el => { el.innerHTML = t(el.dataset.i18nHtml); });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => { el.placeholder = t(el.dataset.i18nPlaceholder); });
    document.querySelectorAll('[data-i18n-title]').forEach(el => { el.title = t(el.dataset.i18nTitle); });
    document.querySelectorAll('[data-i18n-aria]').forEach(el => { el.setAttribute('aria-label', t(el.dataset.i18nAria)); });
    document.querySelectorAll('.lang-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.lang === state.lang));

    $('rangeHint').textContent = t('range.hint', { date: fmtDateShort(getLimits().forecastMax) });
    $('submitLabel').textContent = t(state.isLoading ? 'btn.loading' : 'btn.check');
    $('copyLabel').textContent = t('copy.label');
    updateThemeButton();
    updateMapStatus();
    updateLocStatus();
    closeSearchResults();
    if (state.lastResult) displayWeather(state.lastResult);
}

function setLanguage(newLang) {
    if (newLang === state.lang) return;
    state.lang = newLang;
    writePref(PREF.lang, newLang);
    applyLanguage();
}

// ---- Tema ----
// Tema tersimpan sudah diterapkan oleh script kecil di <head> (hindari kedipan).
function currentTheme() {
    const attr = document.documentElement.getAttribute('data-theme');
    if (attr === 'light' || attr === 'dark') return attr;
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function toggleTheme() {
    const next = currentTheme() === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    writePref(PREF.theme, next);
    updateThemeButton();
}

const ICON_SUN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
const ICON_MOON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></svg>';

function updateThemeButton() {
    const dark = currentTheme() === 'dark';
    const btn = $('themeBtn');
    btn.innerHTML = dark ? ICON_SUN : ICON_MOON;
    const label = t(dark ? 'theme.toLight' : 'theme.toDark');
    btn.title = label;
    btn.setAttribute('aria-label', label);
}

// ---- Pemisah desimal ----
function setDecimalSeparator(sep) {
    state.decimalSep = sep;
    writePref(PREF.decimal, sep);
    if (state.lastResult) displayWeather(state.lastResult);
}

// ---- Cek Cuaca ----
function setLoading(loading) {
    state.isLoading = loading;
    $('submitBtn').disabled = loading;
    $('submitSpinner').hidden = !loading;
    $('submitLabel').textContent = t(loading ? 'btn.loading' : 'btn.check');
}

async function getWeather() {
    const dateFrom = $('dateFromInput').value;
    const timeFrom = $('timeFromInput').value;
    const dateTo = $('dateToInput').value;
    const timeTo = $('timeToInput').value;
    const limits = getLimits();

    try {
        // --- 1. Validasi ---
        if (!dateFrom || !timeFrom || !dateTo || !timeTo) throw new Error(t('err.incomplete'));
        const startDateTime = new Date(`${dateFrom}T${timeFrom}:00`);
        const endDateTime = new Date(`${dateTo}T${timeTo}:00`);
        if (startDateTime >= endDateTime) throw new Error(t('err.order'));
        if (dateTo > limits.forecastMax) {
            throw new Error(t('err.forecastMax', { date: fmtDateShort(limits.forecastMax), days: FORECAST_DAYS_AHEAD }));
        }
        if (dateFrom < ARCHIVE_MIN_DATE) throw new Error(t('err.archiveMin', { date: fmtDateShort(ARCHIVE_MIN_DATE) }));

        // --- 2. Koordinat ---
        const typed = typedButNotChosen();
        if (!typed && !readInputCoords()) {
            const hasAnyInput = $('latInput').value !== '' || $('lonInput').value !== '';
            throw new Error(t(hasAnyInput ? 'err.coordsInvalid' : 'err.locationMissing'));
        }

        setLoading(true);
        hideMessages();
        closeSearchResults();

        if (typed) await resolveTypedPlace(typed);

        const { lat, lon } = readInputCoords();
        const placeName = getSelectedPlaceName();

        // --- 3. Ambil data (otomatis archive / forecast / gabungan) ---
        const { rows, segments, backfilled } = await fetchAllRows(dateFrom, dateTo, lat, lon, limits);

        state.lastResult = { rows, segments, backfilled, startDateTime, endDateTime, placeName, lat, lon };
        writePref(PREF.lastLocation, JSON.stringify({ name: placeName, lat, lon }));
        displayWeather(state.lastResult);
    } catch (err) {
        showError(err.message);
    } finally {
        setLoading(false);
    }
}

// ---- Inisialisasi ----
function init() {
    const { today, forecastMax } = getLimits();
    $('dateFromInput').value = today;
    $('dateToInput').value = today;
    ['dateFromInput', 'dateToInput'].forEach(id => {
        $(id).setAttribute('min', ARCHIVE_MIN_DATE);
        $(id).setAttribute('max', forecastMax);
    });

    // Tombol-tombol (pengganti atribut onclick, karena fungsi di modul tidak global).
    document.querySelectorAll('.lang-btn').forEach(btn => btn.addEventListener('click', () => setLanguage(btn.dataset.lang)));
    $('themeBtn').addEventListener('click', toggleTheme);
    document.querySelectorAll('.map-layer-btn').forEach(btn => btn.addEventListener('click', () => setMapLayer(btn.dataset.layer)));
    document.querySelectorAll('.view-btn').forEach(btn => btn.addEventListener('click', () => switchResultTab(btn.dataset.view)));
    $('submitBtn').addEventListener('click', getWeather);
    $('copyBtn').addEventListener('click', copyTable);

    document.querySelectorAll('input[name="interval"]').forEach(radio => {
        radio.addEventListener('change', updateDisplayedResults);
    });

    $(state.decimalSep === ',' ? 'decimal-comma' : 'decimal-dot').checked = true;
    document.querySelectorAll('input[name="decimal"]').forEach(radio => {
        radio.addEventListener('change', () => setDecimalSeparator(radio.value));
    });

    setupLocationInputs();

    // Isi awal: lokasi terakhir yang dicek (kalau ada), selain itu Makassar.
    let initial = DEFAULT_LOCATION;
    try {
        const saved = JSON.parse(readPref(PREF.lastLocation) || 'null');
        if (saved && Number.isFinite(saved.lat) && Number.isFinite(saved.lon)) initial = saved;
    } catch (e) { /* abaikan data rusak */ }
    setLocation(initial.lat, initial.lon, initial.name ? initial : null);

    // Tema "ikuti perangkat" ikut berubah kalau setelan perangkat berubah.
    if (window.matchMedia) {
        const mq = window.matchMedia('(prefers-color-scheme: dark)');
        if (mq.addEventListener) mq.addEventListener('change', updateThemeButton);
    }

    applyLanguage();
    initMap({ getCoords: readInputCoords, pick: (lat, lon) => setLocation(lat, lon, null) });
}

init();

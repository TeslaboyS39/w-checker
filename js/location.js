// ================== LOKASI (satu sumber: koordinat) + CARI TEMPAT ==================
// Lokasi = koordinat di latInput/lonInput (satu-satunya sumber kebenaran).
// selectedPlace hanya label nama tempat, dan dihapus begitu titik digeser lewat peta/input manual.
import { state, t, escapeHtml, $ } from './core.js';
import { searchPlaces } from './api.js';
import { placeMarker, flyTo } from './map.js';

let selectedPlace = null; // { name, lat, lon, query? }

export const getSelectedPlaceName = () => (selectedPlace ? selectedPlace.name : null);

export function readInputCoords() {
    const lat = parseFloat($('latInput').value);
    const lon = parseFloat($('lonInput').value);
    const valid = !isNaN(lat) && !isNaN(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
    return valid ? { lat, lon } : null;
}

// Semua cara memilih lokasi (cari tempat, ketik koordinat, klik/geser peta) lewat sini.
export function setLocation(lat, lon, place, { fly = false } = {}) {
    lon = ((lon + 540) % 360) - 180; // normalisasi kalau peta digeser melewati garis 180°
    $('latInput').value = lat.toFixed(5);
    $('lonInput').value = lon.toFixed(5);
    selectedPlace = place ? { name: place.name, lat, lon } : null;
    // Nama di kotak cari hanya dipertahankan kalau memang titik itu yang dipilih dari pencarian.
    if (!place) $('placeSearch').value = '';
    placeMarker(lat, lon);
    if (fly) flyTo(lat, lon);
    updateLocStatus();
}

function onCoordsTyped() {
    const coords = readInputCoords();
    if (coords) setLocation(coords.lat, coords.lon, null, { fly: true });
    else updateLocStatus();
}

export function updateLocStatus() {
    const el = $('locStatus');
    if (!el) return;
    if (selectedPlace) el.innerHTML = t('loc.selectedPlace', { name: escapeHtml(selectedPlace.name) });
    else if (readInputCoords()) el.innerHTML = t('loc.selectedPoint');
    else el.textContent = t('loc.none');
}

// ---- Cari tempat (combobox dengan debounce) ----
const SEARCH_DEBOUNCE_MS = 350;
const SEARCH_MIN_CHARS = 2;
let searchTimer = null, searchSeq = 0, searchResults = [], activeResult = -1;

export function setupLocationInputs() {
    // Koordinat yang diketik manual ikut menggeser penanda di peta.
    ['latInput', 'lonInput'].forEach(id => $(id).addEventListener('change', onCoordsTyped));

    const input = $('placeSearch');
    input.addEventListener('input', () => {
        clearTimeout(searchTimer);
        const q = input.value.trim();
        if (q.length < SEARCH_MIN_CHARS) { closeSearchResults(); return; }
        searchTimer = setTimeout(() => runSearch(q), SEARCH_DEBOUNCE_MS);
    });
    input.addEventListener('keydown', e => {
        const open = !$('placeResults').hidden && searchResults.length > 0;
        if (e.key === 'ArrowDown' && open) { e.preventDefault(); highlightResult(Math.min(activeResult + 1, searchResults.length - 1)); }
        else if (e.key === 'ArrowUp' && open) { e.preventDefault(); highlightResult(Math.max(activeResult - 1, 0)); }
        else if (e.key === 'Enter') {
            e.preventDefault();
            if (open) chooseResult(activeResult >= 0 ? activeResult : 0);
            else if (input.value.trim().length >= SEARCH_MIN_CHARS) { clearTimeout(searchTimer); runSearch(input.value.trim(), true); }
        }
        else if (e.key === 'Escape') closeSearchResults();
    });
    input.addEventListener('blur', () => setTimeout(closeSearchResults, 150));
    // mousedown (bukan click) supaya terpilih sebelum input kehilangan fokus
    $('placeResults').addEventListener('mousedown', e => {
        const item = e.target.closest('[data-index]');
        if (!item) return;
        e.preventDefault();
        chooseResult(Number(item.dataset.index));
    });
}

async function runSearch(query, pickFirst = false) {
    const seq = ++searchSeq;
    let results;
    try {
        results = await searchPlaces(query, 6, state.lang);
    } catch (e) {
        if (seq === searchSeq) renderSearchMessage(t('loc.searchFailed'));
        return;
    }
    if (seq !== searchSeq) return; // sudah ada pencarian yang lebih baru
    searchResults = results;
    activeResult = -1;
    if (!results.length) { renderSearchMessage(t('loc.searchNoResult')); return; }
    if (pickFirst) { chooseResult(0); return; }
    const list = $('placeResults');
    list.innerHTML = results.map((r, i) => `
        <li class="search-item" role="option" id="place-opt-${i}" data-index="${i}" aria-selected="false">
            <span class="name">${escapeHtml(r.shortName)}</span>
            <span class="detail">${escapeHtml(r.region)} · ${r.lat.toFixed(4)}, ${r.lon.toFixed(4)}</span>
        </li>`).join('');
    list.hidden = false;
    $('placeSearch').setAttribute('aria-expanded', 'true');
}

function renderSearchMessage(message) {
    searchResults = [];
    activeResult = -1;
    const list = $('placeResults');
    list.innerHTML = `<li class="search-empty" role="presentation">${escapeHtml(message)}</li>`;
    list.hidden = false;
    $('placeSearch').setAttribute('aria-expanded', 'true');
}

function highlightResult(index) {
    activeResult = index;
    document.querySelectorAll('#placeResults .search-item').forEach((el, i) => {
        el.setAttribute('aria-selected', String(i === index));
        if (i === index) el.scrollIntoView({ block: 'nearest' });
    });
    $('placeSearch').setAttribute('aria-activedescendant', index >= 0 ? `place-opt-${index}` : '');
}

function chooseResult(index) {
    const r = searchResults[index];
    if (!r) return;
    closeSearchResults();
    setLocation(r.lat, r.lon, r, { fly: true });
    $('placeSearch').value = r.shortName;
    selectedPlace.query = r.shortName; // penanda: teks di kotak cari = tempat yang terpilih
}

export function closeSearchResults() {
    const list = $('placeResults');
    if (!list) return;
    list.hidden = true;
    list.innerHTML = '';
    activeResult = -1;
    $('placeSearch').setAttribute('aria-expanded', 'false');
    $('placeSearch').removeAttribute('aria-activedescendant');
}

// Kebiasaan lama: ketik nama tempat lalu langsung tekan Cek Cuaca tanpa memilih dari daftar.
// Mengembalikan teks itu (atau '' kalau tempat sudah dipilih / kotak cari kosong).
export function typedButNotChosen() {
    const typed = $('placeSearch').value.trim();
    return typed && !(selectedPlace && selectedPlace.query === typed) ? typed : '';
}

// Pakai hasil pencarian pertama untuk teks yang diketik tapi tidak dipilih.
export async function resolveTypedPlace(typed) {
    searchSeq++; // batalkan hasil autocomplete yang mungkin masih dalam perjalanan
    const [first] = await searchPlaces(typed, 1, state.lang);
    if (!first) throw new Error(t('err.cityNotFound', { q: typed }));
    searchResults = [first];
    chooseResult(0);
}

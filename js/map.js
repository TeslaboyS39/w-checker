// ================== PETA (MapLibre + OpenFreeMap, gratis tanpa API key) ==================
// Server tile resmi OpenStreetMap (relawan) bisa memblokir aplikasi/jaringan sewaktu-waktu,
// jadi peta dasar memakai OpenFreeMap: gratis, tanpa key, tanpa batas, boleh komersial.
// Tile-nya vektor, sehingga perlu MapLibre GL. MapLibre dimuat dinamis saat halaman dibuka,
// supaya aplikasi tetap jalan (cari tempat & input koordinat) walau CDN atau WebGL gagal.
// Modul ini tidak tahu soal state lokasi: titik yang dipilih dikirim lewat callback onPick.
import { t, $ } from './core.js';

const MAPLIBRE_BASE = 'https://cdnjs.cloudflare.com/ajax/libs/maplibre-gl/4.7.1/';
const MAP_DEFAULT_VIEW = { center: [118, -2.5], zoom: 4 }; // Indonesia, urutan [lon, lat]
const MAP_POINT_ZOOM = 10;
const MAP_STYLES = {
    street: 'https://tiles.openfreemap.org/styles/liberty',
    topo: {
        version: 8,
        sources: {
            topo: {
                type: 'raster',
                tiles: ['a', 'b', 'c'].map(s => `https://${s}.tile.opentopomap.org/{z}/{x}/{y}.png`),
                tileSize: 256,
                maxzoom: 17,
                attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors, SRTM | © <a href="https://opentopomap.org" target="_blank" rel="noopener">OpenTopoMap</a> (CC-BY-SA)'
            }
        },
        layers: [{ id: 'topo', type: 'raster', source: 'topo' }]
    }
};
const MARKER_COLOR = '#e5484d';
let map = null, mapMarker = null, currentMapLayer = 'street', mapTileError = false;
let mapState = 'idle'; // idle | loading | ready | failed
let mapLibPromise = null;
let onPick = () => {};

function loadMapLibrary() {
    if (window.maplibregl) return Promise.resolve();
    if (!mapLibPromise) {
        const load = (tag, attrs) => new Promise((resolve, reject) => {
            const el = Object.assign(document.createElement(tag), attrs);
            el.onload = resolve;
            el.onerror = reject;
            document.head.appendChild(el);
        });
        mapLibPromise = Promise.all([
            load('link', { rel: 'stylesheet', href: MAPLIBRE_BASE + 'maplibre-gl.css' }),
            load('script', { src: MAPLIBRE_BASE + 'maplibre-gl.js' })
        ]).catch(err => { mapLibPromise = null; throw err; });
    }
    return mapLibPromise;
}

// getCoords(): koordinat terkini dari input ({lat, lon} atau null).
// pick(lat, lon): dipanggil saat pengguna klik peta atau selesai menggeser penanda.
export async function initMap({ getCoords, pick }) {
    if (mapState === 'ready' || mapState === 'loading') return;
    onPick = pick;

    mapState = 'loading';
    updateMapStatus();
    let coords;
    try {
        await loadMapLibrary();
        coords = getCoords(); // dibaca setelah library siap; lokasi bisa sudah berubah selama memuat
        // Konstruktor gagal kalau browser tidak mendukung WebGL.
        map = new maplibregl.Map({
            container: 'map',
            style: MAP_STYLES.street,
            center: coords ? [coords.lon, coords.lat] : MAP_DEFAULT_VIEW.center,
            zoom: coords ? MAP_POINT_ZOOM : MAP_DEFAULT_VIEW.zoom,
            attributionControl: { compact: true }
        });
    } catch (e) {
        console.warn('Peta gagal dimuat:', e);
        mapState = 'failed';
        updateMapStatus();
        return;
    }

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-left');
    map.on('click', e => onPick(e.lngLat.lat, e.lngLat.lng));
    map.on('error', e => {
        // Error tile/sumber (mis. server tile menolak) -> beri tahu pengguna, peta tetap bisa diklik.
        console.warn('Error peta:', e.error || e);
        if (!mapTileError) { mapTileError = true; updateMapStatus(); }
    });
    if (coords) placeMarker(coords.lat, coords.lon);

    mapState = 'ready';
    $('mapLayers').hidden = false;
    updateMapStatus();
    setTimeout(() => map.resize(), 0);
}

export function setMapLayer(name) {
    if (!map || name === currentMapLayer) return;
    currentMapLayer = name;
    mapTileError = false;
    map.setStyle(MAP_STYLES[name]); // penanda (Marker) tidak ikut terhapus saat ganti style
    document.querySelectorAll('.map-layer-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.layer === name));
    updateMapStatus();
}

export function placeMarker(lat, lon) {
    if (!map) return; // peta belum/tidak termuat; initMap() akan membaca koordinat dari input
    if (!mapMarker) {
        mapMarker = new maplibregl.Marker({ color: MARKER_COLOR, draggable: true }).setLngLat([lon, lat]).addTo(map);
        mapMarker.on('dragend', () => {
            const p = mapMarker.getLngLat();
            onPick(p.lat, p.lng);
        });
    } else {
        mapMarker.setLngLat([lon, lat]);
    }
}

export function flyTo(lat, lon) {
    if (map) map.flyTo({ center: [lon, lat], zoom: Math.max(map.getZoom(), MAP_POINT_ZOOM), essential: true });
}

export function updateMapStatus() {
    const el = $('mapStatus');
    if (!el) return;
    el.classList.toggle('error', mapState === 'failed' || mapTileError);
    if (mapState === 'failed') { el.textContent = t('map.failed'); return; }
    if (mapState === 'loading') { el.textContent = t('map.loading'); return; }
    if (mapTileError) { el.textContent = t(currentMapLayer === 'topo' ? 'map.topoFailed' : 'map.tilesFailed'); return; }
    el.textContent = t('map.hint');
}

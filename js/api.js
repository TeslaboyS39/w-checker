// ================== OPEN-METEO: batas, geocoding, routing forecast/archive ==================
import { t, toISODate, addDays } from './core.js';

// Batas Forecast API (dicek ke API langsung: ~92 hari ke belakang s/d 15 hari ke depan).
export const FORECAST_PAST_DAYS = 92;
export const FORECAST_DAYS_AHEAD = 15;
export const ARCHIVE_MIN_DATE = '1940-01-01';

export const API = {
    archive: {
        url: 'https://archive-api.open-meteo.com/v1/archive',
        label: 'Historical API',
        // Archive tidak punya precipitation_probability (selalu null), jadi tidak diminta.
        hourly: 'temperature_2m,relative_humidity_2m,precipitation,weather_code,wind_speed_10m'
    },
    forecast: {
        url: 'https://api.open-meteo.com/v1/forecast',
        label: 'Forecast API',
        hourly: 'temperature_2m,relative_humidity_2m,precipitation,precipitation_probability,weather_code,wind_speed_10m'
    }
};

export function getLimits() {
    const today = toISODate(new Date());
    return {
        today,
        yesterday: addDays(today, -1),
        forecastMin: addDays(today, -FORECAST_PAST_DAYS),
        forecastMax: addDays(today, FORECAST_DAYS_AHEAD)
    };
}

// ---- Cari tempat (Open-Meteo Geocoding) ----
const placeLabel = r => [...new Set([r.name, r.admin2, r.admin1, r.country].filter(Boolean))].join(', ');

export async function searchPlaces(query, count, language) {
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=${count}&language=${language}&format=json`;
    const res = await fetch(url);
    const data = await res.json();
    return (data.results || []).map(r => ({
        name: placeLabel(r),
        shortName: r.name,
        region: [...new Set([r.admin2, r.admin1, r.country].filter(Boolean))].join(', '),
        lat: r.latitude,
        lon: r.longitude
    }));
}

// ---- Routing data cuaca ----
// Pecah rentang: sebelum hari ini -> archive, hari ini & ke depan -> forecast.
export function planSegments(dateFrom, dateTo, limits) {
    const segments = [];
    if (dateFrom <= limits.yesterday) {
        segments.push({ kind: 'archive', start: dateFrom, end: dateTo < limits.yesterday ? dateTo : limits.yesterday });
    }
    if (dateTo >= limits.today) {
        segments.push({ kind: 'forecast', start: dateFrom > limits.today ? dateFrom : limits.today, end: dateTo });
    }
    return segments;
}

async function fetchSegment(kind, start, end, lat, lon) {
    const api = API[kind];
    const url = `${api.url}?latitude=${lat}&longitude=${lon}&hourly=${api.hourly}&start_date=${start}&end_date=${end}&timezone=auto`;
    console.log(`[${api.label}] ${url}`);
    const res = await fetch(url);
    const data = await res.json();
    if (data.error || !data.hourly) {
        throw new Error(data.reason ? `${api.label}: ${data.reason}` : t('err.noData', { api: api.label }));
    }
    const h = data.hourly;
    const val = (arr, i) => (arr && arr[i] !== undefined) ? arr[i] : null;
    return h.time.map((time, i) => ({
        time, // waktu lokal lokasi (timezone=auto), format YYYY-MM-DDTHH:MM
        temp: val(h.temperature_2m, i),
        humidity: val(h.relative_humidity_2m, i),
        precip: val(h.precipitation, i),
        prob: val(h.precipitation_probability, i),
        code: val(h.weather_code, i),
        wind: val(h.wind_speed_10m, i),
        source: kind
    }));
}

const isEmptyRow = r => r.temp === null && r.code === null && r.precip === null;

export async function fetchAllRows(dateFrom, dateTo, lat, lon, limits) {
    const segments = planSegments(dateFrom, dateTo, limits);
    const results = await Promise.all(segments.map(s => fetchSegment(s.kind, s.start, s.end, lat, lon)));
    const rows = results.flat();

    // Arsip kadang belum terisi untuk beberapa hari terakhir -> isi dari Forecast API
    // (Forecast API masih menyimpan ~92 hari ke belakang).
    let backfilled = 0;
    const gaps = rows.filter(r => r.source === 'archive' && isEmptyRow(r) && r.time.slice(0, 10) >= limits.forecastMin);
    if (gaps.length > 0) {
        const gapStart = gaps[0].time.slice(0, 10);
        const gapEnd = gaps[gaps.length - 1].time.slice(0, 10);
        try {
            const fill = new Map((await fetchSegment('forecast', gapStart, gapEnd, lat, lon)).map(r => [r.time, r]));
            rows.forEach((r, i) => {
                if (r.source === 'archive' && isEmptyRow(r) && fill.has(r.time)) {
                    rows[i] = fill.get(r.time);
                    backfilled++;
                }
            });
        } catch (e) {
            console.warn('Gagal mengisi kekosongan arsip dari Forecast API:', e.message);
        }
    }

    return { rows, segments, backfilled };
}

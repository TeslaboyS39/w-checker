// ================== TAMPILAN HASIL: ringkasan, kartu, tabel, salin ==================
import { state, t, locale, fmt, fmtDateShort, fmtDateTime, escapeHtml, $ } from './core.js';
import { WEATHER_DESC } from './strings.js';
import { API } from './api.js';
import { filterRows, aggregateRows, computeSummary, RAIN_HOUR_THRESHOLD } from './data.js';

const MAX_CARDS = 500; // batas jumlah kartu agar browser tidak berat untuk rentang panjang

// ---- Ikon & deskripsi cuaca ----
const CLOUD_HIGH = 'M7 14h10a4 4 0 0 0 .5-7.97A6 6 0 0 0 6.1 7.1 3.5 3.5 0 0 0 7 14z';
const ICON_PATHS = {
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4L6 18M18 6l1.4-1.4"/>',
    partly: '<circle cx="8.5" cy="8.5" r="3"/><path d="M8.5 2.5v1M3.6 4.1l.7.7M2.5 8.5h1M13.4 4.1l-.7.7"/><path fill="var(--surface)" d="M9.5 20h8a3.5 3.5 0 0 0 .4-6.98A5 5 0 0 0 8.7 13.6 3.2 3.2 0 0 0 9.5 20z"/>',
    cloud: '<path d="M7 18h10a4 4 0 0 0 .5-7.97A6 6 0 0 0 6.1 11.1 3.5 3.5 0 0 0 7 18z"/>',
    fog: `<path d="${CLOUD_HIGH}"/><path d="M5 17.5h14M7 21h10"/>`,
    rain: `<path d="${CLOUD_HIGH}"/><path d="M8 17l-1 3M12 17l-1 3M16 17l-1 3"/>`,
    storm: `<path d="${CLOUD_HIGH}"/><path d="M12.5 15l-2 3.5h3l-2 3.5"/>`,
    snow: `<path d="${CLOUD_HIGH}"/><path d="M8 18h.01M12 18h.01M16 18h.01M10 21h.01M14 21h.01"/>`,
    unknown: '<path d="M8 12h8"/>'
};

function weatherCategory(code) {
    if (code === null || code === undefined) return 'unknown';
    if (code === 0) return 'sun';
    if (code <= 2) return 'partly';
    if (code === 3) return 'cloud';
    if (code <= 48) return 'fog';
    if (code <= 67) return 'rain';
    if (code <= 77) return 'snow';
    if (code <= 82) return 'rain';
    if (code <= 86) return 'snow';
    if (code <= 99) return 'storm';
    return 'cloud';
}

function weatherIcon(code) {
    const cat = weatherCategory(code);
    return `<span class="wicon wicon-${cat}" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${ICON_PATHS[cat]}</svg></span>`;
}

function getWeatherDescription(code) {
    if (code === null || code === undefined) return t('desc.na');
    return WEATHER_DESC[state.lang][code] || t('desc.unknown');
}

// ---- Pesan & tab ----
export function hideMessages() {
    $('error').style.display = 'none';
    $('empty-state').style.display = 'none';
    $('results').style.display = 'none';
}

export function showError(message) {
    $('error').textContent = message;
    $('error').style.display = 'block';
    $('results').style.display = 'none';
}

export function switchResultTab(tab) {
    document.querySelectorAll('.view-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.view === tab));
    document.querySelectorAll('.view-panel').forEach(panel => panel.classList.toggle('active', panel.id === `${tab}-content`));
}

// ---- Ringkasan rentang ----
function renderSummaryStats(s) {
    const shortDT = d => d.toLocaleString(locale(), { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false });
    const tile = (label, value, sub) =>
        `<div class="stat"><div class="stat-label">${label}</div><div class="stat-value">${value}</div><div class="stat-sub">${sub}</div></div>`;
    const withUnit = (v, digits, unit) => (v === null || v === undefined) ? '-' : `${fmt(v, digits)}<small>${unit}</small>`;

    const rainSub = s.totalRain === null ? t('stats.noData')
        : (s.wettest.precip > 0 ? t('stats.wettest', { v: fmt(s.wettest.precip, 2), t: shortDT(s.wettest.dateTime) }) : t('stats.noRain'));
    const tempValue = s.tempMin === null ? '-' : `${fmt(s.tempMin, 1)}–${fmt(s.tempMax, 1)}<small>°C</small>`;

    return `
        <div class="stats">
            ${tile(t('stats.totalRain'), withUnit(s.totalRain, 2, 'mm'), rainSub)}
            ${tile(t('stats.rainHours'), s.precipHours ? `${s.rainHours}<small>${t('stats.hoursOf', { n: s.precipHours })}</small>` : '-', t('stats.rainHoursSub', { v: fmt(RAIN_HOUR_THRESHOLD, 1) }))}
            ${tile(t('stats.temp'), tempValue, s.tempAvg === null ? '-' : t('stats.tempAvg', { v: fmt(s.tempAvg, 1) }))}
            ${tile(t('stats.wind'), withUnit(s.windest ? s.windest.wind : null, 1, 'km/h'),
                s.windest ? t('stats.windSub', { t: shortDT(s.windest.dateTime), v: fmt(s.windAvg, 1) }) : '-')}
        </div>
    `;
}

// ---- Render utama ----
export function displayWeather(rawData) {
    const chips = rawData.segments.map(s =>
        `<span class="chip">${API[s.kind].label} · ${fmtDateShort(s.start)}${s.start !== s.end ? ' – ' + fmtDateShort(s.end) : ''}</span>`
    ).join('');

    const notes = [];
    if (rawData.segments.some(s => s.kind === 'archive')) notes.push(t('note.noProb'));
    if (rawData.backfilled > 0) notes.push(t('note.backfilled', { n: rawData.backfilled }));

    $('location-info-container').innerHTML = `
        <div class="summary">
            <div>
                <h2>${escapeHtml(rawData.placeName || t('loc.pointName'))}</h2>
                <p class="meta">${rawData.lat.toFixed(5)}, ${rawData.lon.toFixed(5)}</p>
                <p class="meta">${fmtDateTime(rawData.startDateTime)} – ${fmtDateTime(rawData.endDateTime)}</p>
            </div>
            <div class="chips">${chips}</div>
        </div>
        ${renderSummaryStats(computeSummary(filterRows(rawData)))}
        ${notes.length ? `<div class="notes">${notes.map(n => `<p>${n}</p>`).join('')}</div>` : ''}
    `;

    $('results').style.display = 'block';
    updateDisplayedResults();
}

export function updateDisplayedResults() {
    if (!state.lastResult) return;

    const selectedInterval = document.querySelector('input[name="interval"]:checked').value;
    const data = aggregateRows(filterRows(state.lastResult), selectedInterval);

    if (data.length === 0) {
        $('card-grid').innerHTML = '';
        $('table-content').innerHTML = '';
        $('filter-info').textContent = t('info.none');
        return;
    }

    $('filter-info').textContent = t('info.rows', { label: t(`info.${selectedInterval}`), n: data.length });

    generateCardView(data);
    generateTableView(data);
}

function cardTitle(item) {
    const d = item.dateTime;
    const loc = locale();
    if (item.interval === 'hour') return d.toLocaleTimeString(loc, { hour: '2-digit', minute: '2-digit', hour12: false });
    if (item.interval === 'day') return d.toLocaleDateString(loc, { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
    if (item.interval === 'week') {
        const end = new Date(d);
        end.setDate(d.getDate() + 6);
        return `${d.toLocaleDateString(loc, { day: '2-digit', month: 'short' })} – ${end.toLocaleDateString(loc, { day: '2-digit', month: 'short', year: 'numeric' })}`;
    }
    return d.toLocaleDateString(loc, { month: 'long', year: 'numeric' });
}

function generateCardView(data) {
    const shown = data.slice(0, MAX_CARDS);
    const isHourly = data[0].interval === 'hour';
    let html = '';
    let lastDay = '';

    if (data.length > MAX_CARDS) {
        html += `<p class="grid-note">${t('cards.limited', { max: MAX_CARDS, n: data.length })}</p>`;
    }

    shown.forEach(item => {
        if (isHourly) {
            const day = item.dateTime.toLocaleDateString(locale(), { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
            if (day !== lastDay) {
                html += `<h3 class="day-heading">${day}</h3>`;
                lastDay = day;
            }
        }

        const wet = item.precipitation_mm !== null && item.precipitation_mm > 0 ? ' class="wet"' : '';
        const prob = item.precipitation_prob === null ? '-' : `${fmt(item.precipitation_prob, 0)}%`;

        html += `
            <article class="wcard">
                <div class="wcard-head">
                    <div>
                        <div class="wcard-title">${cardTitle(item)}</div>
                        <div class="wcard-sub">${getWeatherDescription(item.weatherCode)}</div>
                    </div>
                    ${weatherIcon(item.weatherCode)}
                </div>
                <div class="wcard-temp">${fmt(item.temp, 1)}<small>°C${isHourly ? '' : ' ' + t('card.avg')}</small></div>
                <dl class="wcard-stats">
                    <div><dt>${t(isHourly ? 'card.rain' : 'card.rainTotal')}</dt><dd${wet}>${fmt(item.precipitation_mm, 2)} mm</dd></div>
                    <div><dt>${t('card.prob')}</dt><dd>${prob}</dd></div>
                    <div><dt>${t('card.humidity')}</dt><dd>${fmt(item.humidity, 0)}%</dd></div>
                    <div><dt>${t('card.wind')}</dt><dd>${fmt(item.windSpeed, 1)} km/h</dd></div>
                </dl>
            </article>
        `;
    });
    $('card-grid').innerHTML = html;
}

// Urutan kolom = "kontrak" dengan template Excel surveyor. Jangan diubah tanpa koordinasi.
function generateTableView(data) {
    const loc = locale();
    const rowsHtml = data.map(item => {
        let period;
        if (item.interval === 'hour') {
            period = item.dateTime.toLocaleString(loc, {
                day: '2-digit', month: 'short', year: 'numeric',
                hour: '2-digit', minute: '2-digit', hour12: false
            });
        } else if (item.interval === 'day') {
            period = item.dateTime.toLocaleDateString(loc, { day: '2-digit', month: 'long', year: 'numeric' });
        } else if (item.interval === 'week') {
            const endOfWeek = new Date(item.dateTime);
            endOfWeek.setDate(item.dateTime.getDate() + 6);
            const opts = { day: '2-digit', month: 'short' };
            period = t('table.week', { a: item.dateTime.toLocaleDateString(loc, opts), b: endOfWeek.toLocaleDateString(loc, opts) });
        } else {
            period = item.dateTime.toLocaleDateString(loc, { month: 'long', year: 'numeric' });
        }
        const desc = item.weatherCode === null ? '-' : getWeatherDescription(item.weatherCode);
        const wet = item.precipitation_mm !== null && item.precipitation_mm > 0 ? ' wet' : '';
        return `<tr>
                <td>${period}</td>
                <td>${desc}</td>
                <td class="num">${fmt(item.temp, 1)}</td>
                <td class="num">${fmt(item.humidity, 0)}</td>
                <td class="num${wet}">${fmt(item.precipitation_mm, 2)}</td>
                <td class="num">${fmt(item.precipitation_prob, 0)}</td>
                <td class="num">${fmt(item.windSpeed, 1)}</td>
            </tr>`;
    }).join('');

    $('table-content').innerHTML = `
        <div class="table-wrap">
            <table class="weather-table">
                <thead>
                    <tr>
                        <th>${t('th.period')}</th>
                        <th>${t('th.weather')}</th>
                        <th class="num">${t('th.temp')}</th>
                        <th class="num">${t('th.humidity')}</th>
                        <th class="num">${t('th.precip')}</th>
                        <th class="num">${t('th.prob')}</th>
                        <th class="num">${t('th.wind')}</th>
                    </tr>
                </thead>
                <tbody>${rowsHtml}</tbody>
            </table>
        </div>
    `;
}

// ---- Salin tabel ----
// Disalin sebagai TSV (teks) + tabel HTML, sehingga tempel ke Excel langsung jadi sel.
let copyResetTimer = null;

export async function copyTable() {
    const table = document.querySelector('#table-content table');
    if (!table) return;

    const cells = [...table.rows].map(tr => [...tr.cells].map(c => c.textContent.trim()));
    const tsv = cells.map(row => row.join('\t')).join('\n');
    const html = `<table>${cells.map(row => `<tr>${row.map(v => `<td>${escapeHtml(v)}</td>`).join('')}</tr>`).join('')}</table>`;

    let ok = false;
    try {
        if (navigator.clipboard && window.ClipboardItem) {
            await navigator.clipboard.write([new ClipboardItem({
                'text/plain': new Blob([tsv], { type: 'text/plain' }),
                'text/html': new Blob([html], { type: 'text/html' })
            })]);
            ok = true;
        } else if (navigator.clipboard) {
            await navigator.clipboard.writeText(tsv);
            ok = true;
        }
    } catch (e) {
        console.warn('Clipboard API gagal, pakai cara lama:', e);
    }
    if (!ok) {
        // Cadangan untuk browser lama / konteks yang tidak mengizinkan Clipboard API
        const ta = document.createElement('textarea');
        ta.value = tsv;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
        ta.remove();
    }

    const btn = $('copyBtn');
    const label = $('copyLabel');
    label.textContent = ok ? t('copy.done', { n: cells.length - 1 }) : t('copy.failed');
    btn.classList.toggle('done', ok);
    clearTimeout(copyResetTimer);
    copyResetTimer = setTimeout(() => {
        label.textContent = t('copy.label');
        btn.classList.remove('done');
    }, 2500);
}

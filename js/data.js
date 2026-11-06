// ================== FILTER, AGREGASI, RINGKASAN ==================
// Fungsi murni: tidak menyentuh DOM, tidak memanggil API.

export function filterRows(rawData) {
    const { rows, startDateTime, endDateTime } = rawData;
    return rows
        .map(r => ({ ...r, dateTime: new Date(r.time) }))
        .filter(r => r.dateTime >= startDateTime && r.dateTime <= endDateTime);
}

function periodKeyDate(dt, interval) {
    if (interval === 'day') return new Date(dt.getFullYear(), dt.getMonth(), dt.getDate());
    if (interval === 'week') {
        const d = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate());
        d.setDate(d.getDate() - (d.getDay() + 6) % 7); // mundur ke hari Senin
        return d;
    }
    return new Date(dt.getFullYear(), dt.getMonth(), 1); // month
}

export function aggregateRows(rows, interval) {
    if (interval === 'hour') {
        return rows.map(r => ({
            dateTime: r.dateTime, temp: r.temp, humidity: r.humidity, precipitation_mm: r.precip,
            precipitation_prob: r.prob, weatherCode: r.code, windSpeed: r.wind, interval
        }));
    }

    const groups = new Map();
    rows.forEach(r => {
        const keyDate = periodKeyDate(r.dateTime, interval);
        const key = keyDate.getTime();
        if (!groups.has(key)) {
            groups.set(key, { date: keyDate, temp: [], humidity: [], precip: [], prob: [], wind: [], codes: {} });
        }
        const g = groups.get(key);
        // Hanya nilai yang tidak null yang ikut dihitung
        ['temp', 'humidity', 'precip', 'prob', 'wind'].forEach(f => { if (r[f] !== null) g[f].push(r[f]); });
        if (r.code !== null) g.codes[r.code] = (g.codes[r.code] || 0) + 1;
    });

    const avg = arr => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;
    const sum = arr => arr.length ? arr.reduce((a, b) => a + b, 0) : null;

    return Array.from(groups.values())
        .sort((a, b) => a.date - b.date)
        .map(g => {
            let dominantCode = null, maxCount = 0;
            for (const code in g.codes) {
                if (g.codes[code] > maxCount) { maxCount = g.codes[code]; dominantCode = parseInt(code); }
            }
            return {
                dateTime: g.date,
                temp: avg(g.temp),
                humidity: avg(g.humidity),
                precipitation_mm: sum(g.precip),
                precipitation_prob: avg(g.prob),
                weatherCode: dominantCode,
                windSpeed: avg(g.wind),
                interval
            };
        });
}

// Dihitung dari data per jam pada rentang yang dipilih, tidak tergantung pilihan agregasi.
export const RAIN_HOUR_THRESHOLD = 0.1; // mm per jam, dianggap "jam hujan"

export function computeSummary(rows) {
    const withVal = f => rows.filter(r => r[f] !== null && r[f] !== undefined);
    const maxBy = (arr, f) => arr.reduce((m, r) => (!m || r[f] > m[f]) ? r : m, null);

    const precipRows = withVal('precip');
    const temps = withVal('temp').map(r => r.temp);
    const windRows = withVal('wind');

    return {
        totalRain: precipRows.length ? precipRows.reduce((a, r) => a + r.precip, 0) : null,
        wettest: maxBy(precipRows, 'precip'),
        rainHours: precipRows.filter(r => r.precip >= RAIN_HOUR_THRESHOLD).length,
        precipHours: precipRows.length,
        tempMin: temps.length ? temps.reduce((a, b) => Math.min(a, b)) : null,
        tempMax: temps.length ? temps.reduce((a, b) => Math.max(a, b)) : null,
        tempAvg: temps.length ? temps.reduce((a, b) => a + b, 0) / temps.length : null,
        windest: maxBy(windRows, 'wind'),
        windAvg: windRows.length ? windRows.reduce((a, r) => a + r.wind, 0) / windRows.length : null
    };
}

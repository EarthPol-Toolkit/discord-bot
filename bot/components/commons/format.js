function number(value, options = {}) {
    const n = Number(value);
    if (!Number.isFinite(n)) return options.fallback || 'N/A';
    return n.toLocaleString(undefined, options);
}

function gold(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return 'N/A';
    return `${n.toLocaleString(undefined, {
        maximumFractionDigits: Number.isInteger(n) ? 0 : 2
    })}G`;
}

function percent(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return 'N/A';
    return `${Math.round(n * 100)}%`;
}

function bool(value) {
    if (value === null || value === undefined) return 'Unknown';
    return value ? 'Yes' : 'No';
}

function timestamp(value, style = 'R') {
    if (!value) return 'Unknown';
    const time = value instanceof Date ? value.getTime() : Number(value);
    if (!Number.isFinite(time)) return 'Unknown';
    return `<t:${Math.floor(time / 1000)}:${style}>`;
}

function date(value) {
    if (!value) return 'Unknown';
    const d = value instanceof Date ? value : new Date(value);
    if (!Number.isFinite(d.getTime())) return 'Unknown';
    return d.toLocaleDateString();
}

function durationSeconds(seconds) {
    const total = Math.max(0, Math.floor(Number(seconds) || 0));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    return [h && `${h}h`, m && `${m}m`, `${s}s`].filter(Boolean).join(' ');
}

function ticks(ticksValue) {
    return durationSeconds(Math.floor((Number(ticksValue) || 0) / 20));
}

function truncate(value, max = 1024) {
    const text = String(value ?? '');
    if (text.length <= max) return text;
    return `${text.slice(0, Math.max(0, max - 3))}...`;
}

function cleanItemStack(value) {
    const text = String(value ?? '');
    return text.match(/ItemStack\{(.+)\}/)?.[1] || text || 'Unknown item';
}

function materialLabel(value) {
    return String(value || 'UNKNOWN')
        .replace(/^minecraft:/i, '')
        .replace(/_/g, ' ')
        .toLowerCase()
        .replace(/\b\w/g, c => c.toUpperCase());
}

function normalizeUuid(id) {
    if (typeof id !== 'string') return id;
    if (id.includes('-')) return id;
    const m = id.match(/^([0-9a-fA-F]{8})([0-9a-fA-F]{4})([0-9a-fA-F]{4})([0-9a-fA-F]{4})([0-9a-fA-F]{12})$/);
    return m ? `${m[1]}-${m[2]}-${m[3]}-${m[4]}-${m[5]}` : id;
}

function progressBar(current, total, width = 12) {
    const c = Math.max(0, Number(current) || 0);
    const t = Math.max(1, Number(total) || 1);
    const filled = Math.max(0, Math.min(width, Math.round((c / t) * width)));
    return `${'█'.repeat(filled)}${'░'.repeat(width - filled)} ${Math.round((c / t) * 100)}%`;
}

module.exports = {
    bool,
    cleanItemStack,
    date,
    durationSeconds,
    gold,
    materialLabel,
    normalizeUuid,
    number,
    percent,
    progressBar,
    ticks,
    timestamp,
    truncate
};

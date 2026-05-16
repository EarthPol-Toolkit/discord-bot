const { env, joinUrl } = require('./api');

function fileNameFromName(name) {
    return String(name || '').replaceAll(' ', '_');
}

function cdnBase() {
    return env('EARTHPOL_CDN_BASE', 'https://cdn.earthpol.com');
}

function nationFlagUrl(name) {
    if (!name) return null;
    return joinUrl(cdnBase(), `nations/${encodeURIComponent(fileNameFromName(name))}.png`);
}

function townFlagUrl(name) {
    if (!name) return null;
    return joinUrl(cdnBase(), `towns/${encodeURIComponent(fileNameFromName(name))}.png`);
}

function playerBustUrl(name, size = 156) {
    if (!name) return null;
    return `https://vzge.me/bust/${size}/${encodeURIComponent(name)}`;
}

function mapUrl(x, z, world = 'world', zoom = 5) {
    const xi = Math.floor(Number(x) || 0);
    const zi = Math.floor(Number(z) || 0);
    return `https://earthpol.com/map/#${encodeURIComponent(world)}:${xi}:65:${zi}:${zoom}:0:0:0:0:perspective`;
}

function toolkitBaseUrl() {
    const base = env('TOOLKIT_BASE_URL') || env('TOOLKIT_API_BASE') || 'https://earthpol.org';

    return String(base)
        .replace(/\/+$/, '')
        .replace(/\/api$/, '');
}

function toolkitUrl(path, params = {}) {
    const base = toolkitBaseUrl();
    if (!base) return null;

    const url = new URL(joinUrl(base, path));
    for (const [key, value] of Object.entries(params)) {
        if (value !== null && value !== undefined && value !== '') {
            url.searchParams.set(key, String(value));
        }
    }
    return url.toString();
}

function textureUrl(material) {
    if (!material) return null;
    const mat = String(material).toLowerCase();
    return `https://api.earthpol.com/textures/item/${encodeURIComponent(mat)}.png`;
}

module.exports = {
    mapUrl,
    nationFlagUrl,
    playerBustUrl,
    textureUrl,
    toolkitBaseUrl,
    toolkitUrl,
    townFlagUrl
};

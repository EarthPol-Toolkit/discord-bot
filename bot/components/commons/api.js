const axios = require('axios');

const DEFAULT_TIMEOUT_MS = 15_000;

const http = axios.create({
    timeout: Number(process.env.API_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS,
    headers: {
        Accept: 'application/json',
        'User-Agent': 'earthpol-discord-toolkit/2.0'
    }
});

function env(name, fallback = null) {
    const value = process.env[name];
    if (typeof value !== 'string') return fallback;
    const trimmed = value.trim();
    return trimmed || fallback;
}

function stripTrailingSlash(value) {
    return String(value || '').replace(/\/+$/, '');
}

function joinUrl(base, path) {
    const b = stripTrailingSlash(base);
    const p = String(path || '').replace(/^\/+/, '');
    return `${b}/${p}`;
}

function astraBaseUrl() {
    return stripTrailingSlash(env('API_BASE_URL', 'https://api.earthpol.com/astra'));
}

function endpointUrl(envName, path) {
    return env(envName, joinUrl(astraBaseUrl(), path));
}

function toolkitApiBaseUrl() {
    const configured = env('TOOLKIT_API_BASE') || env('TOOLKIT_BASE_URL');
    if (!configured) return null;

    const base = stripTrailingSlash(configured);
    return base.endsWith('/api') ? base : `${base}/api`;
}

function toolkitApiUrl(path) {
    const base = toolkitApiBaseUrl();
    if (!base) return null;

    const cleanPath = String(path || '')
        .replace(/^\/+/, '')
        .replace(/^api\/+/, '');
    return joinUrl(base, cleanPath);
}

async function getJson(url, params = undefined) {
    const { data } = await http.get(url, { params });
    return data;
}

async function postQuery(url, query) {
    const { data } = await http.post(url, { query });
    return data;
}

async function getToolkitJson(path, params = undefined) {
    const url = toolkitApiUrl(path);
    if (!url) {
        throw new Error('TOOLKIT_API_BASE or TOOLKIT_BASE_URL is not configured');
    }
    return getJson(url, params);
}

async function fetchUUIDFromPlayerDB(username) {
    const data = await getJson(
        `https://playerdb.co/api/player/minecraft/${encodeURIComponent(username)}`
    );
    if (!data.success) throw new Error('Minecraft user not found');
    return data.data.player.id;
}

async function fetchUsernameFromPlayerDB(uuid) {
    const data = await getJson(
        `https://playerdb.co/api/player/minecraft/${encodeURIComponent(uuid)}`
    );
    if (!data.success) throw new Error('UUID not found');
    return data.data.player.username;
}

module.exports = {
    astraBaseUrl,
    endpointUrl,
    env,
    getJson,
    getToolkitJson,
    http,
    joinUrl,
    postQuery,
    toolkitApiBaseUrl,
    toolkitApiUrl,
    fetchUUIDFromPlayerDB,
    fetchUsernameFromPlayerDB
};

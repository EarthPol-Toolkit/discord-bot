// bot/utils/townCache.js
const fs    = require('fs');
const path  = require('path');
const axios = require('axios');
const { endpointUrl } = require('../components/commons/api');

const TOWN_API   = endpointUrl('TOWNS_API', 'towns');
const CACHE_DIR  = path.join(__dirname, '../cache');
const CACHE_FILE = path.join(CACHE_DIR, 'towns.json');
const UPDATE_INTERVAL_MS = 60 * 60 * 1000;      // 1 hour

let _readyResolve;
const readyPromise = new Promise(resolve => _readyResolve = resolve);

/**
 * Fetch full details for all towns and write to cache file.
 */
async function updateCache() {
    try {
        // 1) get summary list
        const { data: summary } = await axios.get(TOWN_API);
        const names = summary.map(t => t.name);

        // 2) chunk into batches of 50 (API may limit size)
        const chunkSize = 50;
        const chunks = [];
        for (let i = 0; i < names.length; i += chunkSize) {
            chunks.push(names.slice(i, i + chunkSize));
        }

        // 3) fetch details for each chunk
        let allDetails = [];
        for (const chunk of chunks) {
            const res = await axios.post(TOWN_API, { query: chunk });
            allDetails = allDetails.concat(res.data);
        }

        // 4) write to disk
        fs.mkdirSync(CACHE_DIR, { recursive: true });
        fs.writeFileSync(CACHE_FILE, JSON.stringify(allDetails, null, 2), 'utf-8');
        console.log(`[TownCache] updated ${allDetails.length} towns`);
        _readyResolve();
    } catch (err) {
        console.error('[TownCache] failed to update cache:', err);
        _readyResolve();
    }
}

/**
 * Return cached list of town-detail objects.
 */
function getAllTowns() {
    if (!fs.existsSync(CACHE_FILE)) return [];
    try {
        return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'));
    } catch {
        return [];
    }
}

async function waitReady() {
    return readyPromise;
}

// Kick off periodic refresh
if (process.env.CHECK_COMMANDS !== '1') {
    updateCache();
    setInterval(updateCache, UPDATE_INTERVAL_MS);
} else {
    _readyResolve();
}

module.exports = { getAllTowns, waitReady };

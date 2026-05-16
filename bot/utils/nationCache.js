// utils/nationCache.js
const axios = require('axios');
const { endpointUrl } = require('../components/commons/api');

const NATION_API = endpointUrl('NATIONS_API', 'nations');

let _nations = [];
let _readyResolve;
const readyPromise = new Promise(r => _readyResolve = r);

async function refreshNations() {
    try {
        console.log('[NationCache] fetching all nations…');
        const { data } = await axios.get(NATION_API);
        _nations = data; // [{ name, uuid }, …]
        console.log(`[NationCache] loaded ${_nations.length} nations`);
        _readyResolve();
    } catch (err) {
        console.error('[NationCache] failed to fetch nations', err);
        _readyResolve();
    }
}

// initial + hourly
if (process.env.CHECK_COMMANDS !== '1') {
    refreshNations();
    setInterval(refreshNations, 60 * 60 * 1000);
} else {
    _readyResolve();
}

function getAllNations() {
    return _nations;
}
async function waitReady() {
    return readyPromise;
}

module.exports = { getAllNations, waitReady };

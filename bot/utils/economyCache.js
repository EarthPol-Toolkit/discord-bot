// utils/economyCache.js
const { endpointUrl, postQuery } = require('../components/commons/api');
const { getAllPlayers, waitReady: waitPlayers } = require('./playerCache');
const { getAllTowns, waitReady: waitTowns } = require('./townCache');
const { getAllNations, waitReady: waitNations } = require('./nationCache');

const PLAYER_API = endpointUrl('PLAYERS_API', 'players');
const TOWN_API   = endpointUrl('TOWNS_API', 'towns');
const NATION_API = endpointUrl('NATIONS_API', 'nations');

function chunkArray(arr, size = 20) {
    const out = [];
    for (let i = 0; i < arr.length; i += size) {
        out.push(arr.slice(i, i + size));
    }
    return out;
}

async function sumBalances(apiUrl, ids) {
    let total = 0;
    const chunks = chunkArray(ids, 20);
    for (const chunk of chunks) {
        try {
            console.log(`[EconomyCache] summing ${chunk.length} IDs @ ${apiUrl}`);
            const batch = await postQuery(apiUrl, chunk);
            const s = batch.reduce((acc, x) => acc + (x.stats?.balance || 0), 0);
            console.log(`  ↳ chunk sum ${s}`);
            total += s;
        } catch (err) {
            console.error('[EconomyCache] chunk failed', err);
        }
    }
    return total;
}

let cache = {
    playerSum: 0,
    townSum:   0,
    nationSum: 0,
    grandSum:  0,
    updatedAt: 0
};

let _readyResolve;
const readyPromise = new Promise(r => _readyResolve = r);

async function refreshCache() {
    try {
        // wait for player & nation caches first
        await Promise.all([ waitPlayers(), waitTowns(), waitNations() ]);
        console.log('[EconomyCache] starting full refresh');

        const playerIds = getAllPlayers().map(p => p.uuid);
        const townIds   = getAllTowns().map(t => t.uuid);
        const nationIds = getAllNations().map(n => n.uuid);

        const [ playerSum, townSum, nationSum ] = await Promise.all([
            sumBalances(PLAYER_API, playerIds),
            sumBalances(TOWN_API,   townIds),
            sumBalances(NATION_API, nationIds),
        ]);

        cache = {
            playerSum,
            townSum,
            nationSum,
            grandSum: playerSum + townSum + nationSum,
            updatedAt: Date.now()
        };
        console.log(`[EconomyCache] Done: players=${playerSum}, towns=${townSum}, nations=${nationSum}`);
        _readyResolve();
    } catch (err) {
        console.error('[EconomyCache] refresh failed', err);
    }
}

// kick off + hourly
if (process.env.CHECK_COMMANDS !== '1') {
    refreshCache();
    setInterval(refreshCache, 60 * 60 * 1000);
} else {
    _readyResolve();
}

function getEconomyCache() {
    return cache;
}
async function waitReady() {
    return readyPromise;
}

module.exports = { getEconomyCache, waitReady };

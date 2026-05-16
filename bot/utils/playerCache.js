// utils/playerCache.js
const axios = require('axios');
const { endpointUrl } = require('../components/commons/api');

const PLAYER_API = endpointUrl('PLAYERS_API', 'players');

let _players = [];
let _readyResolve;
const readyPromise = new Promise(r => _readyResolve = r);

async function refreshPlayers() {
    try {
        console.log('[PlayerCache] fetching all players…');
        const { data } = await axios.get(PLAYER_API);
        _players = data; // [{ name, uuid }, …]
        console.log(`[PlayerCache] loaded ${_players.length} players`);
        _readyResolve();
    } catch (err) {
        console.error('[PlayerCache] failed to fetch players', err);
        _readyResolve();
    }
}

// initial + hourly
if (process.env.CHECK_COMMANDS !== '1') {
    refreshPlayers();
    setInterval(refreshPlayers, 60 * 60 * 1000 /** 1h **/);
} else {
    _readyResolve();
}

function getAllPlayers() {
    return _players;
}
async function waitReady() {
    return readyPromise;
}

module.exports = { getAllPlayers, waitReady };

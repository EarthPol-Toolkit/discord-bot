// bot/utils/monitor.js
const axios = require('axios');
const { endpointUrl, postQuery } = require('../components/commons/api');
const fmt = require('../components/commons/format');
const { EmbedBuilder } = require('discord.js');

const SHOP_API     = endpointUrl('SHOP_API', 'shops');
const LOCATION_API = endpointUrl('LOCATION_API', 'location');
const PLAYERS_API  = endpointUrl('PLAYERS_API', 'players');
const CHANNEL_ID   = process.env.ANNOUNCE_CHANNEL_ID || '1367695454737010698';

let clientRef = null;
let previousShops = new Map();

function setClient(client) {
    clientRef = client;
}

// Seed cache without sending messages
async function seedShops() {
    const { data } = await axios.get(SHOP_API);
    previousShops = new Map(data.map(s => [s.id, s]));
}

// Clear entirely so next check treats all as new
function clearCache() {
    previousShops = new Map();
}

// Return current cache size
function getCacheSize() {
    return previousShops.size;
}

async function checkShops() {
    try {
        // 1) GET current shops
        const { data } = await axios.get(SHOP_API);
        const current = new Map(data.map(s => [s.id, s]));

        // 2) Diff
        const newIds     = [...current.keys()].filter(id => !previousShops.has(id));
        const removedIds = [...previousShops.keys()].filter(id => !current.has(id));
        if (!newIds.length && !removedIds.length) return;

        // 3) Fetch new shop details + locs/owners
        const newDetails = newIds.length
            ? await postQuery(SHOP_API, newIds.map(String))
            : [];
        const locsNew   = newDetails.length
            ? await postQuery(LOCATION_API, newDetails.map(d => [Math.floor(d.location.x), Math.floor(d.location.z)]))
            : [];
        const ownersNew = newDetails.length
            ? await postQuery(PLAYERS_API, newDetails.map(d => d.owner))
            : [];

        const channel = await clientRef.channels.fetch(CHANNEL_ID);

        // Helper to post an embed
        const postEmbed = (d, locs, owners, type) => {
            const item = fmt.cleanItemStack(d.item);
            const priceG = fmt.gold(d.price);
            const title  = type === 'new'
                ? `🆕 New Shop #${d.id}`
                : `❌ Removed Shop #${d.id}`;
            const color  = type === 'new' ? 0x00FF00 : 0xFF0000;

            const embed = new EmbedBuilder()
                .setTitle(title)
                .setColor(color)
                .addFields(
                    { name: `Shop #${d.id}`, value: `**${item}**\nPrice: **${priceG}**`, inline: false }
                )
                .setTimestamp();

            // only add Details/Location if we have location data
            if (type === 'new') {
                const locRec = locs.find(l =>
                    l.location.x === Math.floor(d.location.x) &&
                    l.location.z === Math.floor(d.location.z)
                ) || {};
                const parts = [];
                if (locRec.town?.name)   parts.push(`Town: ${locRec.town.name}`);
                if (locRec.nation?.name) parts.push(`Nation: ${locRec.nation.name}`);
                const ownerName = owners.find(o => o.uuid === d.owner)?.name || d.owner;
                parts.push(`Owner: ${ownerName}`);

                const x = Math.floor(d.location.x);
                const z = Math.floor(d.location.z);

                embed.addFields(
                    { name: 'Details',  value: parts.join(', '), inline: false },
                    { name: 'Location', value: `X: ${x}, Z: ${z}`, inline: false }
                );
            }

            return channel.send({ embeds: [embed] });
        };

        // 4) Post new shops
        for (const d of newDetails) {
            await postEmbed(d, locsNew, ownersNew, 'new');
        }

        // 5) Post removed shops from cache (no loc/details)
        for (const id of removedIds) {
            const d = previousShops.get(id);
            await postEmbed(d, [], [], 'removed');
        }

        // 6) Update cache
        previousShops = current;
    } catch (err) {
        console.error('[Monitor] Error checking shops:', err);
    }
}


module.exports = {
    setClient,
    seedShops,
    clearCache,
    getCacheSize,
    checkShops
};

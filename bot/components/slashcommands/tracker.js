// bot/components/slashcommands/tracker.js
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const fs    = require('fs');
const path  = require('path');
const axios = require('axios');
const { postQuery } = require('../commons/api');

// ─── load blacklist of hidden player names ────────────────────────────────
const hiddenPlayers = fs
    .readFileSync(path.join(__dirname, '../../utils/hiddenplayers.txt'), 'utf-8')
    .split(/\r?\n/)
    .map(l => l.trim().toLowerCase())
    .filter(Boolean);
const hiddenSet = new Set(hiddenPlayers);

// ─── Helpers ─────────────────────────────────────────────────────────────
function normalizeUuid(id) {
    if (typeof id !== 'string') return id;
    if (id.includes('-')) return id;
    const m = id.match(/^([0-9a-fA-F]{8})([0-9a-fA-F]{4})([0-9a-fA-F]{4})([0-9a-fA-F]{4})([0-9a-fA-F]{12})$/);
    return m ? `${m[1]}-${m[2]}-${m[3]}-${m[4]}-${m[5]}` : id;
}

// ─── API Endpoints ─────────────────────────────────────────────────────────
const API_BASE    = process.env.API_BASE_URL || 'https://api.earthpol.com/astra';
const DISCORD_EP  = `${API_BASE}/discord`;
const PLAYERS_EP  = `${API_BASE}/players`;
const NATIONS_EP  = `${API_BASE}/nations`;
const LOCATION_EP = process.env.LOCATION_API;

module.exports = {
    data: new SlashCommandBuilder()
        .setName('tracker')
        .setDescription('Track online players on the live map')
        .addBooleanOption(opt =>
            opt.setName('inwilderness')
                .setDescription('Show players in wilderness (true) or in towns (false)')
                .setRequired(true)
        )
        .addBooleanOption(opt =>
            opt.setName('allied')
                .setDescription('Filter by allied to you (true) or not allied (false)')
        )
        .addBooleanOption(opt =>
            opt.setName('enemy')
                .setDescription('Filter by enemy to you (true) or not enemy (false)')
        ),

    async execute(interaction) {
        await interaction.deferReply();
        const wantWilderness = interaction.options.getBoolean('inwilderness');
        const wantAllied     = interaction.options.getBoolean('allied');
        const wantEnemy      = interaction.options.getBoolean('enemy');

        // 1) Fetch live map players
        let players;
        try {
            const res = await axios.get('https://earthpol.com/map/maps/world/live/players.json');
            players = res.data.players;
        } catch (err) {
            console.error('[Tracker] failed fetch live players', err);
            return interaction.editReply('❌ Could not fetch live player data.');
        }
        if (!players || !players.length) {
            return interaction.editReply('ℹ️ No players visible on the live map right now.');
        }

        // 2) Always build your alliance/enemy sets
        const alliedSet = new Set();
        const enemySet  = new Set();
        try {
            const link = await postQuery(DISCORD_EP, [interaction.user.id]);
            const yourUuid = link?.uuid;
            if (yourUuid) {
                const [you] = await postQuery(PLAYERS_EP, [yourUuid]);
                const yourNationUuid = you?.nation?.uuid;
                if (yourNationUuid) {
                    const [nationInfo] = await postQuery(NATIONS_EP, [yourNationUuid]);
                    const data = nationInfo || {};
                    (data.allies || []).forEach(a => alliedSet.add(normalizeUuid(a.uuid)));
                    (data.enemies || []).forEach(e => enemySet.add(normalizeUuid(e.uuid)));
                }
            }
        } catch (err) {
            console.error('[Tracker] failed to fetch your alliance data', err);
        }

        // 3) Location lookup
        const coords = players.map(p => [Math.round(p.position.x), Math.round(p.position.z)]);
        let locData;
        try {
            locData = await postQuery(LOCATION_EP, coords);
        } catch (err) {
            console.error('[Tracker] failed fetch locations', err);
            return interaction.editReply('❌ Could not resolve player locations.');
        }

        // 4) Pair & initial filter
        let entries = players.map((p, i) => {
            const rec = locData[i] || {};
            return {
                name: p.name,
                x: Math.round(p.position.x),
                z: Math.round(p.position.z),
                isW: rec.isWilderness,
                // rec.nation is the location's nation
                locationNationUuid: normalizeUuid(rec.nation?.uuid || ''),
            };
        })
            .filter(e => e.isW === wantWilderness)
            .filter(e => !hiddenSet.has(e.name.toLowerCase()));

        // 5) Fetch each player's actual nation UUID in batch
        try {
            const names = entries.map(e => e.name);
            const playersInfo = await postQuery(PLAYERS_EP, names);
            entries = entries.map((e, idx) => ({
                ...e,
                playerNationUuid: normalizeUuid(playersInfo[idx]?.nation?.uuid || ''),
            }));
        } catch (err) {
            console.error('[Tracker] failed to fetch players nation data', err);
        }

        // 6) Apply filters if requested
        if (wantAllied !== null) {
            entries = entries.filter(e => {
                const isAlly = e.playerNationUuid && alliedSet.has(e.playerNationUuid);
                return wantAllied ? isAlly : !isAlly;
            });
        }
        if (wantEnemy !== null) {
            entries = entries.filter(e => {
                const isEnemy = e.playerNationUuid && enemySet.has(e.playerNationUuid);
                return wantEnemy ? isEnemy : !isEnemy;
            });
        }

        if (!entries.length) {
            return interaction.editReply('🔍 No matching players found.');
        }

        // 7) Paginate and build embed
        const MAX = 24;
        const disp = entries.slice(0, MAX);
        const embed = new EmbedBuilder()
            .setTitle(`Players ${wantWilderness ? 'in Wilderness' : 'in Towns'}`)
            .setColor(wantWilderness ? 0xFF4500 : 0x1ABC9C)
            .setTimestamp()
            .setFooter({ text: process.env.TOOLKIT_FOOTER || '' });

        for (const e of disp) {
            const locLine = wantWilderness
                ? 'Wilderness'
                : `Location Nation: ${e.locationNationUuid}`;
            const mapUrl = `https://earthpol.com/map/#world:${e.x}:65:${e.z}:5:0:0:0:0:perspective`;
            const allyTag  = alliedSet.has(e.playerNationUuid) ? '🟢 Allied' : '';
            const enemyTag = enemySet.has(e.playerNationUuid)  ? '🔴 Enemy'  : '';
            embed.addFields({
                name: e.name,
                value: `X:${e.x} Z:${e.z}\n${locLine}\n[View on Map](${mapUrl})\n${allyTag} ${enemyTag}`,
                inline: false
            });
        }
        if (entries.length > MAX) {
            embed.addFields({ name: '…', value: `And ${entries.length - MAX} more not shown`, inline: false });
        }

        return interaction.editReply({ embeds: [embed] });
    }
};

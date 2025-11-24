// bot/components/slashcommands/res.js
const { SlashCommandBuilder } = require('@discordjs/builders');
const { EmbedBuilder }        = require('discord.js');
const axios                   = require('axios');

const PLAYERS_API      = process.env.PLAYERS_API       || 'https://api.earthpol.com/astra/players';
const PLAYERS_LIST_API = process.env.PLAYERS_LIST_API  || PLAYERS_API; // or your “list all” endpoint

// In‑memory cache of player names for autocomplete
let playerNames = [];

// Load suggestions once on startup...
async function loadPlayerNames() {
    try {
        const res = await axios.get(PLAYERS_LIST_API);
        // assume res.data is an array of { name, uuid, … }
        playerNames = res.data.map(p => p.name);
        console.log(`[res] Loaded ${playerNames.length} player names`);
    } catch (err) {
        console.error('[res] Failed to load player list for autocomplete:', err.message);
    }
}
// …and refresh every hour
loadPlayerNames();
setInterval(loadPlayerNames, 60 * 60 * 1000);

module.exports = {
    data: new SlashCommandBuilder()
        .setName('res')
        .setDescription('Lookup a resident’s info')
        .addStringOption(opt =>
            opt
                .setName('username')
                .setDescription('Minecraft username')
                .setRequired(true)
                .setAutocomplete(true)
        ),

    // Autocomplete handler
    async autocomplete(interaction) {
        const focused = interaction.options.getFocused().toLowerCase();
        const choices = playerNames
            .filter(n => n.toLowerCase().startsWith(focused))
            .slice(0, 25)
            .map(n => ({ name: n, value: n }));
        await interaction.respond(choices);
    },

    // Slash command execution
    async execute(interaction) {
        await interaction.deferReply();

        const username = interaction.options.getString('username', true);
        let data;
        try {
            const res = await axios.post(PLAYERS_API, { query: [username] });
            data = Array.isArray(res.data) ? res.data[0] : null;
            if (!data) throw new Error('No player data returned');
        } catch (err) {
            console.error('[res] API error:', err.message);
            return interaction.editReply('❌ Could not fetch resident info.');
        }

        const embed = new EmbedBuilder()
            .setTitle(`🔍 Resident: ${data.name}`)
            .setColor(0x00AAFF)
            .addFields(
                { name: 'UUID',          value: data.uuid, inline: true },
                { name: 'Display Name',  value: data.formattedName || '—', inline: true },
                { name: 'Title',         value: data.title         || '—', inline: true },
                { name: 'Surname',       value: data.surname       || '—', inline: true },
                { name: 'About',         value: data.about         || '—', inline: false },
                { name: 'Town',          value: data.town?.name    || '—', inline: true },
                { name: 'Nation',        value: data.nation?.name  || '—', inline: true },
                { name: 'Registered',    value: data.timestamps?.registered
                        ? new Date(data.timestamps.registered).toLocaleString()
                        : '—',
                    inline: true },
                { name: 'Last Online',   value: data.timestamps?.lastOnline
                        ? new Date(data.timestamps.lastOnline).toLocaleString()
                        : '—',
                    inline: true },
                { name: 'Balance',       value: `${data.stats?.balance ?? 0}`, inline: true },
                { name: 'Friends',       value: `${data.stats?.numFriends ?? 0}`, inline: true }
            )
            .setTimestamp();

        return interaction.editReply({ embeds: [embed] });
    }
};

// bot/components/slashcommands/res.js
const {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder,
    SlashCommandBuilder
} = require('discord.js');
const axios                   = require('axios');
const { endpointUrl }         = require('../commons/api');
const fmt                     = require('../commons/format');
const { nationFlagUrl, playerBustUrl, toolkitUrl } = require('../commons/links');

const PLAYERS_API      = endpointUrl('PLAYERS_API', 'players');
const PLAYERS_LIST_API = process.env.PLAYERS_LIST_API  || PLAYERS_API;

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
if (process.env.CHECK_COMMANDS !== '1') {
    loadPlayerNames();
    setInterval(loadPlayerNames, 60 * 60 * 1000);
}

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
            .setTitle(`Resident: ${data.name}`)
            .setColor(0x00AAFF)
            .setThumbnail(playerBustUrl(data.name))
            .addFields(
                { name: 'UUID',          value: data.uuid, inline: true },
                { name: 'Display Name',  value: data.formattedName || '—', inline: true },
                { name: 'Title',         value: data.title         || '—', inline: true },
                { name: 'Surname',       value: data.surname       || '—', inline: true },
                { name: 'About',         value: fmt.truncate(data.about || '—', 500), inline: false },
                { name: 'Town',          value: data.town?.name    || '—', inline: true },
                { name: 'Nation',        value: data.nation?.name  || '—', inline: true },
                { name: 'Registered',    value: data.timestamps?.registered
                        ? fmt.timestamp(data.timestamps.registered, 'D')
                        : '—',
                    inline: true },
                { name: 'Last Online',   value: data.timestamps?.lastOnline
                        ? fmt.timestamp(data.timestamps.lastOnline, 'R')
                        : '—',
                    inline: true },
                { name: 'Balance',       value: fmt.gold(data.stats?.balance), inline: true },
                { name: 'Friends',       value: fmt.number(data.stats?.numFriends ?? 0), inline: true }
            )
            .setTimestamp();

        const flag = nationFlagUrl(data.nation?.name);
        if (flag) embed.setImage(flag);

        const buttons = [];
        const profileUrl = toolkitUrl('/players', { u: data.uuid });
        if (profileUrl) {
            buttons.push(
                new ButtonBuilder()
                    .setLabel('Open Toolkit')
                    .setStyle(ButtonStyle.Link)
                    .setURL(profileUrl)
            );
        }
        buttons.push(
            new ButtonBuilder()
                .setLabel('Ban History')
                .setStyle(ButtonStyle.Link)
                .setURL(`https://bans.earthpol.com/history.php?uuid=${encodeURIComponent(data.uuid.replaceAll('-', ''))}`)
        );

        const components = buttons.length ? [new ActionRowBuilder().addComponents(buttons)] : [];
        return interaction.editReply({ embeds: [embed], components });
    }
};

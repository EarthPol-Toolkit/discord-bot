const {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder,
    SlashCommandBuilder
} = require('discord.js');
const { fetchUUIDFromPlayerDB, getToolkitJson } = require('../commons/api');
const fmt = require('../commons/format');
const { playerBustUrl, toolkitUrl } = require('../commons/links');

function kd(kills, deaths) {
    const k = Number(kills) || 0;
    const d = Number(deaths) || 0;
    return d === 0 ? k.toFixed(2) : (k / d).toFixed(2);
}

function statLine(row) {
    return [
        `Kills: **${fmt.number(row.kills)}**`,
        `Deaths: **${fmt.number(row.deaths)}**`,
        `Assists: **${fmt.number(row.assists)}**`,
        `K/D: **${kd(row.kills, row.deaths)}**`,
        `Best KS: **${fmt.number(row.best_killstreak)}**`
    ].join(' | ');
}

const data = new SlashCommandBuilder()
    .setName('kitpvp')
    .setDescription('Toolkit KitPvP stats')
    .addSubcommand(sub =>
        sub.setName('leaderboard')
            .setDescription('Show a KitPvP leaderboard')
            .addStringOption(opt =>
                opt.setName('sort')
                    .setDescription('Sort stat')
                    .addChoices(
                        { name: 'Kills', value: 'kills' },
                        { name: 'Deaths', value: 'deaths' },
                        { name: 'Assists', value: 'assists' },
                        { name: 'Damage', value: 'damage' },
                        { name: 'Best Killstreak', value: 'best_killstreak' }
                    )
            )
            .addStringOption(opt =>
                opt.setName('player')
                    .setDescription('Optional player name filter')
                    .setAutocomplete(true)
            )
            .addIntegerOption(opt =>
                opt.setName('limit')
                    .setDescription('Rows to show')
                    .setMinValue(1)
                    .setMaxValue(15)
            )
    )
    .addSubcommand(sub =>
        sub.setName('profile')
            .setDescription('Show a player KitPvP profile')
            .addStringOption(opt =>
                opt.setName('player')
                    .setDescription('Minecraft username')
                    .setRequired(true)
                    .setAutocomplete(true)
            )
    );

async function autocomplete(interaction) {
    const focused = interaction.options.getFocused();
    if (!focused) return interaction.respond([]);

    try {
        const names = await getToolkitJson('/kitpvp/suggest', { q: focused });
        return interaction.respond(
            (Array.isArray(names) ? names : [])
                .slice(0, 25)
                .map(name => ({ name, value: name }))
        );
    } catch {
        return interaction.respond([]);
    }
}

async function execute(interaction) {
    const sub = interaction.options.getSubcommand();
    await interaction.deferReply();

    if (sub === 'leaderboard') {
        const sort = interaction.options.getString('sort') || 'kills';
        const q = interaction.options.getString('player') || '';
        const limit = interaction.options.getInteger('limit') ?? 10;

        let data;
        try {
            data = await getToolkitJson('/kitpvp/leaderboard', { sort, q, limit });
        } catch (err) {
            console.error('[kitpvp leaderboard] Toolkit API error:', err.message);
            return interaction.editReply('Toolkit KitPvP data is unavailable. Configure `TOOLKIT_API_BASE` or try again later.');
        }

        const rows = Array.isArray(data.items) ? data.items : [];
        if (!rows.length) return interaction.editReply('No KitPvP rows matched that filter.');

        const embed = new EmbedBuilder()
            .setTitle(`KitPvP Leaderboard: ${sort.replaceAll('_', ' ')}`)
            .setColor(0xE67E22)
            .setFooter({ text: 'Toolkit KitPvP data' })
            .setTimestamp();

        rows.forEach((row, index) => {
            embed.addFields({
                name: `#${index + 1} ${row.username || row.uuid}`,
                value: statLine(row),
                inline: false
            });
        });

        const url = toolkitUrl('/kitpvp');
        const components = url
            ? [new ActionRowBuilder().addComponents(
                new ButtonBuilder().setLabel('Open KitPvP').setStyle(ButtonStyle.Link).setURL(url)
            )]
            : [];

        return interaction.editReply({ embeds: [embed], components });
    }

    if (sub === 'profile') {
        const player = interaction.options.getString('player', true);
        let uuid;
        try {
            uuid = await fetchUUIDFromPlayerDB(player);
        } catch (err) {
            return interaction.editReply(`Could not resolve Minecraft user **${player}**.`);
        }

        let data;
        try {
            data = await getToolkitJson('/kitpvp/profile', { u: uuid });
        } catch (err) {
            console.error('[kitpvp profile] Toolkit API error:', err.message);
            return interaction.editReply('Toolkit KitPvP profile data is unavailable. Configure `TOOLKIT_API_BASE` or try again later.');
        }

        const row = data.data;
        if (!data.ok || !row) return interaction.editReply(`No KitPvP profile found for **${player}**.`);

        const embed = new EmbedBuilder()
            .setTitle(`KitPvP: ${row.username || player}`)
            .setColor(0xE67E22)
            .setThumbnail(playerBustUrl(row.username || player))
            .addFields(
                { name: 'Kills', value: fmt.number(row.kills), inline: true },
                { name: 'Deaths', value: fmt.number(row.deaths), inline: true },
                { name: 'Assists', value: fmt.number(row.assists), inline: true },
                { name: 'K/D', value: kd(row.kills, row.deaths), inline: true },
                { name: 'Current KS', value: fmt.number(row.current_killstreak), inline: true },
                { name: 'Best KS', value: fmt.number(row.best_killstreak), inline: true },
                { name: 'Damage', value: fmt.number(row.damage), inline: true },
                { name: 'Damage Taken', value: fmt.number(row.damage_taken), inline: true },
                { name: 'Bow Accuracy', value: `${fmt.number(row.bow_hits)}/${fmt.number(row.bow_shots)}`, inline: true }
            )
            .setFooter({ text: row.updated_at ? `Updated ${new Date(row.updated_at).toLocaleString()}` : 'Toolkit KitPvP data' })
            .setTimestamp();

        const url = toolkitUrl('/players', { u: uuid });
        const components = url
            ? [new ActionRowBuilder().addComponents(
                new ButtonBuilder().setLabel('Open Profile').setStyle(ButtonStyle.Link).setURL(url)
            )]
            : [];

        return interaction.editReply({ embeds: [embed], components });
    }
}

module.exports = { autocomplete, data, execute };

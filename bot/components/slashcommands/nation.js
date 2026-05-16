const {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ComponentType,
    EmbedBuilder,
    SlashCommandBuilder
} = require('discord.js');
const { endpointUrl, postQuery } = require('../commons/api');
const fmt = require('../commons/format');
const { mapUrl, nationFlagUrl, playerBustUrl, toolkitUrl } = require('../commons/links');
const { getAllNations } = require('../../utils/nationCache');

const NATIONS_API = endpointUrl('NATIONS_API', 'nations');
const PAGE_SIZE = 10;

function chunkArray(items, size) {
    const chunks = [];
    for (let i = 0; i < items.length; i += size) {
        chunks.push(items.slice(i, i + size));
    }
    return chunks;
}

async function fetchNationDetails(ids) {
    const out = [];
    for (const chunk of chunkArray(ids, 50)) {
        const data = await postQuery(NATIONS_API, chunk);
        if (Array.isArray(data)) out.push(...data);
    }
    return out;
}

function statValue(nation, by) {
    switch (by) {
        case 'residents': return fmt.number(nation.stats?.numResidents);
        case 'towns': return fmt.number(nation.stats?.numTowns);
        case 'balance': return fmt.gold(nation.stats?.balance);
        case 'allies': return fmt.number(nation.stats?.numAllies);
        case 'enemies': return fmt.number(nation.stats?.numEnemies);
        case 'founded': return fmt.date(nation.timestamps?.registered);
        default: return nation.capital?.name ? `Capital: ${nation.capital.name}` : 'No capital recorded';
    }
}

function relationLine(nation) {
    const allies = fmt.number(nation.stats?.numAllies ?? nation.allies?.length ?? 0);
    const enemies = fmt.number(nation.stats?.numEnemies ?? nation.enemies?.length ?? 0);
    return `Allies: **${allies}**\nEnemies: **${enemies}**`;
}

function nationButtons(nation) {
    const buttons = [];
    const spawn = nation.coordinates?.spawn;

    const profileUrl = toolkitUrl('/nations', { u: nation.uuid });
    if (profileUrl) {
        buttons.push(
            new ButtonBuilder()
                .setLabel('Open Toolkit')
                .setStyle(ButtonStyle.Link)
                .setURL(profileUrl)
        );
    }

    if (spawn?.x != null && spawn?.z != null) {
        buttons.push(
            new ButtonBuilder()
                .setLabel('Map')
                .setStyle(ButtonStyle.Link)
                .setURL(mapUrl(spawn.x, spawn.z, spawn.world || 'world'))
        );
    }

    const flag = nationFlagUrl(nation.name);
    if (flag) {
        buttons.push(
            new ButtonBuilder()
                .setLabel('Flag')
                .setStyle(ButtonStyle.Link)
                .setURL(flag)
        );
    }

    if (nation.discord) {
        buttons.push(
            new ButtonBuilder()
                .setLabel('Nation Discord')
                .setStyle(ButtonStyle.Link)
                .setURL(nation.discord)
        );
    }

    return buttons.length ? [new ActionRowBuilder().addComponents(buttons.slice(0, 5))] : [];
}

function nationEmbed(nation) {
    const embed = new EmbedBuilder()
        .setTitle(nation.name)
        .setColor(0x2D7FF9)
        .setImage(nationFlagUrl(nation.name))
        .setTimestamp()
        .addFields(
            { name: 'King', value: nation.king?.name || 'Unknown', inline: true },
            { name: 'Capital', value: nation.capital?.name || 'No capital', inline: true },
            { name: 'Balance', value: fmt.gold(nation.stats?.balance), inline: true },
            {
                name: 'Population',
                value:
                    `Residents: **${fmt.number(nation.stats?.numResidents)}**\n` +
                    `Towns: **${fmt.number(nation.stats?.numTowns)}**`,
                inline: true
            },
            {
                name: 'Status',
                value:
                    `Public: **${fmt.bool(nation.status?.isPublic)}**\n` +
                    `Open: **${fmt.bool(nation.status?.isOpen)}**\n` +
                    `Neutral: **${fmt.bool(nation.status?.isNeutral)}**`,
                inline: true
            },
            { name: 'Relations', value: relationLine(nation), inline: true }
        )
        .setFooter({ text: `Registered ${fmt.date(nation.timestamps?.registered)}` });

    const kingBust = playerBustUrl(nation.king?.name);
    if (kingBust) {
        embed.setThumbnail(kingBust);
    }

    if (nation.board) {
        embed.setDescription(fmt.truncate(nation.board, 300));
    }

    return embed;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('nation')
        .setDescription('Nation commands')
        .addSubcommand(sub =>
            sub
                .setName('info')
                .setDescription('Show info about a nation')
                .addStringOption(opt =>
                    opt
                        .setName('nation')
                        .setDescription('Nation name or UUID')
                        .setRequired(true)
                        .setAutocomplete(true)
                )
        )
        .addSubcommand(sub =>
            sub
                .setName('list')
                .setDescription('List nations by a stat')
                .addStringOption(opt =>
                    opt
                        .setName('by')
                        .setDescription('Sort criterion')
                        .setRequired(true)
                        .addChoices(
                            { name: 'Name', value: 'name' },
                            { name: 'Founded', value: 'founded' },
                            { name: 'Residents', value: 'residents' },
                            { name: 'Towns', value: 'towns' },
                            { name: 'Balance', value: 'balance' },
                            { name: 'Allies', value: 'allies' },
                            { name: 'Enemies', value: 'enemies' }
                        )
                )
        ),

    async autocomplete(interaction) {
        const focused = interaction.options.getFocused().toLowerCase();
        const choices = getAllNations()
            .map(n => n.name)
            .filter(Boolean)
            .filter(n => n.toLowerCase().startsWith(focused))
            .slice(0, 25)
            .map(name => ({ name, value: name }));
        return interaction.respond(choices);
    },

    async execute(interaction) {
        const sub = interaction.options.getSubcommand();

        if (sub === 'info') {
            const query = interaction.options.getString('nation', true);
            await interaction.deferReply();

            try {
                const [nation] = await postQuery(NATIONS_API, [query]);
                if (!nation) {
                    return interaction.editReply(`Nation **${query}** was not found.`);
                }

                return interaction.editReply({
                    embeds: [nationEmbed(nation)],
                    components: nationButtons(nation)
                });
            } catch (err) {
                console.error('[nation info] API error:', err);
                return interaction.editReply('Could not fetch nation info right now.');
            }
        }

        if (sub === 'list') {
            const by = interaction.options.getString('by', true);
            await interaction.deferReply();

            let nations;
            try {
                const summaries = getAllNations();
                if (!summaries.length) {
                    return interaction.editReply('Nation cache is still warming up. Try again shortly.');
                }

                nations = by === 'name'
                    ? summaries.slice().sort((a, b) => a.name.localeCompare(b.name))
                    : await fetchNationDetails(summaries.map(n => n.uuid || n.name));
            } catch (err) {
                console.error('[nation list] API error:', err);
                return interaction.editReply('Could not fetch nation list right now.');
            }

            switch (by) {
                case 'founded':
                    nations.sort((a, b) => (a.timestamps?.registered || 0) - (b.timestamps?.registered || 0));
                    break;
                case 'residents':
                    nations.sort((a, b) => (b.stats?.numResidents || 0) - (a.stats?.numResidents || 0));
                    break;
                case 'towns':
                    nations.sort((a, b) => (b.stats?.numTowns || 0) - (a.stats?.numTowns || 0));
                    break;
                case 'balance':
                    nations.sort((a, b) => (b.stats?.balance || 0) - (a.stats?.balance || 0));
                    break;
                case 'allies':
                    nations.sort((a, b) => (b.stats?.numAllies || 0) - (a.stats?.numAllies || 0));
                    break;
                case 'enemies':
                    nations.sort((a, b) => (b.stats?.numEnemies || 0) - (a.stats?.numEnemies || 0));
                    break;
            }

            const totalPages = Math.max(1, Math.ceil(nations.length / PAGE_SIZE));
            let page = 0;

            const makeEmbed = () => {
                const slice = nations.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
                const embed = new EmbedBuilder()
                    .setTitle(`Nations by ${by}`)
                    .setColor(0x2D7FF9)
                    .setFooter({ text: `Page ${page + 1}/${totalPages} • ${fmt.number(nations.length)} nations` })
                    .setTimestamp();

                for (const nation of slice) {
                    embed.addFields({
                        name: nation.name,
                        value: statValue(nation, by),
                        inline: false
                    });
                }

                return embed;
            };

            const makeRow = () => new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`nation_list_${by}_${page - 1}`)
                    .setLabel('Prev')
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(page === 0),
                new ButtonBuilder()
                    .setCustomId(`nation_list_${by}_${page + 1}`)
                    .setLabel('Next')
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(page === totalPages - 1)
            );

            await interaction.editReply({ embeds: [makeEmbed()], components: [makeRow()] });
            const msg = await interaction.fetchReply();

            const collector = msg.createMessageComponentCollector({
                componentType: ComponentType.Button,
                time: 2 * 60_000
            });

            collector.on('collect', async i => {
                if (i.user.id !== interaction.user.id) {
                    return i.reply({ content: 'These buttons are not for you.', ephemeral: true });
                }
                const parts = i.customId.split('_');
                page = Number(parts[3]);
                await i.update({ embeds: [makeEmbed()], components: [makeRow()] });
            });

            collector.on('end', async () => {
                const disabledRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId(`nation_list_${by}_end_prev`)
                        .setLabel('Prev')
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(true),
                    new ButtonBuilder()
                        .setCustomId(`nation_list_${by}_end_next`)
                        .setLabel('Next')
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(true)
                );
                await msg.edit({ components: [disabledRow] }).catch(() => {});
            });
        }
    }
};

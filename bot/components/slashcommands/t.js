// bot/components/slashcommands/t.js
const {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ComponentType,
    SlashCommandBuilder
} = require('discord.js');
const { getAllTowns } = require('../../utils/townCache');
const fmt = require('../commons/format');
const { mapUrl, toolkitUrl, townFlagUrl } = require('../commons/links');

const PAGE_SIZE = 10;

function townValue(town, by) {
    switch (by) {
        case 'balance':    return fmt.gold(town.stats?.balance);
        case 'residents':  return fmt.number(town.stats?.numResidents);
        case 'townblocks': return `${fmt.number(town.stats?.numTownBlocks)} / ${fmt.number(town.stats?.maxTownBlocks)}`;
        case 'bankrupt':   return fmt.gold(town.stats?.balance);
        case 'founded':    return fmt.date(town.timestamps?.registered);
        case 'open':       return fmt.bool(town.status?.isOpen);
        case 'public':     return fmt.bool(town.status?.isPublic);
        case 'ruined':     return fmt.bool(town.status?.isRuined);
        default:           return town.nation?.name ? `Nation: ${town.nation.name}` : 'Independent';
    }
}

function townButtons(town) {
    const buttons = [];
    const spawn = town.coordinates?.spawn;

    const profileUrl = toolkitUrl('/towns', { u: town.uuid });
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

    const flag = townFlagUrl(town.name);
    if (flag) {
        buttons.push(
            new ButtonBuilder()
                .setLabel('Flag')
                .setStyle(ButtonStyle.Link)
                .setURL(flag)
        );
    }

    return buttons.length ? [new ActionRowBuilder().addComponents(buttons.slice(0, 5))] : [];
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('t')
        .setDescription('Town commands')
        .addSubcommand(sub =>
            sub
                .setName('info')
                .setDescription('Show info about a town')
                .addStringOption(opt =>
                    opt
                        .setName('town')
                        .setDescription('Town name')
                        .setRequired(true)
                        .setAutocomplete(true)
                )
        )
        .addSubcommand(sub =>
            sub
                .setName('list')
                .setDescription('List towns, sorted or filtered')
                .addStringOption(opt =>
                    opt
                        .setName('by')
                        .setDescription('Criterion')
                        .setRequired(true)
                        .addChoices(
                            { name: 'Name',        value: 'name' },
                            { name: 'Founded',     value: 'founded' },
                            { name: 'Residents',   value: 'residents' },
                            { name: 'Balance',     value: 'balance' },
                            { name: 'Bankrupt',    value: 'bankrupt' },
                            { name: 'TownBlocks',  value: 'townblocks' },
                            { name: 'Open',        value: 'open' },
                            { name: 'Public',      value: 'public' },
                            { name: 'Ruined',      value: 'ruined' }
                        )
                )
        ),

    async autocomplete(interaction) {
        const focused = interaction.options.getFocused().toLowerCase();
        const towns   = getAllTowns();
        const choices = towns
            .map(t => t.name)
            .filter(n => n.toLowerCase().startsWith(focused))
            .slice(0, 25)
            .map(n => ({ name: n, value: n }));
        await interaction.respond(choices);
    },

    async execute(interaction) {
        const sub   = interaction.options.getSubcommand();
        const towns = getAllTowns();

        // ─── info ───────────────────────────────────────────────────────────────
        if (sub === 'info') {
            const name = interaction.options.getString('town');
            const town = towns.find(t => t.name.toLowerCase() === name.toLowerCase());
            if (!town) {
                return interaction.reply({ content: `❌ Town "${name}" not found.`, ephemeral: true });
            }

            const e = new EmbedBuilder()
                .setTitle(town.name)
                .setColor(0x1ABC9C)
                .setImage(townFlagUrl(town.name))
                .setTimestamp()
                .addFields(
                    { name: 'Founder', value: town.founder || '—', inline: true },
                    { name: 'Mayor',   value: town.mayor?.name || '—', inline: true },
                    { name: 'Nation',  value: town.nation?.name || '—', inline: true },
                    {
                        name: 'Stats',
                        value:
                            `Residents: **${fmt.number(town.stats?.numResidents)}**\n` +
                            `Town Blocks: **${fmt.number(town.stats?.numTownBlocks)}** / ${fmt.number(town.stats?.maxTownBlocks)}\n` +
                            `Balance: **${fmt.gold(town.stats?.balance)}**`,
                        inline: false
                    },
                    {
                        name: 'Status',
                        value:
                            `Public: **${fmt.bool(town.status?.isPublic)}**\n` +
                            `Open: **${fmt.bool(town.status?.isOpen)}**\n` +
                            `Neutral: **${fmt.bool(town.status?.isNeutral)}**\n` +
                            `Ruined: **${fmt.bool(town.status?.isRuined)}**\n` +
                            `For Sale: **${fmt.bool(town.status?.isForSale)}**`,
                        inline: false
                    }
                )
                .setFooter({ text: `Registered ${fmt.date(town.timestamps?.registered)}` });

            if (town.board) {
                e.setDescription(fmt.truncate(town.board, 220));
            }

            return interaction.reply({ embeds: [e], components: townButtons(town) });
        }

        // ─── list ────────────────────────────────────────────────────────────────
        if (sub === 'list') {
            const by    = interaction.options.getString('by');
            let  list  = towns.slice();

            // filter or sort
            switch (by) {
                case 'name':
                    list.sort((a, b) => a.name.localeCompare(b.name));
                    break;
                case 'founded':
                    list.sort((a, b) => a.timestamps.registered - b.timestamps.registered);
                    break;
                case 'residents':
                    list.sort((a, b) => b.stats.numResidents - a.stats.numResidents);
                    break;
                case 'balance':
                    list.sort((a, b) => b.stats.balance - a.stats.balance);
                    break;
                case 'bankrupt':
                    list = list
                        .filter(t => t.stats.balance < 0)
                        .sort((a, b) => a.stats.balance - b.stats.balance);
                    break;
                case 'townblocks':
                    list.sort((a, b) => b.stats.numTownBlocks - a.stats.numTownBlocks);
                    break;
                case 'open':
                    list = list.filter(t => t.status.isOpen);
                    break;
                case 'public':
                    list = list.filter(t => t.status.isPublic);
                    break;
                case 'ruined':
                    list = list.filter(t => t.status.isRuined);
                    break;
            }

            if (!list.length) {
                return interaction.reply({ content: `No towns matched **${by}**.`, ephemeral: true });
            }

            const totalPages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
            let   page       = 0;

            const makeEmbed = (page) => {
                const slice = list.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
                const e = new EmbedBuilder()
                    .setTitle(`Towns by ${by}`)
                    .setColor(0x1ABC9C)
                    .setFooter({ text: `Page ${page + 1}/${totalPages} • ${fmt.number(list.length)} towns` })
                    .setTimestamp();

                for (const t of slice) {
                    e.addFields({ name: t.name, value: townValue(t, by), inline: false });
                }

                if (list.length > (page+1)*PAGE_SIZE) {
                    e.addFields({ name: '…', value: `And ${list.length - (page+1)*PAGE_SIZE} more…`, inline: false });
                }

                return e;
            };

            const makeRow = (page) => {
                const prev = new ButtonBuilder()
                    .setCustomId(`t_list_${by}_${page-1}`)
                    .setLabel('← Prev')
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(page === 0);
                const next = new ButtonBuilder()
                    .setCustomId(`t_list_${by}_${page+1}`)
                    .setLabel('Next →')
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(page === totalPages - 1);

                return new ActionRowBuilder().addComponents(prev, next);
            };

            // send initial
            await interaction.deferReply();
            await interaction.editReply({
                embeds: [ makeEmbed(page) ],
                components: [ makeRow(page) ]
            });
            const msg = await interaction.fetchReply();

            // collector
            const collector = msg.createMessageComponentCollector({
                componentType: ComponentType.Button,
                time: 2 * 60_000
            });

            collector.on('collect', async i => {
                if (i.user.id !== interaction.user.id) {
                    return i.reply({ content: '🚫 These buttons aren’t for you.', ephemeral: true });
                }
                const [, , , newPageStr] = i.customId.split('_');
                page = parseInt(newPageStr, 10);
                await i.update({
                    embeds: [ makeEmbed(page) ],
                    components: [ makeRow(page) ]
                });
            });

            collector.on('end', async () => {
                // give each disabled button a distinct customId
                const disabledRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId(`t_list_${by}_end_prev`)
                        .setLabel('← Prev')
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(true),
                    new ButtonBuilder()
                        .setCustomId(`t_list_${by}_end_next`)
                        .setLabel('Next →')
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(true)
                );
                try {
                    await msg.edit({ components: [disabledRow] });
                } catch (err) {
                    console.error('[t] failed to disable buttons:', err);
                    // swallow so bot doesn’t crash
                }
            });

        }
    }
};

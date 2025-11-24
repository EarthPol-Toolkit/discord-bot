// bot/components/slashcommands/t.js
const { SlashCommandBuilder } = require('@discordjs/builders');
const {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ComponentType
} = require('discord.js');
const { getAllTowns } = require('../../utils/townCache');

const PAGE_SIZE = 10;

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
                .setTitle(`🏘️ ${town.name}`)
                .setColor(0x1ABC9C)
                .setTimestamp()
                .addFields(
                    { name: 'Founder', value: town.founder || '—', inline: true },
                    { name: 'Mayor',   value: town.mayor?.name || '—', inline: true },
                    { name: 'Nation',  value: town.nation?.name || '—', inline: true },
                    {
                        name: 'Stats',
                        value:
                            `Residents: **${town.stats.numResidents}**\n` +
                            `TownBlocks: **${town.stats.numTownBlocks}** / ${town.stats.maxTownBlocks}\n` +
                            `Balance: **${town.stats.balance}G**`,
                        inline: false
                    },
                    {
                        name: 'Status',
                        value:
                            `Public: **${town.status.isPublic}**\n` +
                            `Open: **${town.status.isOpen}**\n` +
                            `Ruined: **${town.status.isRuined}**`,
                        inline: false
                    }
                );

            return interaction.reply({ embeds: [e] });
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

            const totalPages = Math.ceil(list.length / PAGE_SIZE);
            let   page       = 0;

            const makeEmbed = (page) => {
                const slice = list.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
                const e = new EmbedBuilder()
                    .setTitle(`📋 Towns by ${by} (Page ${page+1}/${totalPages})`)
                    .setColor(0x1ABC9C)
                    .setTimestamp();

                for (const t of slice) {
                    let val;
                    switch (by) {
                        case 'balance':    val = `${t.stats.balance} Gold`; break;
                        case 'residents':  val = `${t.stats.numResidents}`; break;
                        case 'townblocks': val = `${t.stats.numTownBlocks}`; break;
                        case 'bankrupt':   val = `${t.stats.balance} Gold`; break;
                        case 'founded':    val = new Date(t.timestamps.registered).toLocaleDateString(); break;
                        case 'open':       val = `${t.status.isOpen}`; break;
                        case 'public':     val = `${t.status.isPublic}`; break;
                        case 'ruined':     val = `${t.status.isRuined}`; break;
                        default:           val = ''; break;
                    }
                    e.addFields({ name: t.name, value: val, inline: false });
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

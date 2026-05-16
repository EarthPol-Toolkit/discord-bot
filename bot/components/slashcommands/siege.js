const {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder,
    SlashCommandBuilder
} = require('discord.js');
const { getToolkitJson } = require('../commons/api');
const fmt = require('../commons/format');
const { mapUrl, nationFlagUrl, toolkitUrl, townFlagUrl } = require('../commons/links');

function statusText(siege) {
    if (Number(siege.is_stale_deleted_town) === 1) return 'Town Deleted';
    if (Number(siege.is_active) === 1) return 'Active';
    return 'Ended';
}

function siegeLine(siege) {
    const sessions = `${fmt.number(siege.sessions_completed)}/${fmt.number(siege.sessions_total || 10)}`;
    const points = `${fmt.number(siege.attacker_points)} - ${fmt.number(siege.defender_points)}`;
    const banner = siege.banner_world != null && siege.banner_x != null && siege.banner_z != null
        ? `[${fmt.number(siege.banner_x)}, ${fmt.number(siege.banner_y)}, ${fmt.number(siege.banner_z)}](${mapUrl(siege.banner_x, siege.banner_z, siege.banner_world, 8)})`
        : 'Unknown';

    return [
        `Status: **${statusText(siege)}**`,
        `Sessions: **${sessions}**`,
        `Points: **${points}**`,
        `Banner: ${banner}`
    ].join('\n');
}

const data = new SlashCommandBuilder()
    .setName('siege')
    .setDescription('Toolkit SiegeWar data')
    .addSubcommand(sub =>
        sub.setName('list')
            .setDescription('List recent or active sieges')
            .addStringOption(opt =>
                opt.setName('state')
                    .setDescription('Siege state')
                    .addChoices(
                        { name: 'Any', value: 'any' },
                        { name: 'Active', value: 'active' },
                        { name: 'Ended', value: 'ended' },
                        { name: 'Stale / Deleted Town', value: 'stale' }
                    )
            )
            .addStringOption(opt =>
                opt.setName('query')
                    .setDescription('Attacker, defender, nation, town, or siege UUID')
            )
            .addIntegerOption(opt =>
                opt.setName('limit')
                    .setDescription('Rows to show')
                    .setMinValue(1)
                    .setMaxValue(10)
            )
    );

async function execute(interaction) {
    await interaction.deferReply();

    const state = interaction.options.getString('state') || 'active';
    const q = interaction.options.getString('query') || '';
    const limit = interaction.options.getInteger('limit') ?? 5;

    let data;
    try {
        data = await getToolkitJson('/sieges/list', {
            state: state === 'any' ? undefined : state,
            q,
            limit
        });
    } catch (err) {
        console.error('[siege list] Toolkit API error:', err.message);
        return interaction.editReply('Toolkit siege data is unavailable. Configure `TOOLKIT_API_BASE` or try again later.');
    }

    const rows = Array.isArray(data.items) ? data.items : [];
    if (!rows.length) return interaction.editReply('No sieges matched that filter.');

    const embed = new EmbedBuilder()
        .setTitle(`Sieges: ${state}`)
        .setColor(state === 'active' ? 0xE74C3C : 0x607D8B)
        .setFooter({ text: 'Toolkit SiegeWar data' })
        .setTimestamp();

    const first = rows[0];
    const firstFlag = nationFlagUrl(first.attacker_nation_name) || townFlagUrl(first.defender_town_name);
    if (firstFlag) embed.setThumbnail(firstFlag);

    for (const siege of rows) {
        const attacker = siege.attacker_nation_name || siege.attacker || 'Unknown attacker';
        const defender = siege.defender_town_name || siege.defender || 'Unknown defender';
        embed.addFields({
            name: `${attacker} vs ${defender}`,
            value: siegeLine(siege),
            inline: false
        });
    }

    const url = toolkitUrl('/sieges');
    const components = url
        ? [new ActionRowBuilder().addComponents(
            new ButtonBuilder().setLabel('Open Sieges').setStyle(ButtonStyle.Link).setURL(url)
        )]
        : [];

    return interaction.editReply({ embeds: [embed], components });
}

module.exports = { data, execute };

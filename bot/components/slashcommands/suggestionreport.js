import {
    SlashCommandBuilder,
    ChannelType,
    AttachmentBuilder,
    PermissionFlagsBits,
} from 'discord.js';

const CARL_BOT_ID = process.env.CARL_BOT_ID || '235148962103951360';
const DEFAULT_SUGGESTIONS_CHANNEL_ID = process.env.DEFAULT_SUGGESTIONS_CHANNEL_ID || null;

// Hard cap to avoid runaway fetch on massive channels
const HARD_CAP = Number(process.env.SUGGESTION_FETCH_CAP || 5000);

export const data = new SlashCommandBuilder()
    .setName('suggestionreport')
    .setDescription('Export Carl-bot suggestions in a channel to CSV and upload it here.')
    .addChannelOption(opt =>
        opt
            .setName('channel')
            .setDescription('Suggestions channel (defaults to env if omitted).')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(false)
    )
    .setDMPermission(false)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild); // adjust if you want wider access

export async function execute(interaction) {
    if (!interaction.inGuild()) {
        return interaction.reply({ content: 'This command can only be used in a server.', ephemeral: true });
    }

    const targetChannel =
        interaction.options.getChannel('channel') ||
        (DEFAULT_SUGGESTIONS_CHANNEL_ID
            ? await interaction.guild.channels.fetch(DEFAULT_SUGGESTIONS_CHANNEL_ID).catch(() => null)
            : null);

    if (!targetChannel || targetChannel.type !== ChannelType.GuildText) {
        return interaction.reply({
            content: 'I could not resolve a valid text channel. Pass a channel or set DEFAULT_SUGGESTIONS_CHANNEL_ID.',
            ephemeral: true,
        });
    }

    const me = await interaction.guild.members.fetchMe();
    const permsTarget = targetChannel.permissionsFor(me);
    const permsHere = interaction.channel.permissionsFor(me);
    if (!permsTarget?.has(PermissionFlagsBits.ViewChannel) || !permsTarget?.has(PermissionFlagsBits.ReadMessageHistory)) {
        return interaction.reply({ content: 'I lack permission to read that channel.', ephemeral: true });
    }
    if (!permsHere?.has(PermissionFlagsBits.AttachFiles) || !permsHere?.has(PermissionFlagsBits.SendMessages)) {
        return interaction.reply({ content: 'I cannot send attachments in this channel.', ephemeral: true });
    }

    await interaction.deferReply();

    try {
        const allMessages = await fetchAllMessages(targetChannel, HARD_CAP);
        const rows = extractSuggestions(allMessages, CARL_BOT_ID);

        const csvBuffer = toCsvBuffer(rows);
        const fileName = `suggestions_${targetChannel.id}.csv`;
        const attachment = new AttachmentBuilder(csvBuffer, { name: fileName });

        await interaction.editReply({
            content: `<@${interaction.user.id}> here is your suggestion report with ${rows.length} rows from <#${targetChannel.id}>.`,
            files: [attachment],
        });
    } catch (err) {
        console.error(err);
        await interaction.editReply(`Sorry, I couldn't generate the report: ${String(err?.message || err)}`);
    }
}

async function fetchAllMessages(ch, cap = 5000) {
    let all = [];
    let lastId = undefined;

    while (true) {
        const fetched = await ch.messages.fetch({ limit: 100, before: lastId }).catch(() => null);
        if (!fetched || fetched.size === 0) break;
        const batch = Array.from(fetched.values());
        all.push(...batch);
        lastId = batch[batch.length - 1].id;
        if (fetched.size < 100) break;
        if (all.length >= cap) break;
    }
    return all;
}

function extractSuggestions(messages, carlBotId) {
    const rows = [];

    for (const msg of messages) {
        if (!msg.author || msg.author.id !== carlBotId) continue;
        const embed = msg.embeds?.[0];
        if (!embed) continue;

        const title = embed.title ?? '';
        const numMatch = title.match(/#(\d+)/);
        const number = numMatch?.[1] ?? '';

        const author = embed.author?.name ?? '';

        const description = String(embed.description ?? '')
            .replace(/\r?\n+/g, ' ')
            .trim();

        const upReact = msg.reactions.cache.find(r => (r.emoji?.name || '').includes('⬆'));
        const downReact = msg.reactions.cache.find(r => (r.emoji?.name || '').includes('⬇'));

        const upVotes = upReact ? Math.max((upReact.count ?? 0) - 1, 0) : 0;
        const downVotes = downReact ? Math.max((downReact.count ?? 0) - 1, 0) : 0;

        const date = msg.createdAt?.toISOString?.() ?? '';

        rows.push({ author, number, description, upVotes, downVotes, date });
    }

    return rows;
}

function toCsvBuffer(rows) {
    const header = ['Author', 'SuggestionNumber', 'Description', 'Upvotes', 'Downvotes', 'Date'];

    const esc = v => {
        const s = String(v ?? '');
        return `"${s.replace(/"/g, '""')}"`;
    };

    const lines = [header.join(',')];
    for (const r of rows) {
        lines.push(
            [esc(r.author), esc(r.number), esc(r.description), esc(r.upVotes), esc(r.downVotes), esc(r.date)].join(',')
        );
    }
    return Buffer.from(lines.join('\n'), 'utf8');
}
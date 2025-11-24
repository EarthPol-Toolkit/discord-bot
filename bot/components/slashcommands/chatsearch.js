// bot/components/slashcommands/chatsearch.js
const { SlashCommandBuilder } = require('@discordjs/builders');
const {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ComponentType
} = require('discord.js');
const axios = require('axios');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('chatsearch')
        .setDescription('Search recent chat logs by various filters')
        .addStringOption(opt =>
            opt
                .setName('uuid')
                .setDescription('Comma‑separated Minecraft UUID(s)')
        )
        .addStringOption(opt =>
            opt
                .setName('username')
                .setDescription('Comma‑separated usernames')
        )
        .addStringOption(opt =>
            opt
                .setName('nickname')
                .setDescription('Comma‑separated nicknames')
        )
        .addStringOption(opt =>
            opt
                .setName('message')
                .setDescription('Comma‑separated message substrings')
        )
        .addStringOption(opt =>
            opt
                .setName('start')
                .setDescription('Start timestamp (YYYY‑MM‑DD HH:mm:ss)')
        )
        .addStringOption(opt =>
            opt
                .setName('end')
                .setDescription('End timestamp (YYYY‑MM‑DD HH:mm:ss)')
        ),

    async execute(interaction) {
        // Use a normal (non-ephemeral) reply so components work
        await interaction.deferReply();

        // Helper to split comma lists
        const split = str => str.split(',').map(s => s.trim()).filter(Boolean);

        // Build query object
        const q = {};
        const uuidRaw     = interaction.options.getString('uuid');
        const usernameRaw = interaction.options.getString('username');
        const nickRaw     = interaction.options.getString('nickname');
        const msgRaw      = interaction.options.getString('message');
        const startRaw    = interaction.options.getString('start');
        const endRaw      = interaction.options.getString('end');

        if (uuidRaw)     q.uuid           = split(uuidRaw);
        if (usernameRaw) q.username       = split(usernameRaw);
        if (nickRaw)     q.nickname       = split(nickRaw);
        if (msgRaw)      q.message        = split(msgRaw);
        if (startRaw)    q.startTimestamp = startRaw;
        if (endRaw)      q.endTimestamp   = endRaw;

        const CHAT_API = process.env.CHAT_API?.trim() || 'https://api.earthpol.com/astra/chat';
        console.log('ChatSearch POST to:', CHAT_API, 'payload:', { query: q });

        let logs;
        try {
            const res = await axios.post(CHAT_API, { query: q });
            logs = res.data;
        } catch (err) {
            console.error('Chat API error:', err);
            return interaction.editReply('❌ Could not fetch chat logs.');
        }

        if (!Array.isArray(logs) || logs.length === 0) {
            return interaction.editReply('ℹ️ No matching chat entries found.');
        }

        const pageSize = 10;
        const totalPages = Math.ceil(logs.length / pageSize);
        let page = 0;

        // Embed generator
        const generateEmbed = (page) => {
            const slice = logs.slice(page * pageSize, (page + 1) * pageSize);
            const embed = new EmbedBuilder()
                .setTitle('💬 Chat Search Results')
                .setDescription(`Showing page ${page + 1}/${totalPages}`)
                .setColor(0x00C0FF)
                .setTimestamp();

            slice.forEach(entry => {
                const ts = new Date(entry.timestamp).toLocaleString();
                const nick = entry.nickname ? ` (${entry.nickname})` : '';
                const channel = entry.channel ? `[${entry.channel.toLowerCase()}] ` : '';
                const idTag = entry.entry_id != null ? `#${entry.entry_id} ` : '';
                embed.addFields({
                    name: `${idTag}${channel}${ts} — ${entry.username}${nick}`,
                    value: entry.message,
                    inline: false
                });
            });
            return embed;
        };

        // Button row generator
        const generateRow = (page) => {
            const prev = new ButtonBuilder()
                .setCustomId(`chat_prev_${page}`)
                .setLabel('← Prev')
                .setStyle(ButtonStyle.Primary)
                .setDisabled(page === 0);
            const next = new ButtonBuilder()
                .setCustomId(`chat_next_${page}`)
                .setLabel('Next →')
                .setStyle(ButtonStyle.Primary)
                .setDisabled(page === totalPages - 1);
            return new ActionRowBuilder().addComponents(prev, next);
        };

        // Send initial message with components
        await interaction.editReply({
            embeds: [generateEmbed(page)],
            components: [generateRow(page)]
        });
        const message = await interaction.fetchReply();

        // Collector
        const collector = message.createMessageComponentCollector({
            componentType: ComponentType.Button,
            time: 2 * 60_000
        });

        collector.on('collect', async i => {
            if (i.user.id !== interaction.user.id) {
                return i.reply({ content: '🚫 These buttons aren’t for you.', ephemeral: true });
            }
            const [ , dir ] = i.customId.split('_');
            page = dir === 'next' ? page + 1 : page - 1;

            try {
                await i.update({
                    embeds: [generateEmbed(page)],
                    components: [generateRow(page)]
                });
            } catch (err) {
                console.error('Error updating chatsearch page:', err);
            }
        });


        collector.on('end', async () => {
            // give them unique IDs so Discord doesn't complain
            const disabledPrev = new ButtonBuilder()
                .setCustomId('disabled_prev')
                .setLabel('← Prev')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(true);

            const disabledNext = new ButtonBuilder()
                .setCustomId('disabled_next')
                .setLabel('Next →')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(true);

            const disabledRow = new ActionRowBuilder().addComponents(disabledPrev, disabledNext);

            try {
                await message.edit({ components: [disabledRow] });
            } catch (err) {
                console.error('Failed to disable chatsearch buttons:', err);
                // optionally notify owner or swallow
            }
        });
    }
};
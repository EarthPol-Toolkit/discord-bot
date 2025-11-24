// src/commands/staff.js
import { SlashCommandBuilder } from '@discordjs/builders';
import { EmbedBuilder }        from 'discord.js';
import axios                   from 'axios';
import fs                      from 'fs';
import path                    from 'path';
import { fileURLToPath }       from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

export const data = new SlashCommandBuilder()
    .setName('staff')
    .setDescription('Staff-related commands')
    .addSubcommand(sub =>
        sub
            .setName('online')
            .setDescription('Show which staff members are currently online')
    )
    .addSubcommand(sub =>
        sub
            .setName('lastonline')
            .setDescription('List staff sorted by last online')
            .addIntegerOption(opt =>
                opt
                    .setName('count')
                    .setDescription('Number of staff to show (default 5)')
                    .setRequired(false)
            )
            .addStringOption(opt =>
                opt
                    .setName('order')
                    .setDescription('Sort order (SQL style)')
                    .addChoices(
                        { name: 'ASC',  value: 'ASC' },
                        { name: 'DESC', value: 'DESC' }
                    )
            )
            .addStringOption(opt =>
                opt
                    .setName('before')
                    .setDescription('Only include staff last online before this date (MM/DD/YYYY)')
                    .setRequired(false)
            )
            .addStringOption(opt =>
                opt
                    .setName('since')
                    .setDescription('Only include staff last online since this date (MM/DD/YYYY)')
                    .setRequired(false)
            )
    );

export async function execute(interaction) {
    await interaction.deferReply();

    // Load staff identifiers
    const staffFile = path.join(__dirname, '../../utils/staff.txt');
    let identifiers;
    try {
        identifiers = fs
            .readFileSync(staffFile, 'utf8')
            .split(/\r?\n/)
            .map(line => line.trim())
            .filter(line => line && !line.startsWith('#'));
    } catch (err) {
        console.error('Failed to read staff.txt:', err);
        return interaction.editReply('❌ Could not load the staff list.');
    }

    // Fetch staff data
    let players = [];
    try {
        const res = await axios.post(
            process.env.PLAYERS_API || 'https://api.earthpol.com/astra/players',
            { query: identifiers }
        );
        players = Array.isArray(res.data) ? res.data : [];
    } catch (err) {
        console.error('EarthPol API error:', err);
        return interaction.editReply('❌ Failed to fetch staff data.');
    }

    const sub = interaction.options.getSubcommand();

    if (sub === 'online') {
        const online = players.filter(p => p.status?.isOnline);
        const embed = new EmbedBuilder()
            .setTitle('🛡️ Online Staff')
            .setColor(online.length ? 0x00ff00 : 0x888888)
            .setDescription(
                online.length
                    ? online.map(p => `• ${p.name}`).join('\n')
                    : 'No staff online at the moment.'
            )
            .setTimestamp()
            .setFooter({ text: process.env.TOOLKIT_FOOTER || '' });
        return interaction.editReply({ embeds: [embed] });
    }

    // /staff lastonline
    if (sub === 'lastonline') {
        const count     = interaction.options.getInteger('count') ?? 5;
        const order     = (interaction.options.getString('order') || 'DESC').toUpperCase();
        const beforeStr = interaction.options.getString('before');
        const sinceStr  = interaction.options.getString('since');

        // Filter by timestamp existence
        let filtered = players.filter(p => p.timestamps?.lastOnline);

        // Filter before date
        if (beforeStr) {
            const beforeDate = new Date(beforeStr);
            if (isNaN(beforeDate)) {
                return interaction.editReply('❌ Invalid date for `before`. Use MM/DD/YYYY.');
            }
            filtered = filtered.filter(p => p.timestamps.lastOnline <= beforeDate.getTime());
        }

        // Filter since date
        if (sinceStr) {
            const sinceDate = new Date(sinceStr);
            if (isNaN(sinceDate)) {
                return interaction.editReply('❌ Invalid date for `since`. Use MM/DD/YYYY.');
            }
            filtered = filtered.filter(p => p.timestamps.lastOnline >= sinceDate.getTime());
        }

        // Sort and limit
        const sorted = filtered
            .sort((a, b) => {
                const aTime = a.timestamps.lastOnline;
                const bTime = b.timestamps.lastOnline;
                return order === 'ASC' ? aTime - bTime : bTime - aTime;
            })
            .slice(0, count);

        // Build description
        const description = sorted
            .map(p => {
                const date = new Date(p.timestamps.lastOnline).toLocaleString();
                return `• ${p.name} — Last: ${date}`;
            })
            .join('\n');

        const embed = new EmbedBuilder()
            .setTitle(`🕒 Staff LastOnline (${order} LIMIT ${count})`)
            .setColor(0x0099ff)
            .setDescription(description || 'No data available.')
            .setTimestamp()
            .setFooter({ text: process.env.TOOLKIT_FOOTER || '' });

        return interaction.editReply({ embeds: [embed] });
    }
}

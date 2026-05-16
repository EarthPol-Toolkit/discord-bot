// bot/components/slashcommands/toolkit.js
const { EmbedBuilder, SlashCommandBuilder } = require('discord.js');
const { endpointUrl, getJson } = require('../commons/api');
const fmt = require('../commons/format');
const { loadConfig, saveConfig } = require('../../utils/guildConfig');

function extractId(input) {
    const match = String(input || '').match(/^<(?:(?:@(?:&|!)?)|#)(\d+)>$/);
    return match ? match[1] : String(input || '').trim();
}

async function fetchNationSummary(value) {
    const allNations = await getJson(endpointUrl('NATIONS_API', 'nations'));
    const wanted = String(value || '').toLowerCase();
    const exact = allNations.find(n =>
        String(n.name).toLowerCase() === wanted ||
        String(n.uuid).toLowerCase() === wanted
    );

    if (exact) return { nation: exact, suggestions: [] };

    const suggestions = allNations
        .filter(n => String(n.name).toLowerCase().includes(wanted))
        .slice(0, 5)
        .map(n => n.name);

    return { nation: null, suggestions };
}

async function canManageToolkit(interaction, config) {
    const member = await interaction.guild.members.fetch(interaction.user.id);
    const isOwner = interaction.user.id === interaction.guild.ownerId;
    const isAdmin = config.toolkit_admins.users.includes(interaction.user.id)
        || member.roles.cache.some(r => config.toolkit_admins.roles.includes(r.id));
    return isOwner || isAdmin;
}

function roleMention(id) {
    return id ? `<@&${id}>` : 'Not set';
}

function channelMention(id) {
    return id ? `<#${id}>` : 'Not set';
}

async function buildConfigEmbed(guild, config) {
    let nationName = 'Not set';
    if (config.nation_uuid) {
        try {
            const allNations = await getJson(endpointUrl('NATIONS_API', 'nations'));
            nationName = allNations.find(n => n.uuid === config.nation_uuid)?.name || config.nation_uuid;
        } catch {
            nationName = config.nation_uuid;
        }
    }

    return new EmbedBuilder()
        .setTitle(`Toolkit Config: ${guild.name}`)
        .setColor(0x1ABC9C)
        .addFields(
            { name: 'Nation', value: nationName, inline: false },
            {
                name: 'Roles',
                value: [
                    `Citizen: ${roleMention(config.role_citizen_id)}`,
                    `Allied: ${roleMention(config.role_allied_id)}`,
                    `Enemy: ${roleMention(config.role_enemy_id)}`,
                    `Linked: ${roleMention(config.role_linked_id)}`,
                    `Vote Party: ${roleMention(config.role_vote_party_id)}`
                ].join('\n'),
                inline: false
            },
            {
                name: 'Vote Party',
                value: [
                    `Channel: ${channelMention(config.channel_vote_party_id)}`,
                    `Alert threshold: ${config.vote_party_amount ? fmt.number(config.vote_party_amount) : 'Not set'} votes remaining`,
                    `Already notified: ${fmt.bool(config.vote_party_notified)}`
                ].join('\n'),
                inline: false
            },
            {
                name: 'Toolkit Admins',
                value: [
                    `Roles: ${config.toolkit_admins.roles.length ? config.toolkit_admins.roles.map(roleMention).join(', ') : 'None'}`,
                    `Users: ${config.toolkit_admins.users.length ? config.toolkit_admins.users.map(id => `<@${id}>`).join(', ') : 'None'}`
                ].join('\n'),
                inline: false
            }
        )
        .setTimestamp();
}

async function findOrCreateRole(guild, name, color) {
    const existing = guild.roles.cache.find(role => role.name === name);
    if (existing) return existing;
    return guild.roles.create({ name, color, reason: 'Toolkit role setup' });
}

const data = new SlashCommandBuilder()
    .setName('toolkit')
    .setDescription('Configure guild-specific Toolkit settings')
    .addSubcommand(sub => sub
        .setName('show')
        .setDescription('Show this server Toolkit configuration'))
    .addSubcommand(sub => sub
        .setName('set')
        .setDescription('Set a configuration value')
        .addStringOption(opt => opt
            .setName('key')
            .setDescription('What to set')
            .setRequired(true)
            .addChoices(
                { name: 'Nation', value: 'nation' },
                { name: 'Role: Citizen', value: 'role_citizen' },
                { name: 'Role: Allied', value: 'role_allied' },
                { name: 'Role: Enemy', value: 'role_enemy' },
                { name: 'Role: Linked', value: 'role_linked' },
                { name: 'Role: Vote Party', value: 'role_vote_party' },
                { name: 'Channel: Vote Party', value: 'channel_vote_party' },
                { name: 'Setting: Vote Party Amount', value: 'vote_party_amount' }
            ))
        .addStringOption(opt => opt
            .setName('value')
            .setDescription('Nation name, mention, ID, or amount')
            .setRequired(true)))
    .addSubcommand(sub => sub
        .setName('createroles')
        .setDescription('Create Toolkit roles and save their IDs'))
    .addSubcommandGroup(group => group
        .setName('admin')
        .setDescription('Manage toolkit administrators')
        .addSubcommand(sub => sub
            .setName('add')
            .setDescription('Add a toolkit admin role or user')
            .addStringOption(opt => opt
                .setName('type')
                .setDescription('Role or user')
                .setRequired(true)
                .addChoices({ name: 'Role', value: 'role' }, { name: 'User', value: 'user' }))
            .addStringOption(opt => opt
                .setName('id')
                .setDescription('Role ID, user ID, or mention')
                .setRequired(true)))
        .addSubcommand(sub => sub
            .setName('remove')
            .setDescription('Remove a toolkit admin role or user')
            .addStringOption(opt => opt
                .setName('type')
                .setDescription('Role or user')
                .setRequired(true)
                .addChoices({ name: 'Role', value: 'role' }, { name: 'User', value: 'user' }))
            .addStringOption(opt => opt
                .setName('id')
                .setDescription('Role ID, user ID, or mention')
                .setRequired(true))));

async function execute(interaction) {
    if (!interaction.guild) {
        return interaction.reply({ content: 'This command must be used in a server.', ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true });

    const guildId = interaction.guild.id;
    const config = loadConfig(guildId);

    if (!await canManageToolkit(interaction, config)) {
        return interaction.editReply('You do not have permission to use this command.');
    }

    const sub = interaction.options.getSubcommand();
    const group = interaction.options.getSubcommandGroup(false);

    if (sub === 'show') {
        return interaction.editReply({ embeds: [await buildConfigEmbed(interaction.guild, config)] });
    }

    if (sub === 'set') {
        const key = interaction.options.getString('key', true);
        const value = interaction.options.getString('value', true);

        if (key === 'nation') {
            let match;
            try {
                match = await fetchNationSummary(value);
            } catch (err) {
                console.error('[Toolkit] failed to fetch nations:', err);
                return interaction.editReply('Could not retrieve the nation list.');
            }

            if (!match.nation) {
                const sugText = match.suggestions.length
                    ? ` Did you mean: ${match.suggestions.join(', ')}?`
                    : '';
                return interaction.editReply(`Could not find nation "${value}".${sugText}`);
            }

            config.nation_uuid = match.nation.uuid;
            saveConfig(guildId, config);
            return interaction.editReply(`Nation set to **${match.nation.name}** (${match.nation.uuid}).`);
        }

        if (key === 'channel_vote_party') {
            const channelId = extractId(value);
            config.channel_vote_party_id = channelId;
            saveConfig(guildId, config);
            return interaction.editReply(`Vote Party channel set to <#${channelId}>.`);
        }

        if (key === 'vote_party_amount') {
            const amount = Number(value);
            if (!Number.isFinite(amount) || amount <= 0) {
                return interaction.editReply('Vote Party Amount must be a positive number, for example `10`.');
            }

            config.vote_party_amount = amount;
            saveConfig(guildId, config);
            return interaction.editReply(`Vote Party Amount set to **${fmt.number(amount)}** votes remaining.`);
        }

        const mapping = {
            role_citizen: 'role_citizen_id',
            role_allied: 'role_allied_id',
            role_enemy: 'role_enemy_id',
            role_linked: 'role_linked_id',
            role_vote_party: 'role_vote_party_id'
        };

        if (mapping[key]) {
            const id = extractId(value);
            config[mapping[key]] = id;
            saveConfig(guildId, config);
            return interaction.editReply(`Saved ${key.replaceAll('_', ' ')} as <@&${id}>.`);
        }
    }

    if (sub === 'createroles') {
        const guild = interaction.guild;
        const citizen = await findOrCreateRole(guild, 'Citizen', 0x2ECC71);
        const allied = await findOrCreateRole(guild, 'Allied', 0x3498DB);
        const enemy = await findOrCreateRole(guild, 'Enemy', 0xE74C3C);
        const linked = await findOrCreateRole(guild, 'Linked', 0x95A5A6);
        const voteParty = await findOrCreateRole(guild, 'Vote Party', 0xF1C40F);

        config.role_citizen_id = citizen.id;
        config.role_allied_id = allied.id;
        config.role_enemy_id = enemy.id;
        config.role_linked_id = linked.id;
        config.role_vote_party_id = voteParty.id;
        saveConfig(guildId, config);

        const embed = new EmbedBuilder()
            .setTitle('Toolkit Roles Saved')
            .setColor(0x2ECC71)
            .setDescription(
                [
                    `Citizen: <@&${citizen.id}>`,
                    `Allied: <@&${allied.id}>`,
                    `Enemy: <@&${enemy.id}>`,
                    `Linked: <@&${linked.id}>`,
                    `Vote Party: <@&${voteParty.id}>`
                ].join('\n')
            )
            .setTimestamp();

        return interaction.editReply({ embeds: [embed] });
    }

    if (group === 'admin') {
        const action = sub;
        const type = interaction.options.getString('type', true);
        const id = extractId(interaction.options.getString('id', true));
        const key = type === 'role' ? 'roles' : 'users';
        const list = config.toolkit_admins[key];

        if (action === 'add') {
            if (!list.includes(id)) list.push(id);
            saveConfig(guildId, config);
            return interaction.editReply(`Added ${type} <@${type === 'role' ? '&' : ''}${id}> to toolkit admins.`);
        }

        config.toolkit_admins[key] = list.filter(x => x !== id);
        saveConfig(guildId, config);
        return interaction.editReply(`Removed ${type} <@${type === 'role' ? '&' : ''}${id}> from toolkit admins.`);
    }

    return interaction.editReply('Unknown subcommand.');
}

module.exports = { data, execute };

// bot/events/guildMemberAdd.js
const { endpointUrl, postQuery, fetchUsernameFromPlayerDB } = require('../components/commons/api');
const { loadConfig } = require('../utils/guildConfig');

const DISCORD_LINK_API = endpointUrl('DISCORD_LINK_API', 'discord');

module.exports = {
    name: 'guildMemberAdd',
    async execute(member) {
        if (member.user.bot || !member.guild) return;

        // Load this guild's config and get the linked-role ID
        const config = loadConfig(member.guild.id);
        const linkedRoleId = config?.role_linked_id;
        if (!linkedRoleId) return;

        try {
            // Check for a Discord→Minecraft link
            const link = await postQuery(DISCORD_LINK_API, [member.id]);
            if (!link.uuid) return;

            // Assign the linked role
            await member.roles.add(linkedRoleId);

            // Fetch and set Minecraft username as nickname
            const username = await fetchUsernameFromPlayerDB(link.uuid);
            await member.setNickname(username);

            console.log(`[Event] Auto-linked ${member.user.tag} as ${username}`);
        } catch (err) {
            console.error(`[Event] guildMemberAdd error for ${member.user.tag}:`, err);
        }
    }
};

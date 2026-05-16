// bot/events/guildCreate.js
const { ensureConfig } = require('../utils/guildConfig');

module.exports = {
    name: 'guildCreate',
    async execute(guild, client) {
        try {
            ensureConfig(guild.id);
            console.log(`🆕 Created default toolkit config for guild ${guild.id}`);
        } catch (err) {
            console.error(`❌ Failed to create config for guild ${guild.id}:`, err);
        }
    }
};

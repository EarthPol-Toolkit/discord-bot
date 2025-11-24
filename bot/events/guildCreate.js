// bot/events/guildCreate.js
const fs   = require('fs');
const path = require('path');

// Directory where per-guild configs live
const GUILDS_DIR = path.join(__dirname, '../guilds');

module.exports = {
    name: 'guildCreate',
    async execute(guild, client) {
        // Ensure guilds directory exists
        if (!fs.existsSync(GUILDS_DIR)) {
            fs.mkdirSync(GUILDS_DIR, { recursive: true });
        }

        const file = path.join(GUILDS_DIR, `${guild.id}.json`);
        if (fs.existsSync(file)) {
            // Config already exists
            return;
        }

        // Write default config
        const defaultConfig = {
            nation_uuid: null,
            role_citizen_id: null,
            role_allied_id: null,
            role_enemy_id: null,
            role_linked_id: null,
            toolkit_admins: { roles: [], users: [] }
        };

        try {
            fs.writeFileSync(file, JSON.stringify(defaultConfig, null, 2));
            console.log(`🆕 Created default toolkit config for guild ${guild.id}`);
        } catch (err) {
            console.error(`❌ Failed to create config for guild ${guild.id}:`, err);
        }
    }
};

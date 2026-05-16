const fs = require('fs');
const path = require('path');

const GUILDS_DIR = path.join(__dirname, '../guilds');

const DEFAULT_CONFIG = {
    nation_uuid: null,
    role_citizen_id: null,
    role_allied_id: null,
    role_enemy_id: null,
    role_linked_id: null,
    role_vote_party_id: null,
    channel_vote_party_id: null,
    vote_party_amount: null,
    vote_party_notified: false,
    toolkit_admins: { roles: [], users: [] }
};

function ensureDir() {
    fs.mkdirSync(GUILDS_DIR, { recursive: true });
}

function configPath(guildId) {
    ensureDir();
    return path.join(GUILDS_DIR, `${guildId}.json`);
}

function normalizeConfig(config = {}) {
    return {
        ...DEFAULT_CONFIG,
        ...config,
        toolkit_admins: {
            roles: Array.isArray(config.toolkit_admins?.roles) ? config.toolkit_admins.roles : [],
            users: Array.isArray(config.toolkit_admins?.users) ? config.toolkit_admins.users : []
        }
    };
}

function loadConfig(guildId) {
    const file = configPath(guildId);
    if (!fs.existsSync(file)) return normalizeConfig();
    return normalizeConfig(JSON.parse(fs.readFileSync(file, 'utf8')));
}

function saveConfig(guildId, config) {
    fs.writeFileSync(configPath(guildId), JSON.stringify(normalizeConfig(config), null, 2));
}

function ensureConfig(guildId) {
    const file = configPath(guildId);
    if (!fs.existsSync(file)) {
        saveConfig(guildId, DEFAULT_CONFIG);
    }
    return loadConfig(guildId);
}

function loadAllConfigs() {
    ensureDir();
    return fs.readdirSync(GUILDS_DIR)
        .filter(file => file.endsWith('.json'))
        .map(file => {
            const guildId = path.basename(file, '.json');
            try {
                return { guildId, config: loadConfig(guildId) };
            } catch (err) {
                console.error(`[GuildConfig] Failed to parse ${file}:`, err.message);
                return null;
            }
        })
        .filter(Boolean);
}

module.exports = {
    DEFAULT_CONFIG,
    GUILDS_DIR,
    ensureConfig,
    loadAllConfigs,
    loadConfig,
    saveConfig
};

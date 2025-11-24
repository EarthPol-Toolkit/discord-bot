// bot/utils/votePartyMonitor.js
const fs    = require('fs');
const path  = require('path');
const axios = require('axios');

const GUILDS_DIR = path.join(__dirname, '../guilds');

const VOTE_API_URL = process.env.VOTE_API_URL || 'https://api.earthpol.com/astra/voting';

const VOTE_PARTY_INTERVAL_MS = 60 * 1000;

function loadAllGuildConfigs() {
    if (!fs.existsSync(GUILDS_DIR)) return [];

    return fs.readdirSync(GUILDS_DIR)
        .filter(f => f.endsWith('.json'))
        .map(file => {
            const guildId = path.basename(file, '.json');
            try {
                const cfg = JSON.parse(
                    fs.readFileSync(path.join(GUILDS_DIR, file), 'utf8')
                );
                return { guildId, config: cfg };
            } catch (err) {
                console.error(`❌ Failed to parse config for guild ${file}:`, err.message);
                return null;
            }
        })
        .filter(Boolean);
}

function saveGuildConfig(guildId, config) {
    if (!fs.existsSync(GUILDS_DIR)) {
        fs.mkdirSync(GUILDS_DIR, { recursive: true });
    }
    const file = path.join(GUILDS_DIR, `${guildId}.json`);
    fs.writeFileSync(file, JSON.stringify(config, null, 2));
}

async function fetchVotingStats() {
    const res = await axios.get(VOTE_API_URL, { timeout: 5000 });
    return res.data;
}

async function checkVoteParty(client) {
    let stats;
    try {
        stats = await fetchVotingStats();
    } catch (err) {
        console.error('❌ Failed to fetch voting stats:', err.message);
        return;
    }

    const votesNeeded = Number(stats.votePartyVotesNeeded);
    const votesReq    = Number(stats.votePartyVotesRequired);

    if (!Number.isFinite(votesNeeded) || !Number.isFinite(votesReq)) {
        console.warn('⚠️ Voting stats did not contain numeric votePartyVotesNeeded / votePartyVotesRequired');
        return;
    }

    const configs = loadAllGuildConfigs();
    if (configs.length === 0) return;

    for (const { guildId, config } of configs) {
        const channelId = config.channel_vote_party_id;
        const roleId    = config.role_vote_party_id;

        let threshold = null;
        if (config.vote_party_amount != null) {
            threshold = Number(config.vote_party_amount);
        }

        if (!channelId || !Number.isFinite(threshold) || threshold <= 0) {
            continue;
        }

        if (typeof config.vote_party_notified !== 'boolean') {
            config.vote_party_notified = false;
        }

        if (votesNeeded > threshold) {
            if (config.vote_party_notified) {
                config.vote_party_notified = false;
                saveGuildConfig(guildId, config);
            }
            continue;
        }

        if (config.vote_party_notified) {
            continue;
        }

        const guild = await client.guilds.fetch(guildId).catch(() => null);
        if (!guild) continue;

        const channel = await guild.channels.fetch(channelId).catch(() => null);
        if (!channel || !channel.isTextBased()) continue;

        const roleMention = roleId ? `<@&${roleId}> ` : '';
        const msg = [
            `${roleMention}`,
            `# Vote Party is getting close!`,
            `There are only **${votesNeeded}** votes left until the Vote Party triggers (total required: **${votesReq}**)! Get online now and vote!`
        ].join(' ');

        try {
            await channel.send({ content: msg });

            config.vote_party_notified = true;
            saveGuildConfig(guildId, config);

            console.log(`📣 Sent vote party alert to guild ${guild.name} (${guild.id})`);
        } catch (err) {
            console.error(`❌ Failed to send vote party alert in guild ${guildId}:`, err.message);
        }
    }
}

function startVotePartyMonitor(client) {
    // Run once on startup, then every minute
    checkVoteParty(client).catch(err => {
        console.error('❌ checkVoteParty error:', err);
    });

    setInterval(() => {
        checkVoteParty(client).catch(err => {
            console.error('❌ checkVoteParty interval error:', err);
        });
    }, VOTE_PARTY_INTERVAL_MS);
}

module.exports = {
    startVotePartyMonitor
};

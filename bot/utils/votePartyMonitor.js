// bot/utils/votePartyMonitor.js
const fs    = require('fs');
const path  = require('path');
const axios = require('axios');

const GUILDS_DIR = path.join(__dirname, '../guilds');

// Global vote API
const VOTE_API_URL = process.env.VOTE_API_URL || 'https://api.earthpol.com/astra/voting';

// Check every 1 minute
const VOTE_PARTY_INTERVAL_MS = 60 * 1000;

// We only want to notify when we cross the threshold from above to below.
// One global "lastVotesNeeded" works because "votes needed" is monotonic
// down to zero, then resets back up when a party triggers.
let lastVotesNeeded = null;

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
        // Optional fields controlled by /toolkit set:
        //   role_vote_party_id
        //   channel_vote_party_id
        //   vote_party_amount (number of votes remaining at which to ping)
        const channelId = config.channel_vote_party_id;
        const roleId    = config.role_vote_party_id;

        let threshold = null;
        if (config.vote_party_amount != null) {
            threshold = Number(config.vote_party_amount);
        }

        // No channel or threshold configured, nothing to do here
        if (!channelId || !Number.isFinite(threshold) || threshold <= 0) {
            continue;
        }

        // Only notify when we cross from "above threshold" to "at or under threshold"
        // Example: threshold = 10
        // lastVotesNeeded = 15, now votesNeeded = 9 -> notify
        // lastVotesNeeded = 8, now votesNeeded = 7 -> no new notify
        if (votesNeeded > threshold) {
            // Not close enough yet for this guild
            continue;
        }
        if (lastVotesNeeded !== null && lastVotesNeeded <= threshold) {
            // We already passed this threshold previously, no spam
            continue;
        }

        // Try to fetch guild
        const guild = await client.guilds.fetch(guildId).catch(() => null);
        if (!guild) {
            continue;
        }

        // Try to fetch channel
        const channel = await guild.channels.fetch(channelId).catch(() => null);
        if (!channel || !channel.isTextBased()) {
            continue;
        }

        const roleMention = roleId ? `<@&${roleId}> ` : '';
        const msg = [
            `${roleMention}Vote Party is getting close!`,
            `There are only **${votesNeeded}** votes left until the Vote Party triggers (total required: **${votesReq}**).`,
            `You asked to be notified at **${threshold}** votes remaining.`
        ].join(' ');

        try {
            await channel.send({ content: msg });
            console.log(`📣 Sent vote party alert to guild ${guild.name} (${guild.id})`);
        } catch (err) {
            console.error(`❌ Failed to send vote party alert in guild ${guildId}:`, err.message);
        }
    }

    // Update global lastVotesNeeded after processing all guilds
    lastVotesNeeded = votesNeeded;
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

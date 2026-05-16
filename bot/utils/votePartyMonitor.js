// bot/utils/votePartyMonitor.js
const axios = require('axios');
const { endpointUrl } = require('../components/commons/api');
const { loadAllConfigs, saveConfig } = require('./guildConfig');

const VOTE_API_URL = endpointUrl('VOTE_API_URL', 'voting');

const VOTE_PARTY_INTERVAL_MS = 60 * 1000;

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

    const configs = loadAllConfigs();
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
                saveConfig(guildId, config);
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
            saveConfig(guildId, config);

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

// listGuildOwners.js
require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');

// Try both common env names so it works with your existing setup
const TOKEN = process.env.BOT_TOKEN || process.env.DISCORD_TOKEN;

if (!TOKEN) {
    console.error('Missing bot token. Set BOT_TOKEN or DISCORD_TOKEN in your .env file.');
    process.exit(1);
}

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds // we only need guild metadata
    ]
});

client.once('ready', async () => {
    console.log(`Logged in as ${client.user.tag}`);
    console.log('Fetching guilds and owners...\n');

    const guilds = [...client.guilds.cache.values()];

    if (guilds.length === 0) {
        console.log('This bot is not in any guilds.');
        process.exit(0);
    }

    for (const guild of guilds) {
        try {
            const ownerId = guild.ownerId;
            let ownerUser = null;

            if (ownerId) {
                // Does not require extra member intents, uses REST
                ownerUser = await client.users.fetch(ownerId);
            }

            const lineParts = [
                `Guild: ${guild.name} (${guild.id})`,
                `Owner ID: ${ownerId || 'unknown'}`,
                `Owner User: ${ownerUser ? `${ownerUser.username} (${ownerUser.tag || ownerUser.id})` : 'unknown'}`
            ];

            console.log(lineParts.join(' | '));
        } catch (err) {
            console.error(`Failed to fetch owner for guild ${guild.id}:`, err.message);
        }
    }

    console.log('\nDone.');
    process.exit(0);
});

client.on('error', (err) => {
    console.error('Client error:', err);
});

client.login(TOKEN).catch(err => {
    console.error('Failed to login:', err.message);
    process.exit(1);
});

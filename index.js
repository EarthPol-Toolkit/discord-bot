require('dotenv').config();
const {
    Client,
    Collection,
    GatewayIntentBits,
    REST,
    Routes
} = require('discord.js');
const fs = require('node:fs');
const path = require('node:path');

require('./bot/utils/townCache');
require('./bot/utils/playerCache');
require('./bot/utils/nationCache');
require('./bot/utils/economyCache');

// build the client
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});



// extend client with command collection
client.commands = new Collection();

// shop monitor
//const monitor = require('./bot/utils/monitor');
// monitor.setClient(client);

// helper to read directory
function dirSync(dir) {
    return fs.readdirSync(dir);
}

// load slash commands
const slashPath = path.join(__dirname, 'bot/components/slashcommands');
for (const file of dirSync(slashPath).filter(f => f.endsWith('.js'))) {
    const cmd = require(path.join(slashPath, file));
    client.commands.set(cmd.data.name, cmd);
}

// load events
const eventsPath = path.join(__dirname, 'bot/events');
for (const file of dirSync(eventsPath).filter(f => f.endsWith('.js'))) {
    const evt = require(path.join(eventsPath, file));
    if (evt.once) {
        client.once(evt.name, (...args) => evt.execute(...args, client));
    } else {
        client.on(evt.name, (...args) => evt.execute(...args, client));
    }
}

// setup REST for command registration
token = process.env.DISCORD_TOKEN;
const rest = new REST().setToken(token);
const commandData = client.commands.map(cmd => cmd.data.toJSON());
const { startScheduler } = require('./bot/utils/syncRoles');
const { startVotePartyMonitor } = require('./bot/utils/votePartyMonitor');
const { notifyOwnerIfAdmin } = require('./bot/utils/notifyOwner');

// register slash commands on bot ready for all guilds
client.once('ready', async () => {
    console.log(`✅ Logged in as ${client.user.tag}`);
    try {
        for (const guild of client.guilds.cache.values()) {
            await rest.put(
                Routes.applicationGuildCommands(process.env.CLIENT_ID, guild.id),
                { body: commandData }
            );
            console.log(`→ Registered commands to guild ${guild.name} (${guild.id})`);

            notifyOwnerIfAdmin(guild, client);
        }
    } catch (err) {
        console.error('❌ Error registering slash commands:', err);
    }

    // Run role sync every x ms
    startScheduler(client);
    startVotePartyMonitor(client);

    // initialize shop monitor
    //await monitor.seedShops();
    //console.log(`Seeded shop cache with ${monitor.getCacheSize()} entries.`);
    //setInterval(monitor.checkShops, 5 * 60 * 1000);
});

// register slash commands when joining a new guild
client.on('guildCreate', async (guild) => {
    try {
        await rest.put(
            Routes.applicationGuildCommands(process.env.CLIENT_ID, guild.id),
            { body: commandData }
        );
        console.log(`→ Registered commands to new guild ${guild.name} (${guild.id})`);

        notifyOwnerIfAdmin(guild, client);
    } catch (err) {
        console.error(`✖ Failed to register on new guild ${guild.id}:`, err);
    }
});

// login
client.login(process.env.DISCORD_TOKEN);

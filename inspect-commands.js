// inspect-commands.js
require('dotenv').config();
const { REST, Routes } = require('discord.js');
const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
    const cmds = await rest.get(
        Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID)
    );
    console.log(JSON.stringify(cmds, null, 2));
})();

const fs   = require('fs');
const path = require('path');
const { PermissionFlagsBits } = require('discord.js');

/**
 * DM the guild owner about an error, but no more often than every 5 days.
 */
async function notifyOwnerOfError(guild, client, error, context = {}) {
    const DATA_DIR = path.join(__dirname, '../.notify');
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

    const file = path.join(DATA_DIR, `${guild.id}.json`);
    let state = { lastNotified: 0 };
    if (fs.existsSync(file)) {
        try { state = JSON.parse(fs.readFileSync(file,'utf8')); }
        catch {}
    }

    const FIVE_DAYS = 5 * 24 * 60 * 60 * 1000;
    const now = Date.now();
    if (now - state.lastNotified < FIVE_DAYS) return;

    const ownerId = guild.ownerId;
    let owner;
    try {
        owner = await client.users.fetch(ownerId);
    } catch {
        console.warn(`⚠️ Cannot fetch owner ${ownerId} of guild ${guild.id}`);
        return;
    }

    const header = `🚨 **Toolkit Sync Error** in **${guild.name}**`;
    const body = [
        header,
        `\`\`\`js\n${error.message || error}\n\`\`\``,
        `Step: ${context.step || context.action || 'unknown'}`,
        context.member ? `Member: ${context.member}` : null,
        context.roleId ? `Role ID: ${context.roleId}` : null,
        `Time: <t:${Math.floor(now/1000)}:F>`
    ]
        .filter(Boolean)
        .join('\n');

    try {
        await owner.send(body);
        state.lastNotified = now;
        fs.writeFileSync(file, JSON.stringify(state, null, 2));
        console.log(`✉️  Notified owner of ${guild.id} about error.`);
    } catch (dmErr) {
        console.error(`❌ Failed to DM owner ${ownerId}:`, dmErr);
    }
}

/**
 * DM the guild owner if this bot has Administrator, but only every 5 days per guild.
 */
async function notifyOwnerIfAdmin(guild, client) {
    const DATA_DIR = path.join(__dirname, '../.notify');
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

    // Separate state file from the error notifier
    const file = path.join(DATA_DIR, `admin-${guild.id}.json`);
    let state = { lastNotified: 0 };
    if (fs.existsSync(file)) {
        try { state = JSON.parse(fs.readFileSync(file, 'utf8')); }
        catch {}
    }

    const now = Date.now();
    const FIVE_DAYS = 5 * 24 * 60 * 60 * 1000;
    if (now - state.lastNotified < FIVE_DAYS) return;

    // Check this bot's member in the guild
    let me;
    try {
        me = guild.members.me || await guild.members.fetch(client.user.id);
    } catch {
        return;
    }
    if (!me) return;

    // If it does not actually have Administrator, nothing to do
    if (!me.permissions.has(PermissionFlagsBits.Administrator)) return;

    const ownerId = guild.ownerId;
    if (!ownerId) return;

    let owner;
    try {
        owner = await client.users.fetch(ownerId);
    } catch {
        return;
    }

    const recommendedPerms = [
        '`View Channels`',
        '`Send Messages`',
        '`Read Message History`',
        '`Use Application Commands` (slash commands)',
        '`Embed Links`',
        '`Manage Roles` (for linked, allied, enemy, and other toolkit roles)',
        '`Manage Nicknames` (for setting Minecraft usernames as nicknames)'
    ];

    const body = [
        `Hi, I am **${client.user.username}**, the toolkit bot in your server **${guild.name}**.`,
        '',
        'I currently have the **Administrator** permission in this server.',
        '',
        'For security and best practices, it is strongly recommended not to give bots full Administrator unless absolutely required.',
        'I do not need Administrator to function correctly.',
        '',
        '**Recommended permissions instead:**',
        recommendedPerms.map(p => `• ${p}`).join('\n'),
        '',
        '**What you should do:**',
        '1. Open **Server Settings → Roles → [my bot role]**.',
        '2. Disable **Administrator**.',
        '3. Enable only the permissions listed above, and make sure my role can see and talk in the channels where you want me to work.',
        '',
        'If anything stops working after tightening my permissions, you can add back only that specific permission rather than turning Administrator back on.'
    ].join('\n');

    try {
        await owner.send(body);
        state.lastNotified = now;
        state.guildId = guild.id;
        state.guildName = guild.name;
        state.ownerId = owner.id;
        state.ownerTag = owner.tag ?? owner.username;
        fs.writeFileSync(file, JSON.stringify(state, null, 2));
        console.log(`✉️  Notified owner of ${guild.id} about Administrator permission.`);
    } catch (err) {
        console.error(`❌ Failed to DM owner ${ownerId} about Administrator permission:`, err);
    }
}

module.exports = { notifyOwnerOfError, notifyOwnerIfAdmin };

const axios = require('axios');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { postQuery } = require('../components/commons/api');
const shopCmd      = require('../components/slashcommands/shop');
const { ownerNames, ownerUUIDs } = shopCmd;


module.exports = {
    name: 'interactionCreate',
    async execute(interaction, client) {
        // ─── BUTTONS: pagination for /shop list ──────────────────────────────────
        if (interaction.isButton() && interaction.customId.startsWith('shop_list_')) {
            // parse customId: shop_list_<prev|next>_<page>
            const [, , dir, pageStr] = interaction.customId.split('_');
            const currentPage = parseInt(pageStr, 10);
            const pageSize    = 3;

            // fetch & sort
            const { data: shops } = await axios.get(process.env.SHOP_API);
            shops.sort((a, b) => b.price - a.price);

            // calculate new page
            const newPage = dir === 'next' ? currentPage + 1 : currentPage - 1;
            const slice   = shops.slice(newPage * pageSize, newPage * pageSize + pageSize);
            const ids     = slice.map(s => s.id);

            // batch fetch details
            const details   = await postQuery(process.env.SHOP_API,     ids.map(String));
            const coords    = details.map(d => [ Math.floor(d.location.x), Math.floor(d.location.z) ]);
            const locations = await postQuery(process.env.LOCATION_API, coords);
            const owners    = await postQuery(process.env.PLAYERS_API,   details.map(d => d.owner));

            // rebuild embed
            const embed = new EmbedBuilder()
                .setTitle(`Shop List (page ${newPage + 1})`)
                .setColor(0x1ABC9C);

            for (const d of details) {
                const itemDisplay = d.item.match(/ItemStack\{(.+)\}/)?.[1] || d.item;
                const priceG      = `${d.price}G`;

                // town/nation/owner
                const locRec = locations.find(l =>
                    l.location.x === Math.floor(d.location.x) &&
                    l.location.z === Math.floor(d.location.z)
                ) || {};
                const parts = [];
                if (locRec.town?.name)   parts.push(`Town: ${locRec.town.name}`);
                if (locRec.nation?.name) parts.push(`Nation: ${locRec.nation.name}`);
                parts.push(`Owner: ${owners.find(o => o.uuid === d.owner)?.name || d.owner}`);
                const detailsLine = parts.join(', ');

                const x = Math.floor(d.location.x), z = Math.floor(d.location.z);

                embed.addFields(
                    { name: `Shop #${d.id}`, value: `**${itemDisplay}**`, inline: true },
                    { name: 'Price',         value: `**${priceG}**`,    inline: true },
                    { name: 'Details',       value: detailsLine,       inline: false },
                    { name: 'Location',      value: `X: ${x}, Z: ${z}`, inline: false },
                    { name: '\u200b',        value: '─────────────',      inline: false }  // separator
                );
            }

            // rebuild buttons
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`shop_list_prev_${newPage}`)
                    .setLabel('<')
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(newPage === 0),
                new ButtonBuilder()
                    .setCustomId(`shop_list_next_${newPage}`)
                    .setLabel('>')
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(shops.length <= (newPage + 1) * pageSize)
            );

            // update the original message
            return interaction.update({ embeds: [embed], components: [row] });
        }

        if (interaction.isButton() && interaction.customId.startsWith('shop_owner_')) {
            // customId: shop_owner_<prev|next>_<uuid>_<page>
            const parts = interaction.customId.split('_');
            const dir   = parts[2];          // 'prev' or 'next'
            const uuid  = parts[3];          // owner UUID
            const page  = parseInt(parts[4], 10);
            const pageSize = 3;

            // fetch & sort shops by this owner
            const { data: shops } = await axios.get(process.env.SHOP_API);
            const filtered = shops
                .filter(s => s.owner === uuid)
                .sort((a, b) => b.price - a.price);

            // compute new page
            const newPage = dir === 'next' ? page + 1 : page - 1;
            const slice   = filtered.slice(newPage * pageSize, newPage * pageSize + pageSize);
            const ids     = slice.map(s => s.id);

            // fetch details, locations, owners
            const details   = await postQuery(process.env.SHOP_API,     ids.map(String));
            const coords    = details.map(d => [ Math.floor(d.location.x), Math.floor(d.location.z) ]);
            const locations = await postQuery(process.env.LOCATION_API, coords);
            const owners    = await postQuery(process.env.PLAYERS_API,   details.map(d => d.owner));

            // build embed
            const ownerIndex = ownerUUIDs.indexOf(uuid);
            const ownerName  = ownerIndex !== -1 ? ownerNames[ownerIndex] : uuid;
            const embed = new EmbedBuilder()
                .setTitle(`Shops by ${ownerName} (page ${newPage + 1})`)
                .setColor(0x1ABC9C);

            for (const d of details) {
                const itemDisplay = d.item.match(/ItemStack\{(.+)\}/)?.[1] || d.item;
                const priceG      = `${d.price}G`;
                const locRec      = locations.find(l =>
                    l.location.x === Math.floor(d.location.x) &&
                    l.location.z === Math.floor(d.location.z)
                ) || {};

                const detailParts = [];
                if (locRec.town?.name)   detailParts.push(`Town: ${locRec.town.name}`);
                if (locRec.nation?.name) detailParts.push(`Nation: ${locRec.nation.name}`);
                detailParts.push(`Owner: ${ownerName}`);

                const x = Math.floor(d.location.x), z = Math.floor(d.location.z);

                embed.addFields(
                    { name: `Shop #${d.id}`, value: `**${itemDisplay}**`,     inline: true },
                    { name: 'Price',         value: `**${priceG}**`,         inline: true },
                    { name: 'Details',       value: detailParts.join(', '),  inline: false },
                    { name: 'Location',      value: `X: ${x}, Z: ${z}`,      inline: false },
                    { name: '\u200b',        value: '─────────────',           inline: false }
                );
            }

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`shop_owner_prev_${uuid}_${newPage}`)
                    .setLabel('<')
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(newPage === 0),
                new ButtonBuilder()
                    .setCustomId(`shop_owner_next_${uuid}_${newPage}`)
                    .setLabel('>')
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(filtered.length <= (newPage + 1) * pageSize)
            );

            return interaction.update({ embeds: [embed], components: [row] });
        }


        // ─── AUTOCOMPLETE ──────────────────────────────────────────────────────────
        if (interaction.isAutocomplete()) {
            const cmd = client.commands.get(interaction.commandName);
            if (cmd && typeof cmd.autocomplete === 'function') {
                return cmd.autocomplete(interaction);
            }
        }

        // ─── SLASH COMMANDS ─────────────────────────────────────────────────────────
        if (!interaction.isChatInputCommand()) return;
        const command = client.commands.get(interaction.commandName);
        if (!command) return;

        try {
            await command.execute(interaction, client);
        } catch (err) {
            console.error(`Error executing ${interaction.commandName}`, err);
            const reply = { content: '❌ There was an error.', ephemeral: true };
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp(reply);
            } else {
                await interaction.reply(reply);
            }
        }
    }
};

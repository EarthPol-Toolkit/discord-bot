const {
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ComponentType
} = require('discord.js');
const fs    = require('fs');
const path  = require('path');
const axios = require('axios');
const { postQuery } = require('../commons/api');

const materials = fs
    .readFileSync(path.join(__dirname, '../../utils/materials.txt'), 'utf-8')
    .split(/\r?\n/)
    .map(line => {
        const m = line.trim().match(/^"(.+?)",?$/);
        return m ? m[1].toUpperCase() : null;
    })
    .filter(Boolean);

// ----- preload owner lists -----
let ownerNames = [], ownerUUIDs = [];
(async () => {
    try {
        const { data: shops } = await axios.get(process.env.SHOP_API);
        ownerUUIDs = Array.from(new Set(shops.map(s => s.owner)));
        const players = await postQuery(process.env.PLAYERS_API, ownerUUIDs);
        ownerNames   = players.map(p => p.name);
        console.log(`[Shop] Loaded ${ownerNames.length} owners`);
    } catch (err) {
        console.error('[Shop] Failed to preload owners:', err);
    }
})();

module.exports = {
    data: new SlashCommandBuilder()
        .setName('shop')
        .setDescription('Shop-related commands')
        .addSubcommand(sub =>
            sub.setName('find')
                .setDescription('Find shops selling an item')
                .addStringOption(opt =>
                    opt.setName('item')
                        .setDescription('Item to search for')
                        .setRequired(true)
                        .setAutocomplete(true)
                )
                .addNumberOption(opt =>
                    opt.setName('minprice')
                        .setDescription('Minimum price (optional)')
                )
                .addNumberOption(opt =>
                    opt.setName('maxprice')
                        .setDescription('Maximum price (optional)')
                )
        )
        .addSubcommand(sub =>
            sub.setName('list')
                .setDescription('List all shops, 3 per page')
        )
        .addSubcommand(sub =>
            sub.setName('owner')
                .setDescription('List shops by owner')
                .addStringOption(opt =>
                    opt.setName('owner')
                        .setDescription('Owner name')
                        .setRequired(true)
                        .setAutocomplete(true)
                )
        ),

    async execute(interaction) {
        const sub = interaction.options.getSubcommand();
        await interaction.deferReply();

        // common fetcher
        const fetchAll = async () => (await axios.get(process.env.SHOP_API)).data;

        // ─── /shop find ─────────────────────────────────────────────
        if (sub === 'find') {
            const query     = interaction.options.getString('item', true).toUpperCase();
            const minPrice  = interaction.options.getNumber('minprice');
            const maxPrice  = interaction.options.getNumber('maxprice');

            let matched = (await fetchAll())
                .filter(s => s.item.toUpperCase().includes(query))
                .filter(s => (minPrice == null || s.price >= minPrice) && (maxPrice == null || s.price <= maxPrice))
                .sort((a, b) => b.price - a.price);

            if (!matched.length) {
                return interaction.editReply(
                    `🔍 No shops found for **${query}**` +
                    (minPrice != null ? `, min ≥ ${minPrice}` : '') +
                    (maxPrice != null ? `, max ≤ ${maxPrice}` : '') +
                    `.`
                );
            }

            // cap to 25
            const slice = matched.slice(0, 25);
            const details = await postQuery(process.env.SHOP_API, slice.map(s => s.id.toString()));
            const coords  = details.map(d => [Math.floor(d.location.x), Math.floor(d.location.z)]);
            const locs    = await postQuery(process.env.LOCATION_API, coords);
            const owners  = await postQuery(process.env.PLAYERS_API, details.map(d => d.owner));

            const embed = new EmbedBuilder()
                .setTitle(`Shops matching **${query}**`)
                .setColor(0x1ABC9C)
                .setFooter({ text: slice.length === 25 ? 'Showing first 25 results' : '' });

            for (const d of details) {
                const item   = d.item.match(/ItemStack\{(.+)\}/)?.[1] || d.item;
                const price  = `${d.price}G`;
                const locRec = locs.find(l => l.location.x === Math.floor(d.location.x) && l.location.z === Math.floor(d.location.z)) || {};
                const parts = [];
                if (locRec.town)   parts.push(`Town: ${locRec.town.name}`);
                if (locRec.nation) parts.push(`Nation: ${locRec.nation.name}`);
                const ownerName = owners.find(o => o.uuid === d.owner)?.name || d.owner;
                parts.push(`Owner: ${ownerName}`);

                embed.addFields(
                    { name: `Shop #${d.id}`, value: `**${item}**`, inline: true },
                    { name: 'Price',         value: `**${price}**`, inline: true },
                    { name: 'Info',          value: parts.join(', '), inline: false },
                    { name: 'Location',      value: `X:${Math.floor(d.location.x)}, Z:${Math.floor(d.location.z)}`, inline: false }
                );
            }

            return interaction.editReply({ embeds: [embed] });
        }

        // ─── /shop list ─────────────────────────────────────────────
        if (sub === 'list') {
            const all = await fetchAll();
            all.sort((a, b) => b.price - a.price);
            const pageSize = 3;
            const page = 0;

            const slice   = all.slice(page * pageSize, (page+1) * pageSize);
            const ids     = slice.map(s => s.id.toString());
            const details = await postQuery(process.env.SHOP_API, ids);
            const coords  = details.map(d => [Math.floor(d.location.x), Math.floor(d.location.z)]);
            const locs    = await postQuery(process.env.LOCATION_API, coords);
            const owners  = await postQuery(process.env.PLAYERS_API, details.map(d => d.owner));

            const embed = new EmbedBuilder().setTitle(`Shop List (page ${page+1})`).setColor(0x1ABC9C);
            for (const d of details) {
                const item = d.item.match(/ItemStack\{(.+)\}/)?.[1] || d.item;
                const price = `${d.price}G`;
                const locRec = locs.find(l => l.location.x === Math.floor(d.location.x) && l.location.z === Math.floor(d.location.z)) || {};
                const ownerName = owners.find(o => o.uuid === d.owner)?.name || d.owner;
                embed.addFields(
                    { name: `Shop #${d.id}`, value: `**${item}**`, inline: true },
                    { name: 'Price',         value: `**${price}**`, inline: true },
                    { name: 'Owner',         value: ownerName,       inline: false },
                    { name: 'Location',      value: `X:${Math.floor(d.location.x)}, Z:${Math.floor(d.location.z)}`, inline: false }
                );
            }

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`shop_list_prev_${page}`)
                    .setLabel('<').setStyle(ButtonStyle.Primary).setDisabled(true),
                new ButtonBuilder()
                    .setCustomId(`shop_list_next_${page}`)
                    .setLabel('>').setStyle(ButtonStyle.Primary).setDisabled(all.length <= (page+1)*pageSize)
            );

            return interaction.editReply({ embeds:[embed], components:[row] });
        }

        // ─── /shop owner ─────────────────────────────────────────────
        if (sub === 'owner') {
            const name = interaction.options.getString('owner', true);
            const idx  = ownerNames.indexOf(name);
            if (idx < 0) return interaction.editReply(`🔍 No owner named **${name}**.`);

            const uuid     = ownerUUIDs[idx];
            const all      = await fetchAll();
            const filtered = all.filter(s => s.owner === uuid).sort((a,b) => b.price - a.price);
            if (!filtered.length) return interaction.editReply(`🔍 **${name}** has no shops.`);

            const pageSize = 3;
            const page = 0;
            const slice    = filtered.slice(page * pageSize, (page+1) * pageSize);
            const ids      = slice.map(s => s.id.toString());
            const details  = await postQuery(process.env.SHOP_API, ids);
            const coords   = details.map(d => [Math.floor(d.location.x), Math.floor(d.location.z)]);
            const locs     = await postQuery(process.env.LOCATION_API, coords);

            const embed = new EmbedBuilder()
                .setTitle(`Shops by ${name} (page ${page+1})`)
                .setColor(0x1ABC9C);
            for (const d of details) {
                const item = d.item.match(/ItemStack\{(.+)\}/)?.[1] || d.item;
                const price = `${d.price}G`;
                const locRec = locs.find(l => l.location.x === Math.floor(d.location.x) && l.location.z === Math.floor(d.location.z)) || {};
                embed.addFields(
                    { name: `Shop #${d.id}`, value: `**${item}**`, inline: true },
                    { name: 'Price',         value: `**${price}**`, inline: true },
                    { name: 'Location',      value: `X:${Math.floor(d.location.x)}, Z:${Math.floor(d.location.z)}`, inline: false }
                );
            }

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`shop_owner_prev_${uuid}_${page}`)
                    .setLabel('<').setStyle(ButtonStyle.Primary).setDisabled(true),
                new ButtonBuilder()
                    .setCustomId(`shop_owner_next_${uuid}_${page}`)
                    .setLabel('>').setStyle(ButtonStyle.Primary)
                    .setDisabled(filtered.length <= (page+1)*pageSize)
            );

            return interaction.editReply({ embeds:[embed], components:[row] });
        }
    },

    async autocomplete(interaction) {
        const sub     = interaction.options.getSubcommand();
        const focused = interaction.options.getFocused().toUpperCase();

        if (sub === 'find') {
            const choices = materials
                .filter(i => i.startsWith(focused))
                .slice(0, 25)
                .map(i => ({ name: i, value: i }));
            return interaction.respond(choices);
        }

        if (sub === 'owner') {
            const choices = ownerNames
                .filter(n => n.toUpperCase().startsWith(focused))
                .slice(0, 25)
                .map(n => ({ name: n, value: n }));
            return interaction.respond(choices);
        }
    }
};

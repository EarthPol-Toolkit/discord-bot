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
const { endpointUrl, getToolkitJson, postQuery } = require('../commons/api');
const fmt = require('../commons/format');
const { textureUrl, toolkitUrl } = require('../commons/links');

const SHOP_API = endpointUrl('SHOP_API', 'shops');
const LOCATION_API = endpointUrl('LOCATION_API', 'location');
const PLAYERS_API = endpointUrl('PLAYERS_API', 'players');

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
if (process.env.CHECK_COMMANDS !== '1') {
    (async () => {
        try {
            const { data: shops } = await axios.get(SHOP_API);
            ownerUUIDs = Array.from(new Set(shops.map(s => s.owner)));
            const players = await postQuery(PLAYERS_API, ownerUUIDs);
            ownerNames   = players.map(p => p.name);
            console.log(`[Shop] Loaded ${ownerNames.length} owners`);
        } catch (err) {
            console.error('[Shop] Failed to preload owners:', err);
        }
    })();
}

const command = {
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
        )
        .addSubcommand(sub =>
            sub.setName('market')
                .setDescription('Browse Toolkit market depth for an item')
                .addStringOption(opt =>
                    opt.setName('item')
                        .setDescription('Material to search for')
                        .setRequired(true)
                        .setAutocomplete(true)
                )
                .addStringOption(opt =>
                    opt.setName('type')
                        .setDescription('Shop side')
                        .addChoices(
                            { name: 'Selling', value: 'SELLING' },
                            { name: 'Buying', value: 'BUYING' }
                        )
                )
                .addIntegerOption(opt =>
                    opt.setName('limit')
                        .setDescription('Rows to show')
                        .setMinValue(1)
                        .setMaxValue(10)
                )
        )
        .addSubcommand(sub =>
            sub.setName('traderoutes')
                .setDescription('Find profitable buy/sell routes from Toolkit data')
                .addStringOption(opt =>
                    opt.setName('item')
                        .setDescription('Optional material filter')
                        .setAutocomplete(true)
                )
                .addNumberOption(opt =>
                    opt.setName('minprofit')
                        .setDescription('Minimum profit per item')
                )
                .addIntegerOption(opt =>
                    opt.setName('limit')
                        .setDescription('Routes to show')
                        .setMinValue(1)
                        .setMaxValue(10)
                )
        ),

    async execute(interaction) {
        const sub = interaction.options.getSubcommand();
        await interaction.deferReply();

        // common fetcher
        const fetchAll = async () => (await axios.get(SHOP_API)).data;

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
            const details = await postQuery(SHOP_API, slice.map(s => s.id.toString()));
            const coords  = details.map(d => [Math.floor(d.location.x), Math.floor(d.location.z)]);
            const locs    = await postQuery(LOCATION_API, coords);
            const owners  = await postQuery(PLAYERS_API, details.map(d => d.owner));

            const embed = new EmbedBuilder()
                .setTitle(`Shops matching ${query}`)
                .setColor(0x1ABC9C)
                .setFooter({ text: slice.length === 25 ? 'Showing first 25 results' : '' });

            for (const d of details) {
                const item   = fmt.cleanItemStack(d.item);
                const price  = fmt.gold(d.price);
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
            const details = await postQuery(SHOP_API, ids);
            const coords  = details.map(d => [Math.floor(d.location.x), Math.floor(d.location.z)]);
            const locs    = await postQuery(LOCATION_API, coords);
            const owners  = await postQuery(PLAYERS_API, details.map(d => d.owner));

            const embed = new EmbedBuilder().setTitle(`Shop List (page ${page+1})`).setColor(0x1ABC9C);
            for (const d of details) {
                const item = fmt.cleanItemStack(d.item);
                const price = fmt.gold(d.price);
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
            const details  = await postQuery(SHOP_API, ids);
            const coords   = details.map(d => [Math.floor(d.location.x), Math.floor(d.location.z)]);
            const locs     = await postQuery(LOCATION_API, coords);

            const embed = new EmbedBuilder()
                .setTitle(`Shops by ${name} (page ${page+1})`)
                .setColor(0x1ABC9C);
            for (const d of details) {
                const item = fmt.cleanItemStack(d.item);
                const price = fmt.gold(d.price);
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

        // ─── /shop market ───────────────────────────────────────────
        if (sub === 'market') {
            const item = interaction.options.getString('item', true).toUpperCase();
            const type = interaction.options.getString('type') || 'SELLING';
            const limit = interaction.options.getInteger('limit') ?? 5;

            let rows;
            try {
                const data = await getToolkitJson('/shops/marketStacks', { type, q: item, limit });
                rows = Array.isArray(data.items) ? data.items : [];
            } catch (err) {
                console.error('[Shop market] Toolkit API error:', err.message);
                return interaction.editReply('Toolkit market data is unavailable. Configure `TOOLKIT_API_BASE` or try again later.');
            }

            if (!rows.length) {
                return interaction.editReply(`No Toolkit market rows found for **${item}** (${type.toLowerCase()}).`);
            }

            const first = rows[0];
            const embed = new EmbedBuilder()
                .setTitle(`${type === 'BUYING' ? 'Buy Orders' : 'Sell Orders'}: ${item}`)
                .setColor(type === 'BUYING' ? 0xF1C40F : 0x1ABC9C)
                .setFooter({ text: 'Toolkit market data' })
                .setTimestamp();
            const marketIcon = textureUrl(first.material);
            if (marketIcon) embed.setThumbnail(marketIcon);

            for (const row of rows) {
                const label = row.canonical_key || row.material;
                embed.addFields({
                    name: `${fmt.materialLabel(label)} x${fmt.number(row.stack_size || 1)}`,
                    value: [
                        `Best: **${fmt.gold(row.best_price)}**`,
                        `Avg: **${fmt.gold(row.avg_price)}**`,
                        `Shops: **${fmt.number(row.in_stock_shops ?? row.shops)}** in stock`,
                        `Known stock: **${fmt.number(row.total_stock_known ?? 0)}**`
                    ].join('\n'),
                    inline: false
                });
            }

            const marketUrl = toolkitUrl('/shops', { q: item });
            const components = marketUrl
                ? [new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setLabel('Open Market')
                        .setStyle(ButtonStyle.Link)
                        .setURL(marketUrl)
                )]
                : [];

            return interaction.editReply({ embeds: [embed], components });
        }

        // ─── /shop traderoutes ──────────────────────────────────────
        if (sub === 'traderoutes') {
            const item = interaction.options.getString('item')?.toUpperCase() || '';
            const minProfit = interaction.options.getNumber('minprofit') ?? 0;
            const limit = interaction.options.getInteger('limit') ?? 5;

            let rows;
            try {
                const data = await getToolkitJson('/shops/tradeRoutes', {
                    q: item,
                    minProfitPerItem: minProfit,
                    limit
                });
                rows = Array.isArray(data.items) ? data.items : [];
            } catch (err) {
                console.error('[Shop traderoutes] Toolkit API error:', err.message);
                return interaction.editReply('Toolkit trade-route data is unavailable. Configure `TOOLKIT_API_BASE` or try again later.');
            }

            if (!rows.length) {
                return interaction.editReply('No profitable Toolkit trade routes matched that filter.');
            }

            const embed = new EmbedBuilder()
                .setTitle(item ? `Trade Routes: ${item}` : 'Trade Routes')
                .setColor(0x9B59B6)
                .setFooter({ text: `Minimum profit per item: ${fmt.gold(minProfit)}` })
                .setTimestamp();
            const routeIcon = textureUrl(rows[0].material);
            if (routeIcon) embed.setThumbnail(routeIcon);

            for (const row of rows) {
                const buyTown = row.buy_from_town_name || 'Unknown town';
                const sellTown = row.sell_to_town_name || 'Unknown town';
                embed.addFields({
                    name: `${fmt.materialLabel(row.canonical_key || row.material)} - ${fmt.gold(row.profit_per_stack_64)} per stack`,
                    value: [
                        `Buy: **${fmt.gold(row.buy_from_price_per_item)}/item** from #${row.buy_from_shop_id} (${buyTown})`,
                        `Sell: **${fmt.gold(row.sell_to_price_per_item)}/item** to #${row.sell_to_shop_id} (${sellTown})`,
                        `Profit/item: **${fmt.gold(row.profit_per_item)}**`,
                        `Max tradeable: **${fmt.number(row.max_tradeable_items)}** items`
                    ].join('\n'),
                    inline: false
                });
            }

            const routesUrl = toolkitUrl('/trade-routes');
            const components = routesUrl
                ? [new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setLabel('Open Routes')
                        .setStyle(ButtonStyle.Link)
                        .setURL(routesUrl)
                )]
                : [];

            return interaction.editReply({ embeds: [embed], components });
        }
    },

    async autocomplete(interaction) {
        const sub     = interaction.options.getSubcommand();
        const focused = interaction.options.getFocused().toUpperCase();

        if (sub === 'find' || sub === 'market' || sub === 'traderoutes') {
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

Object.defineProperties(command, {
    ownerNames: { get: () => ownerNames },
    ownerUUIDs: { get: () => ownerUUIDs }
});

module.exports = command;

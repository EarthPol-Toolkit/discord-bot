// bot/components/slashcommands/status.js
const {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder,
    SlashCommandBuilder
} = require('discord.js');
const { endpointUrl, getJson } = require('../commons/api');
const fmt = require('../commons/format');
const { toolkitUrl } = require('../commons/links');
const { getEconomyCache, waitReady: waitEco } = require('../../utils/economyCache');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('status')
        .setDescription('Show current server status with total economy'),

    async execute(interaction) {
        await interaction.deferReply();

        try {
            // ─── fetch core status ───────────────────────────────────────────────
            const data = await getJson(endpointUrl('SERVER_API', ''));
            const { version, moonPhase, time: tObj, status, stats } = data;
            const { newDayTime, serverTimeOfDay, stormDuration, thunderDuration, time: tickTime, eraDate, eraDay } = tObj;

            // ─── build base embed ────────────────────────────────────────────────
            const nextDaySecs = newDayTime - serverTimeOfDay;
            let tod = tickTime<6000?'Morning': tickTime<12000?'Noon': tickTime<18000?'Afternoon':'Night';

            let weatherLabel, weatherIcon, weatherDurTicks;
            if(status.hasStorm){
                if (status.isThundering) {
                    weatherLabel='Thunderstorm'; weatherIcon='thunderstorm.png'; weatherDurTicks=thunderDuration;
                } else {
                    weatherLabel='Storm'; weatherIcon='rain.png'; weatherDurTicks=stormDuration;
                }
            } else {
                weatherLabel='Clear'; weatherIcon='sun.png'; weatherDurTicks=stormDuration;
            }

            const moonUrl = `https://cdn.earthpol.com/img/moon_phase/${moonPhase}.png`;
            const weatherUrl = `https://cdn.earthpol.com/img/weather/${weatherIcon}`;

            const embed = new EmbedBuilder()
                .setTitle('EarthPol Status')
                .setColor(0x1ABC9C)
                .setThumbnail(moonUrl)
                .setDescription([
                    `**${stats.numOnlinePlayers}/${stats.maxPlayers}** players online`,
                    `${weatherLabel} weather, ${tod.toLowerCase()} in-game`
                ].join('\n'))
                .addFields(
                    { name:'Version',        value:version,                                      inline:true },
                    { name:'Time of Day',    value:`${tod} (${fmt.ticks(24000-tickTime)})`,      inline:true },
                    { name:'Era Time',       value:`${eraDate} (Day ${eraDay})`,                  inline:true },
                    { name:'Towny Day In',   value:fmt.durationSeconds(nextDaySecs),             inline:true },
                    { name:'Players Online', value:`${fmt.number(stats.numOnlinePlayers)}/${fmt.number(stats.maxPlayers)}`, inline:true },
                    { name:'Residents',      value:fmt.number(stats.numResidents),               inline:true },
                    { name:'Towns',          value:fmt.number(stats.numTowns),                   inline:true },
                    { name:'Nations',        value:fmt.number(stats.numNations),                 inline:true },
                    { name:'Mob Spawning',   value: status.mobSpawning?'On':'Off',               inline:true }
                );

            if (weatherDurTicks != null) {
                embed.addFields({
                    name:`${weatherLabel} Duration`,
                    value: fmt.ticks(weatherDurTicks),
                    inline: true
                });
            }

            // ─── wait for economy to be ready ────────────────────────────────────
            await waitEco();
            const { playerSum, townSum, nationSum, grandSum, updatedAt } = getEconomyCache();

            embed.addFields(
                { name:'Total Economy', value:fmt.gold(grandSum), inline:false },
                { name:'Players Sum',   value:fmt.gold(playerSum), inline:true  },
                { name:'Towns Sum',     value:fmt.gold(townSum),   inline:true  },
                { name:'Nations Sum',   value:fmt.gold(nationSum), inline:true  }
            )
                .setFooter({
                    text: `Economy last updated ${updatedAt ? new Date(updatedAt).toLocaleTimeString() : 'unknown'}`,
                    iconURL: weatherUrl
                })
                .setTimestamp();

            const components = [];
            const homeUrl = toolkitUrl('/');
            const buttons = [];
            if (homeUrl) {
                buttons.push(
                    new ButtonBuilder()
                        .setLabel('Open Toolkit')
                        .setStyle(ButtonStyle.Link)
                        .setURL(homeUrl)
                );
            }
            buttons.push(
                new ButtonBuilder()
                    .setLabel('Live Map')
                    .setStyle(ButtonStyle.Link)
                    .setURL('https://earthpol.com/map/')
            );
            components.push(new ActionRowBuilder().addComponents(buttons));

            return interaction.editReply({ embeds:[embed], components });
        }
        catch (err) {
            console.error('[Status] error', err);
            return interaction.editReply('❌ Could not fetch full server status right now.');
        }
    }
};

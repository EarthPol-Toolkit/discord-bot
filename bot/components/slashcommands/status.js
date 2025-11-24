// bot/components/slashcommands/status.js
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const axios = require('axios');
const { getEconomyCache, waitReady: waitEco } = require('../../utils/economyCache');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('status')
        .setDescription('Show current server status with total economy'),

    async execute(interaction) {
        await interaction.deferReply();

        try {
            // ─── fetch core status ───────────────────────────────────────────────
            const { data } = await axios.get('https://api.earthpol.com/astra/');
            const { version, moonPhase, time: tObj, status, stats } = data;
            const { newDayTime, serverTimeOfDay, stormDuration, thunderDuration, time: tickTime, eraDate, eraDay } = tObj;

            // ─── build base embed ────────────────────────────────────────────────
            const fmtDur = secs => {
                const h = Math.floor(secs/3600), m = Math.floor((secs%3600)/60), s = secs%60;
                return [h&&`${h}h`, m&&`${m}m`,`${s}s`].filter(Boolean).join(' ');
            };
            const fmtTicks = t => fmtDur(Math.floor(t/20));
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
                .setTitle('🌐 Server Status')
                .setColor(0x1ABC9C)
                .setThumbnail(moonUrl)
                .addFields(
                    { name:'Version',        value:version,                                      inline:true },
                    { name:'Time of Day',    value:`${tod} (${fmtTicks(24000-tickTime)})`,       inline:true },
                    { name:'Era Time',       value:`${eraDate} (Day ${eraDay})`,                  inline:true },
                    { name:'Towny Day In',   value:fmtDur(nextDaySecs),                          inline:true },
                    { name:'Players Online', value:`${stats.numOnlinePlayers}/${stats.maxPlayers}`,inline:true },
                    { name:'Residents',      value:`${stats.numResidents}`,                      inline:true },
                    { name:'Towns',          value:`${stats.numTowns}`,                          inline:true },
                    { name:'Nations',        value:`${stats.numNations}`,                        inline:true },
                    { name:'Mob Spawning',   value: status.mobSpawning?'On':'Off',               inline:true }
                );

            if (weatherDurTicks != null) {
                embed.addFields({
                    name:`${weatherLabel} Duration`,
                    value: fmtTicks(weatherDurTicks),
                    inline: true
                });
            }

            // ─── wait for economy to be ready ────────────────────────────────────
            await waitEco();
            const { playerSum, townSum, nationSum, grandSum, updatedAt } = getEconomyCache();

            embed.addFields(
                { name:'💰 Total Economy', value:`${Math.floor(grandSum)}G`, inline:false },
                { name:' • Players Sum',   value:`${Math.floor(playerSum)}G`, inline:true  },
                { name:' • Towns Sum',     value:`${Math.floor(townSum)}G`,   inline:true  },
                { name:' • Nations Sum',   value:`${Math.floor(nationSum)}G`, inline:true  }
            )
                .setFooter({
                    text: ``,
                    iconURL: weatherUrl
                })
                .setTimestamp();

            return interaction.editReply({ embeds:[embed] });
        }
        catch (err) {
            console.error('[Status] error', err);
            return interaction.editReply('❌ Could not fetch full server status right now.');
        }
    }
};

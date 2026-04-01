require('dotenv').config();

const { 
    Client, 
    GatewayIntentBits, 
    Partials, 
    PermissionsBitField 
} = require('discord.js');

const express = require('express');
const app = express();

// === KEEP RENDER ALIVE ===
app.get('/', (req, res) => {
    res.send('Bot is alive ✅');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🌐 Web server running on port ${PORT}`));

// === DISCORD CLIENT ===
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ],
    partials: [Partials.Message, Partials.Channel, Partials.Reaction]
});

const guildId = process.env.GUILD_ID;

// === VARIABLES ===
let joinQueue = [];
const spamLimit = 5;
let messageCounts = {};

// === FUNCTION: GET LOG CHANNEL ===
function getLogChannel(guild) {
    return guild.channels.cache.find(c => c.name === 'security-log');
}

// === FEATURE 1: ANTI-RAID ===
client.on('guildMemberAdd', member => {
    joinQueue.push(Date.now());

    // keep only last 10s
    joinQueue = joinQueue.filter(t => Date.now() - t < 10000);

    if (joinQueue.length > 3) {
        const logChannel = getLogChannel(member.guild);
        if (logChannel) {
            logChannel.send(`⚠️ **Raid Alert!** ${joinQueue.length} users joined in 10 seconds.`);
        }
    }
});

// === FEATURE 2: SPAM + LINK FILTER + COMMANDS ===
client.on('messageCreate', async message => {
    if (!message.guild || message.author.bot) return;

    const userId = message.author.id;

    // === SPAM TRACKING ===
    if (!messageCounts[userId]) messageCounts[userId] = [];

    messageCounts[userId].push(Date.now());
    messageCounts[userId] = messageCounts[userId].filter(t => Date.now() - t < 10000);

    if (messageCounts[userId].length > spamLimit) {
        try {
            await message.delete();
            const warn = await message.channel.send(`${message.author} ⚠️ Stop spamming!`);
            setTimeout(() => warn.delete().catch(() => {}), 5000);
        } catch {}
        return;
    }

    // === LINK FILTER ===
    if (/(https?:\/\/)/i.test(message.content)) {
        try {
            await message.delete();
            const warn = await message.channel.send(`${message.author} ⚠️ Links are not allowed!`);
            setTimeout(() => warn.delete().catch(() => {}), 5000);
        } catch {}
        return;
    }

    // === ADMIN COMMAND: LOCKDOWN ===
    if (
        message.content.toLowerCase() === '!lockdown' &&
        message.member.permissions.has(PermissionsBitField.Flags.Administrator)
    ) {
        message.guild.channels.cache.forEach(ch => {
            if (ch.permissionOverwrites) {
                ch.permissionOverwrites.edit(
                    message.guild.roles.everyone,
                    { SendMessages: false }
                ).catch(() => {});
            }
        });

        message.channel.send('🚨 **Server is now in LOCKDOWN!**');
    }
});

// === FEATURE 3: ROLE PROTECTION ===
client.on('roleDelete', role => {
    const logChannel = getLogChannel(role.guild);
    if (logChannel) {
        logChannel.send(`⚠️ Role deleted: **${role.name}**`);
    }
});

client.on('roleUpdate', (oldRole, newRole) => {
    const logChannel = getLogChannel(newRole.guild);
    if (logChannel && oldRole.name !== newRole.name) {
        logChannel.send(`⚠️ Role updated: **${oldRole.name} → ${newRole.name}**`);
    }
});

// === FEATURE 4: BAN LOGS ===
client.on('guildBanAdd', (ban) => {
    const logChannel = getLogChannel(ban.guild);
    if (logChannel) {
        logChannel.send(`⚠️ User banned: **${ban.user.tag}**`);
    }
});

// === READY ===
client.once('ready', () => {
    console.log(`✅ ${client.user.tag} is online and protecting your server!`);
});

// === LOGIN ===
client.login(process.env.TOKEN);
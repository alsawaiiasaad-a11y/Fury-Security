require('dotenv').config();

require('node-fetch'); // if using CommonJS

const mongoose = require('mongoose');
const {
    Client,
    GatewayIntentBits,
    Partials,
    PermissionsBitField,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} = require('discord.js');
const express = require('express');
const fetch = require('node-fetch'); // For self-ping

const app = express();

// ================= EXPRESS SERVER =================
const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('Bot is alive ✅'));
// Start web server (for Render ping)
app.listen(PORT, () => {
    console.log(`🌐 Web server running on port ${PORT}`);
});

// Self-ping to prevent sleeping
setInterval(() => {
    fetch(process.env.SELF_URL)
        .then(() => console.log('✅ Pinged self to stay awake'))
        .catch(console.error);
}, 5 * 60 * 1000); // every 5 minutes

// ================= MONGODB CONNECTION =================
const mongoURI = process.env.MONGO_URI;
if (!mongoURI) {
    console.error('❌ MongoDB URI not defined in .env');
    process.exit(1);
}

mongoose.connect(mongoURI)
.then(() => console.log('✅ Connected to MongoDB'))
.catch(err => {
    console.error('❌ MongoDB connection error:', err);
    process.exit(1);
});

// ================= DISCORD CLIENT =================
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ],
    partials: [Partials.Message, Partials.Channel, Partials.Reaction]
});

// ================= VARIABLES =================
let joinQueue = [];
const spamMap = new Map();
const whitelistedUsers = new Set();
const whitelistedRoles = new Set();

let antiSpam = true;
let antiLinks = true;
const allowedDomains = ["youtube.com", "github.com"];

// ================= LOG FUNCTION =================
function log(guild, text) {
    const channel = guild.channels.cache.get(process.env.LOG_CHANNEL_ID)
                  || guild.channels.cache.find(c => c.name === 'security-log');
    if (!channel) return;
    channel.send({ embeds: [new EmbedBuilder().setColor("Red").setDescription(text).setTimestamp()] });
}

// ================= ANTI-RAID =================
client.on('guildMemberAdd', member => {
    joinQueue.push(Date.now());
    joinQueue = joinQueue.filter(t => Date.now() - t < 10000);

    if (joinQueue.length >= 5) {
        member.guild.channels.cache.forEach(ch => {
            if (ch.permissionOverwrites) {
                ch.permissionOverwrites.edit(member.guild.roles.everyone, { SendMessages: false }).catch(() => {});
            }
        });
        log(member.guild, "🚨 RAID DETECTED → SERVER LOCKED");

        setTimeout(() => {
            member.guild.channels.cache.forEach(ch => {
                if (ch.permissionOverwrites) {
                    ch.permissionOverwrites.edit(member.guild.roles.everyone, { SendMessages: true }).catch(() => {});
                }
            });
            log(member.guild, "✅ Server unlocked automatically after raid lock");
        }, 10 * 60 * 1000);
    }
});

// ================= MESSAGE SYSTEM =================
client.on('messageCreate', async message => {
    if (!message.guild || message.author.bot) return;
    const member = message.member;

    // Skip whitelisted users/roles
    if ([...member.roles.cache.keys()].some(r => whitelistedRoles.has(r)) || whitelistedUsers.has(member.id)) return;

    // Anti-Spam
    if (antiSpam) {
        const data = spamMap.get(member.id) || { count: 0, time: Date.now() };
        if (Date.now() - data.time < 5000) data.count++; else data.count = 1;
        data.time = Date.now();
        spamMap.set(member.id, data);
        if (data.count >= 5) {
            await message.delete().catch(() => {}); // حذف الرسالة فقط
            return;
        }
    }

    // Anti-Link
    if (antiLinks && /(https?:\/\/)/i.test(message.content)) {
        const allowed = allowedDomains.some(d => message.content.includes(d));
        if (!allowed && !member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            await message.delete().catch(() => {}); // حذف الرسالة فقط
            return;
        }
    }

    // Commands
    if (!message.content.startsWith('!')) return;
    if (!member.permissions.has(PermissionsBitField.Flags.Administrator)) return;

    const args = message.content.split(' ');
    const cmd = args[0].toLowerCase();

    // Lock / Unlock
    if (cmd === '!lock') { message.channel.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: false }); message.reply('🔒 Channel locked'); }
    if (cmd === '!unlock') { message.channel.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: true }); message.reply('🔓 Channel unlocked'); }

    // Clear messages
    if (cmd === '!clear') { const amount = parseInt(args[1]); if (!amount) return message.reply('Enter number'); await message.channel.bulkDelete(amount).catch(() => {}); }

    // Whitelist user / role
    if (cmd === '!whitelist') { const user = message.mentions.members.first(); if (!user) return; whitelistedUsers.add(user.id); message.reply(`${user.user.tag} whitelisted`); }
    if (cmd === '!unwhitelist') { const user = message.mentions.members.first(); if (!user) return; whitelistedUsers.delete(user.id); message.reply(`${user.user.tag} unwhitelisted`); }
    if (cmd === '!whitelistrole') { const role = message.mentions.roles.first(); if (!role) return; whitelistedRoles.add(role.id); message.reply(`Role ${role.name} whitelisted`); }
    if (cmd === '!unwhitelistrole') { const role = message.mentions.roles.first(); if (!role) return; whitelistedRoles.delete(role.id); message.reply(`Role ${role.name} unwhitelisted`); }

    // Security Dashboard
    if (cmd === '!security') {
        const embed = new EmbedBuilder().setTitle('🛡️ Security Dashboard').setColor('Blue').addFields(
            { name: 'Anti Spam', value: antiSpam ? '✅ ON' : '❌ OFF', inline: true },
            { name: 'Anti Links', value: antiLinks ? '✅ ON' : '❌ OFF', inline: true }
        );
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('toggleSpam').setLabel('Toggle Spam').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('toggleLinks').setLabel('Toggle Links').setStyle(ButtonStyle.Danger)
        );
        message.channel.send({ embeds: [embed], components: [row] });
    }
});

// ================= BUTTONS =================
client.on('interactionCreate', async interaction => {
    if (!interaction.isButton()) return;
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) return interaction.reply({ content: 'Admin only', ephemeral: true });

    if (interaction.customId === 'toggleSpam') antiSpam = !antiSpam;
    if (interaction.customId === 'toggleLinks') antiLinks = !antiLinks;

    interaction.reply({ content: '⚙️ Updated', ephemeral: true });
});

// ================= ROLE / CHANNEL / BAN PROTECTION =================
client.on('roleDelete', role => log(role.guild, `⚠️ Role deleted: ${role.name}`));
client.on('roleUpdate', (oldRole, newRole) => { if (oldRole.name !== newRole.name) log(newRole.guild, `⚠️ Role updated: ${oldRole.name} → ${newRole.name}`); });
client.on('channelDelete', channel => log(channel.guild, `⚠️ Channel deleted: ${channel.name}`));
client.on('guildBanAdd', ban => log(ban.guild, `⚠️ User banned: ${ban.user.tag}`));

// ================= READY =================
client.once('ready', () => console.log(`✅ ${client.user.tag} is online and protecting your server!`));

// ================= LOGIN =================
client.login(process.env.TOKEN);
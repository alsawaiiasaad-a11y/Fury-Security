require('dotenv').config();
const { Client, GatewayIntentBits, Partials } = require('discord.js');

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

// === Variables for Anti-Raid & Spam ===
let joinQueue = [];
const spamLimit = 5;
let messageCounts = {};

// === Feature 1: Anti-Raid ===
client.on('guildMemberAdd', member => {
    joinQueue.push(Date.now());
    joinQueue = joinQueue.filter(t => Date.now() - t < 10000);
    
    if (joinQueue.length > 3) {
        const logChannel = member.guild.channels.cache.find(c => c.name === 'security-log');
        if (logChannel) logChannel.send(`⚠️ Possible raid detected! ${joinQueue.length} new joins in 10s.`);
    }
});

// === Feature 2: Spam & Link Filter ===
client.on('messageCreate', message => {
    if (message.author.bot) return;

    // Spam tracking
    if (!messageCounts[message.author.id]) messageCounts[message.author.id] = [];
    messageCounts[message.author.id].push(Date.now());
    messageCounts[message.author.id] = messageCounts[message.author.id].filter(t => Date.now() - t < 10000);

    if (messageCounts[message.author.id].length > spamLimit) {
        message.delete();
        message.channel.send(`${message.author} ⚠️ Please stop spamming!`).then(msg => setTimeout(() => msg.delete(), 5000));
    }

    // Link filter
    if (/(https?:\/\/)/.test(message.content)) {
        message.delete();
        message.channel.send(`${message.author} ⚠️ Links are not allowed!`).then(msg => setTimeout(() => msg.delete(), 5000));
    }
});

// === Feature 3: Role & Permission Protection ===
client.on('roleDelete', role => {
    const logChannel = role.guild.channels.cache.find(c => c.name === 'security-log');
    if (logChannel) logChannel.send(`⚠️ Role deleted: ${role.name}`);
});

client.on('roleUpdate', (oldRole, newRole) => {
    const logChannel = newRole.guild.channels.cache.find(c => c.name === 'security-log');
    if (logChannel) logChannel.send(`⚠️ Role updated: ${oldRole.name} → ${newRole.name}`);
});

// === Feature 4: Auto-Moderation Logs ===
client.on('guildBanAdd', (guild, user) => {
    const logChannel = guild.channels.cache.find(c => c.name === 'security-log');
    if (logChannel) logChannel.send(`⚠️ User banned: ${user.tag}`);
});

// === Feature 5: Verification Removed ===
// Handled by your auto-role bot, nothing needed here

// === Feature 6: Emergency Lockdown ===
client.on('messageCreate', async message => {
    if (!message.guild) return;
    if (!message.member.permissions.has('Administrator')) return;
    if (message.content.toLowerCase() === '!lockdown') {
        message.guild.channels.cache.forEach(ch => ch.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: false }));
        message.channel.send('🚨 Server is now in lockdown!');
    }
});

// === Ready Event ===
client.once('ready', () => {
    console.log(`✅ ${client.user.tag} is online and protecting your server!`);
});

client.login(process.env.TOKEN);
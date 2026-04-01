require('dotenv').config();

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
const app = express();

// ================= KEEP ALIVE =================
app.get('/', (req, res) => res.send('Bot is alive ✅'));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🌐 Web server running on port ${PORT}`));

// ================= CLIENT =================
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
const warnings = new Map();
const risk = new Map();

// toggles
let antiSpam = true;
let antiLinks = true;

// whitelist links
const allowedDomains = ["youtube.com", "github.com"];

// ================= LOG FUNCTION =================
function log(guild, text) {
    const channel = guild.channels.cache.find(c => c.name === 'security-log');
    if (!channel) return;

    channel.send({
        embeds: [
            new EmbedBuilder()
                .setColor("Red")
                .setDescription(text)
                .setTimestamp()
        ]
    });
}

// ================= WARN SYSTEM =================
function addWarn(member, reason) {
    const id = member.id;

    warnings.set(id, (warnings.get(id) || 0) + 1);
    risk.set(id, (risk.get(id) || 0) + 1);

    const warnCount = warnings.get(id);

    if (warnCount === 2) {
        member.timeout(10 * 60 * 1000).catch(() => {});
    } else if (warnCount === 3) {
        member.kick().catch(() => {});
    } else if (warnCount >= 4) {
        member.ban().catch(() => {});
    }

    log(member.guild, `⚠️ ${member.user.tag} warned (${reason}) | Total: ${warnCount}`);
}

// ================= ANTI RAID =================
client.on('guildMemberAdd', member => {
    joinQueue.push(Date.now());
    joinQueue = joinQueue.filter(t => Date.now() - t < 10000);

    if (joinQueue.length >= 5) {
        member.guild.channels.cache.forEach(ch => {
            if (ch.permissionOverwrites) {
                ch.permissionOverwrites.edit(
                    member.guild.roles.everyone,
                    { SendMessages: false }
                ).catch(() => {});
            }
        });

        log(member.guild, "🚨 RAID DETECTED → SERVER LOCKED");
    }
});

// ================= MESSAGE SYSTEM =================
client.on('messageCreate', async message => {
    if (!message.guild || message.author.bot) return;

    const member = message.member;

    // ================= ANTI SPAM =================
    if (antiSpam) {
        const data = spamMap.get(member.id) || { count: 0, time: Date.now() };

        if (Date.now() - data.time < 5000) data.count++;
        else data.count = 1;

        data.time = Date.now();
        spamMap.set(member.id, data);

        if (data.count >= 5) {
            await message.delete().catch(() => {});
            addWarn(member, "Spam");
            return;
        }
    }

    // ================= ANTI LINK =================
    if (antiLinks && /(https?:\/\/)/i.test(message.content)) {
        const allowed = allowedDomains.some(d => message.content.includes(d));

        if (!allowed && !member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            await message.delete().catch(() => {});
            addWarn(member, "Unauthorized link");
            return;
        }
    }

    // ================= COMMANDS =================
    if (!message.content.startsWith('!')) return;

    if (!member.permissions.has(PermissionsBitField.Flags.Administrator)) return;

    const args = message.content.split(" ");
    const cmd = args[0].toLowerCase();

    // LOCK
    if (cmd === "!lock") {
        message.channel.permissionOverwrites.edit(
            message.guild.roles.everyone,
            { SendMessages: false }
        );

        message.reply("🔒 Channel locked");
    }

    // UNLOCK
    if (cmd === "!unlock") {
        message.channel.permissionOverwrites.edit(
            message.guild.roles.everyone,
            { SendMessages: true }
        );

        message.reply("🔓 Channel unlocked");
    }

    // CLEAR
    if (cmd === "!clear") {
        const amount = parseInt(args[1]);
        if (!amount) return message.reply("Enter number");

        await message.channel.bulkDelete(amount).catch(() => {});
    }

    // WARN
    if (cmd === "!warn") {
        const user = message.mentions.members.first();
        if (!user) return;

        addWarn(user, "Manual warn");
    }

    // SECURITY DASHBOARD
    if (cmd === "!security") {
        const embed = new EmbedBuilder()
            .setTitle("🛡️ Security Dashboard")
            .setColor("Blue")
            .addFields(
                { name: "Anti Spam", value: antiSpam ? "✅ ON" : "❌ OFF", inline: true },
                { name: "Anti Links", value: antiLinks ? "✅ ON" : "❌ OFF", inline: true }
            );

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId("toggleSpam")
                .setLabel("Toggle Spam")
                .setStyle(ButtonStyle.Primary),

            new ButtonBuilder()
                .setCustomId("toggleLinks")
                .setLabel("Toggle Links")
                .setStyle(ButtonStyle.Danger)
        );

        message.channel.send({ embeds: [embed], components: [row] });
    }
});

// ================= BUTTONS =================
client.on('interactionCreate', async interaction => {
    if (!interaction.isButton()) return;

    if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        return interaction.reply({ content: "Admin only", ephemeral: true });
    }

    if (interaction.customId === "toggleSpam") {
        antiSpam = !antiSpam;
    }

    if (interaction.customId === "toggleLinks") {
        antiLinks = !antiLinks;
    }

    interaction.reply({ content: "⚙️ Updated", ephemeral: true });
});

// ================= ROLE PROTECTION =================
client.on('roleDelete', role => {
    log(role.guild, `⚠️ Role deleted: ${role.name}`);
});

client.on('roleUpdate', (oldRole, newRole) => {
    if (oldRole.name !== newRole.name) {
        log(newRole.guild, `⚠️ Role updated: ${oldRole.name} → ${newRole.name}`);
    }
});

// ================= CHANNEL PROTECTION =================
client.on('channelDelete', channel => {
    log(channel.guild, `⚠️ Channel deleted: ${channel.name}`);
});

// ================= BAN LOG =================
client.on('guildBanAdd', ban => {
    log(ban.guild, `⚠️ User banned: ${ban.user.tag}`);
});

// ================= READY =================
client.once('ready', () => {
    console.log(`✅ ${client.user.tag} is online and protecting your server!`);
});

// ================= LOGIN =================
client.login(process.env.TOKEN);
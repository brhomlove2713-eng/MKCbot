const { Client, GatewayIntentBits, PermissionsBitField, REST, Routes, SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

const TOKEN = process.env.TOKEN; // <-- Railway will provide this securely
const CLIENT_ID = "1482518937009782996";
const GUILD_ID = "1263215313839980636";
const MOD_CHANNEL_ID = "1482540401435869215";
const BLACKLIST_CHANNEL_ID = "1482567396798501038";
const BLACKLIST_DB_CHANNEL_ID = "1462528985597608007";
const MOD_ROLE_ID = "1482551564483821639";

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

client.setMaxListeners(0);

// ERROR PROTECTION
process.on("unhandledRejection", err => console.error("Unhandled Rejection:", err));
process.on("uncaughtException", err => console.error("Uncaught Exception:", err));

// DISCORD RECONNECT LOGGING
client.on("shardDisconnect", (event, id) => console.log(`Shard ${id} disconnected`, event));
client.on("shardReconnecting", id => console.log(`Shard ${id} reconnecting...`));
client.on("shardResume", id => console.log(`Shard ${id} resumed`));

// SLASH COMMANDS
const commands = [
    new SlashCommandBuilder()
        .setName("blacklist")
        .setDescription("Blacklist a user")
        .addStringOption(o => o.setName("username").setDescription("User to blacklist").setRequired(true))
        .addStringOption(o => o.setName("reason").setDescription("Reason").setRequired(true))
        .addStringOption(o => o.setName("proof").setDescription("Screenshot URL").setRequired(true))
        .addBooleanOption(o => o.setName("send_for_approval").setDescription("Members must enable this").setRequired(true))
        .toJSON(),

    new SlashCommandBuilder()
        .setName("checkblacklist")
        .setDescription("View all blacklisted usernames")
        .toJSON()
];

const rest = new REST({ version: "10" }).setToken(TOKEN);

(async () => {
    try {
        console.log("Registering slash commands...");
        await rest.put(
            Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
            { body: commands }
        );
        console.log("Slash commands registered.");
    } catch (err) {
        console.error(err);
    }
})();

// DATABASE STORAGE
async function addToBlacklist(entry) {
    const dbChannel = await client.channels.fetch(BLACKLIST_DB_CHANNEL_ID);
    await dbChannel.send(entry);
}

// READY
client.once("ready", () => console.log(`MKCBOT online as ${client.user.tag}`));

// COMMAND HANDLER
client.on("interactionCreate", async interaction => {
    if (interaction.isChatInputCommand()) {
        try {
            if (!interaction.deferred) await interaction.deferReply({ ephemeral: true });

            const isMod = interaction.member.permissions.has(PermissionsBitField.Flags.KickMembers);

            // BLACKLIST COMMAND
            if (interaction.commandName === "blacklist") {
                const username = interaction.options.getString("username");
                const reason = interaction.options.getString("reason");
                const proof = interaction.options.getString("proof");
                const sendForApproval = interaction.options.getBoolean("send_for_approval");

                if (isMod) {
                    const blacklistChannel = await client.channels.fetch(BLACKLIST_CHANNEL_ID);
                    await blacklistChannel.send(`🚫 **Blacklisted:** ${username}\n**Reason:** ${reason}\n**Proof:** ${proof}`);
                    await addToBlacklist(`${username} - ${reason} | Proof: ${proof}`);
                    return interaction.editReply({ content: `✅ ${username} blacklisted.` });
                }

                if (!sendForApproval) {
                    return interaction.editReply({ content: "❌ Members must send for approval." });
                }

                const modChannel = await client.channels.fetch(MOD_CHANNEL_ID);
                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId(`approve_${interaction.user.id}_${username}`)
                        .setLabel("Approve ✅")
                        .setStyle(ButtonStyle.Success),
                    new ButtonBuilder()
                        .setCustomId(`deny_${interaction.user.id}_${username}`)
                        .setLabel("Deny ❌")
                        .setStyle(ButtonStyle.Danger)
                );

                await modChannel.send({
                    content: `<@&${MOD_ROLE_ID}> ⚠ **Blacklist Request** ⚠\nRequested by: ${interaction.user.tag}\nUsername: ${username}\nReason: ${reason}\nProof: ${proof}`,
                    components: [row]
                });

                return interaction.editReply({ content: `📝 Request for **${username}** sent to mods.` });
            }

            // CHECK BLACKLIST
            if (interaction.commandName === "checkblacklist") {
                const dbChannel = await client.channels.fetch(BLACKLIST_DB_CHANNEL_ID);
                const messages = await dbChannel.messages.fetch({ limit: 100 });

                if (!messages.size) return interaction.editReply({ content: "Blacklist is empty." });

                const list = messages.map((m, i) => `${i + 1}. ${m.content}`).join("\n");
                return interaction.editReply({ content: `📄 **Blacklist:**\n${list}` });
            }

        } catch (err) {
            console.error("Command Error:", err);
            if (interaction.deferred || interaction.replied) {
                interaction.editReply({ content: "❌ Something went wrong." });
            } else {
                interaction.reply({ content: "❌ Something went wrong.", ephemeral: true });
            }
        }
    }

    // BUTTON HANDLER
    if (interaction.isButton()) {
        try {
            const [action, requesterId, username] = interaction.customId.split("_");

            if (!interaction.member.permissions.has(PermissionsBitField.Flags.KickMembers)) {
                return interaction.reply({ content: "❌ Only mods can approve.", ephemeral: true });
            }

            const contentLines = interaction.message.content.split("\n");
            const reasonLine = contentLines.find(x => x.includes("Reason"));
            const proofLine = contentLines.find(x => x.includes("Proof"));
            const reason = reasonLine?.replace("Reason: ", "") || "No reason";
            const proof = proofLine?.replace("Proof: ", "") || "No proof";

            if (action === "approve") {
                const blacklistChannel = await client.channels.fetch(BLACKLIST_CHANNEL_ID);
                await blacklistChannel.send(`🚫 **Blacklisted:** ${username}\n**Reason:** ${reason}\n**Proof:** ${proof}`);
                await addToBlacklist(`${username} - ${reason} | Proof: ${proof}`);
                return interaction.update({ content: `✅ ${username} approved for blacklist.`, components: [] });
            }

            if (action === "deny") {
                return interaction.update({ content: `❌ ${username} request denied.`, components: [] });
            }

        } catch (err) {
            console.error("Button Error:", err);
        }
    }
});

// LOGIN
client.login(TOKEN);

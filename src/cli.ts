#!/usr/bin/env node
import { Command } from "commander";
import { client } from "./client.js";
import { formatDistanceToNow, subHours, parseISO } from "date-fns";

const program = new Command();

program
  .name("wacli")
  .description("WhatsApp CLI for reading messages from groups and DMs")
  .version("0.1.0");

// Link command - authenticate with WhatsApp
program
  .command("link")
  .description("Link wacli to your WhatsApp account (scan QR code)")
  .action(async () => {
    try {
      if (client.isLinked()) {
        console.log("⚠️  Already linked. Use 'wacli unlink' first to re-link.");
        process.exit(0);
      }

      console.log("🔗 Starting WhatsApp link process...\n");
      await client.connect({ showQr: true });
      console.log("✅ Successfully linked to WhatsApp!");
      await client.disconnect();
      process.exit(0);
    } catch (err) {
      console.error("❌ Link failed:", (err as Error).message);
      process.exit(1);
    }
  });

// Unlink command - remove authentication
program
  .command("unlink")
  .description("Unlink wacli from your WhatsApp account")
  .action(async () => {
    try {
      await client.unlink();
      console.log("✅ Unlinked from WhatsApp.");
      process.exit(0);
    } catch (err) {
      console.error("❌ Unlink failed:", (err as Error).message);
      process.exit(1);
    }
  });

// Status command
program
  .command("status")
  .description("Check wacli connection status")
  .action(async () => {
    try {
      if (!client.isLinked()) {
        console.log("❌ Not linked. Run 'wacli link' to connect.");
        process.exit(1);
      }

      console.log("🔄 Checking connection...");
      await client.connect();
      console.log("✅ Connected to WhatsApp");
      await client.disconnect();
      process.exit(0);
    } catch (err) {
      console.error("❌ Connection failed:", (err as Error).message);
      process.exit(1);
    }
  });

// Chats command - list all chats
program
  .command("chats")
  .description("List all chats (groups and DMs)")
  .option("--groups", "Show only groups")
  .option("--dms", "Show only direct messages")
  .option("--json", "Output as JSON")
  .action(async (options) => {
    try {
      if (!client.isLinked()) {
        console.log("❌ Not linked. Run 'wacli link' first.");
        process.exit(1);
      }

      await client.connect();
      const chats = await client.getChats();
      await client.disconnect();

      let filtered = chats;
      if (options.groups) {
        filtered = chats.filter((c) => c.isGroup);
      } else if (options.dms) {
        filtered = chats.filter((c) => !c.isGroup);
      }

      if (options.json) {
        console.log(JSON.stringify(filtered, null, 2));
      } else {
        console.log("\n📱 Chats:\n");
        for (const chat of filtered) {
          const icon = chat.isGroup ? "👥" : "👤";
          console.log(`${icon} ${chat.name}`);
          console.log(`   ID: ${chat.id}`);
          console.log();
        }
        console.log(`Total: ${filtered.length} chat(s)`);
      }

      process.exit(0);
    } catch (err) {
      console.error("❌ Error:", (err as Error).message);
      process.exit(1);
    }
  });

// Messages command - read messages
program
  .command("messages")
  .description("Read messages from chats")
  .option("--chat <id>", "Filter by chat ID or name")
  .option("--groups", "Show only group messages")
  .option("--dms", "Show only DM messages")
  .option("--since <time>", "Messages since (e.g., 1h, 24h, 7d, 2024-01-01)", "24h")
  .option("--until <time>", "Messages until")
  .option("--sender <name>", "Filter by sender name")
  .option("--search <text>", "Search message content")
  .option("--limit <n>", "Maximum messages to return", "100")
  .option("--json", "Output as JSON")
  .action(async (options) => {
    try {
      if (!client.isLinked()) {
        console.log("❌ Not linked. Run 'wacli link' first.");
        process.exit(1);
      }

      // Parse --since
      let since: Date | undefined;
      if (options.since) {
        const match = options.since.match(/^(\d+)([hdwm])$/);
        if (match) {
          const [, num, unit] = match;
          const hours =
            unit === "h" ? parseInt(num) :
            unit === "d" ? parseInt(num) * 24 :
            unit === "w" ? parseInt(num) * 24 * 7 :
            unit === "m" ? parseInt(num) * 24 * 30 : 24;
          since = subHours(new Date(), hours);
        } else {
          since = parseISO(options.since);
        }
      }

      console.log("🔄 Connecting...");
      await client.connect();

      const messages = await client.getMessages({
        chatId: options.chat,
        isGroup: options.groups ? true : options.dms ? false : undefined,
        since,
        sender: options.sender,
        search: options.search,
        limit: parseInt(options.limit),
      });

      await client.disconnect();

      if (options.json) {
        console.log(JSON.stringify(messages, null, 2));
      } else {
        if (messages.length === 0) {
          console.log("\nNo messages found matching your filters.");
          console.log("\n⚠️  Note: Full message history requires the message store to be set up.");
          console.log("   Currently showing only messages received while connected.");
          process.exit(0);
        }

        console.log(`\n📨 Messages (since ${options.since}):\n`);
        for (const msg of messages) {
          const time = formatDistanceToNow(msg.timestamp, { addSuffix: true });
          const chat = msg.chatName || msg.chatId;
          console.log(`[${time}] ${chat} - ${msg.senderName || msg.sender}:`);
          console.log(`  ${msg.body.slice(0, 200)}${msg.body.length > 200 ? "..." : ""}`);
          console.log();
        }
        console.log(`Total: ${messages.length} message(s)`);
      }

      process.exit(0);
    } catch (err) {
      console.error("❌ Error:", (err as Error).message);
      process.exit(1);
    }
  });

// Groups command - list groups
program
  .command("groups")
  .description("List WhatsApp groups")
  .option("--json", "Output as JSON")
  .action(async (options) => {
    try {
      if (!client.isLinked()) {
        console.log("❌ Not linked. Run 'wacli link' first.");
        process.exit(1);
      }

      await client.connect();
      const chats = await client.getChats();
      await client.disconnect();

      const groups = chats.filter((c) => c.isGroup);

      if (options.json) {
        console.log(JSON.stringify(groups, null, 2));
      } else {
        console.log("\n👥 Groups:\n");
        for (const group of groups) {
          console.log(`• ${group.name}`);
          console.log(`  ID: ${group.id}`);
          console.log();
        }
        console.log(`Total: ${groups.length} group(s)`);
      }

      process.exit(0);
    } catch (err) {
      console.error("❌ Error:", (err as Error).message);
      process.exit(1);
    }
  });

program.parse();

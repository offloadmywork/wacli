#!/usr/bin/env node
import { Command } from "commander";
import { client } from "./client.js";
import { formatDistanceToNow, subHours, subDays, subWeeks, subMonths, parseISO, format } from "date-fns";
import { createServer } from "http";
import { spawn } from "child_process";
import QRCode from "qrcode";
import qrTerminal from "qrcode-terminal";

const program = new Command();

program
  .name("wacli")
  .description("WhatsApp CLI for reading messages from groups and DMs")
  .version("0.1.0");

// Link command
program
  .command("link")
  .description("Link wacli to your WhatsApp account (scan QR code)")
  .option("--serve", "Serve QR code via web tunnel for remote scanning")
  .option("--port <port>", "Local port for QR server", "9876")
  .action(async (options) => {
    try {
      if (client.isLinked()) {
        console.log("⚠️  Already linked. Use 'wacli unlink' first to re-link.");
        process.exit(0);
      }

      console.log("🔗 Starting WhatsApp link process...\n");

      if (options.serve) {
        // Serve QR via HTTP + tunnel
        let currentQr = "";
        const port = parseInt(options.port);

        const server = createServer(async (req, res) => {
          if (req.url === "/" || req.url === "/qr") {
            if (!currentQr) {
              res.writeHead(200, { "Content-Type": "text/html" });
              res.end(`
                <html><head><meta http-equiv="refresh" content="2"></head>
                <body style="display:flex;justify-content:center;align-items:center;height:100vh;font-family:system-ui;">
                  <div>⏳ Waiting for QR code...</div>
                </body></html>
              `);
              return;
            }
            const qrPng = await QRCode.toDataURL(currentQr, { width: 400 });
            res.writeHead(200, { "Content-Type": "text/html" });
            res.end(`
              <html><head><meta http-equiv="refresh" content="5"><title>wacli - WhatsApp Link</title></head>
              <body style="display:flex;flex-direction:column;justify-content:center;align-items:center;height:100vh;font-family:system-ui;background:#f5f5f5;">
                <h2>📱 Scan with WhatsApp</h2>
                <img src="${qrPng}" style="border:8px solid white;border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,0.15);"/>
                <p style="color:#666;margin-top:20px;">WhatsApp → Settings → Linked Devices → Link a Device</p>
              </body></html>
            `);
          } else {
            res.writeHead(404);
            res.end("Not found");
          }
        });

        server.listen(port, () => {
          console.log(`📡 QR server running on http://localhost:${port}`);
          console.log("🚇 Starting tunnel...\n");
        });

        // Start cloudflared tunnel
        const tunnel = spawn("npx", ["-y", "cloudflared", "tunnel", "--url", `http://localhost:${port}`], {
          stdio: ["ignore", "pipe", "pipe"],
        });

        let tunnelUrl = "";
        const urlPromise = new Promise<string>((resolve) => {
          const handleOutput = (data: Buffer) => {
            const line = data.toString();
            const match = line.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
            if (match && !tunnelUrl) {
              tunnelUrl = match[0];
              console.log(`🌐 Tunnel URL: ${tunnelUrl}\n`);
              console.log("Open this URL on your phone to scan the QR code.\n");
              resolve(tunnelUrl);
            }
          };
          tunnel.stdout.on("data", handleOutput);
          tunnel.stderr.on("data", handleOutput);
        });

        // Wait for tunnel URL
        await Promise.race([
          urlPromise,
          new Promise((_, reject) => setTimeout(() => reject(new Error("Tunnel timeout")), 30000)),
        ]);

        // Connect with QR callback
        await client.connect({
          showQr: true,
          onQr: (qr) => {
            currentQr = qr;
            console.log("📱 New QR code generated - refresh the page to see it.");
            // Also show in terminal
            qrTerminal.generate(qr, { small: true });
          },
        });

        console.log("\n✅ Successfully linked to WhatsApp!");
        tunnel.kill();
        server.close();
        await client.disconnect();
        process.exit(0);
      } else {
        // Standard terminal QR
        await client.connect({ showQr: true });
        console.log("✅ Successfully linked to WhatsApp!");
        await client.disconnect();
        process.exit(0);
      }
    } catch (err) {
      console.error("❌ Link failed:", (err as Error).message);
      process.exit(1);
    }
  });

// Unlink command
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
  .description("Check wacli connection status and message store")
  .action(async () => {
    try {
      if (!client.isLinked()) {
        console.log("❌ Not linked. Run 'wacli link' to connect.");
        process.exit(1);
      }

      console.log("🔄 Checking connection...");
      await client.connect();
      
      const chats = await client.getChats();
      const msgCount = client.getMessageCount();
      
      console.log("✅ Connected to WhatsApp\n");
      console.log(`📊 Message Store:`);
      console.log(`   Chats: ${chats.length}`);
      console.log(`   Messages: ${msgCount}`);
      console.log(`   Groups: ${chats.filter(c => c.isGroup).length}`);
      console.log(`   DMs: ${chats.filter(c => !c.isGroup).length}`);
      
      await client.disconnect();
      process.exit(0);
    } catch (err) {
      console.error("❌ Connection failed:", (err as Error).message);
      process.exit(1);
    }
  });

// Sync command
program
  .command("sync")
  .description("Sync message history from WhatsApp")
  .option("--timeout <seconds>", "Sync timeout in seconds", "30")
  .action(async (options) => {
    try {
      if (!client.isLinked()) {
        console.log("❌ Not linked. Run 'wacli link' first.");
        process.exit(1);
      }

      console.log("🔄 Connecting and syncing message history...");
      await client.connect({ syncHistory: true });
      
      console.log("⏳ Waiting for history sync...");
      await client.waitForSync(parseInt(options.timeout) * 1000);
      
      const msgCount = client.getMessageCount();
      const chatCount = client.getChatCount();
      
      console.log(`\n✅ Sync complete!`);
      console.log(`   Chats: ${chatCount}`);
      console.log(`   Messages: ${msgCount}`);
      
      await client.disconnect();
      process.exit(0);
    } catch (err) {
      console.error("❌ Sync failed:", (err as Error).message);
      process.exit(1);
    }
  });

// Chats command
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
          const msgInfo = chat.messageCount > 0 ? ` (${chat.messageCount} msgs)` : "";
          console.log(`${icon} ${chat.name}${msgInfo}`);
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

// Groups command
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
          const msgInfo = group.messageCount > 0 ? ` (${group.messageCount} msgs)` : "";
          console.log(`• ${group.name}${msgInfo}`);
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

function parseTimeArg(value: string): Date {
  const match = value.match(/^(\d+)([hdwm])$/);
  if (match) {
    const [, num, unit] = match;
    const n = parseInt(num);
    switch (unit) {
      case "h": return subHours(new Date(), n);
      case "d": return subDays(new Date(), n);
      case "w": return subWeeks(new Date(), n);
      case "m": return subMonths(new Date(), n);
    }
  }
  return parseISO(value);
}

// Messages command
program
  .command("messages")
  .description("Read messages from chats")
  .option("--chat <id>", "Filter by chat ID or name")
  .option("--groups", "Show only group messages")
  .option("--dms", "Show only DM messages")
  .option("--since <time>", "Messages since (e.g., 1h, 24h, 7d, 1m, 2024-01-01)", "24h")
  .option("--until <time>", "Messages until")
  .option("--sender <name>", "Filter by sender name or phone")
  .option("--search <text>", "Search message content")
  .option("--limit <n>", "Maximum messages to return", "100")
  .option("--json", "Output as JSON")
  .option("--no-connect", "Use cached messages only (no WhatsApp connection)")
  .option("--include-media", "Download media files for messages with attachments")
  .option("--media-dir <path>", "Directory to save media files", "./media")
  .action(async (options) => {
    try {
      if (!client.isLinked()) {
        console.log("❌ Not linked. Run 'wacli link' first.");
        process.exit(1);
      }

      if (options.connect !== false) {
        console.log("🔄 Connecting...");
        await client.connect();
        // Brief wait to receive any new messages
        await new Promise(r => setTimeout(r, 2000));
      }

      const since = parseTimeArg(options.since);
      const until = options.until ? parseTimeArg(options.until) : undefined;

      const messages = client.getMessages({
        chatId: options.chat,
        chatName: options.chat,
        isGroup: options.groups ? true : options.dms ? false : undefined,
        since,
        until,
        sender: options.sender,
        search: options.search,
        limit: parseInt(options.limit),
      });

      // Download media if requested
      const mediaResults: Record<string, string> = {};
      if (options.includeMedia) {
        const mediaMessages = messages.filter(m => m.hasMedia && m.media);
        if (mediaMessages.length > 0) {
          console.log(`📥 Downloading ${mediaMessages.length} media file(s)...`);
          for (const msg of mediaMessages) {
            try {
              const outputPath = await client.downloadMedia(msg.id, options.mediaDir);
              mediaResults[msg.id] = outputPath;
              console.log(`   ✓ ${msg.mediaType}: ${outputPath}`);
            } catch (err) {
              console.log(`   ✗ ${msg.id}: ${(err as Error).message}`);
            }
          }
          console.log();
        }
      }

      if (options.connect !== false) {
        await client.disconnect();
      }

      if (options.json) {
        // Include media paths in JSON output
        const output = messages.map(m => ({
          ...m,
          mediaPath: mediaResults[m.id] || undefined,
        }));
        console.log(JSON.stringify(output, null, 2));
      } else {
        if (messages.length === 0) {
          console.log(`\n📭 No messages found matching your filters.`);
          console.log(`\nTip: Run 'wacli sync' to fetch message history from WhatsApp.`);
          process.exit(0);
        }

        console.log(`\n📨 Messages (${messages.length}):\n`);
        
        let currentChat = "";
        for (const msg of messages.reverse()) { // Show oldest first
          // Group header
          if (msg.chatId !== currentChat) {
            currentChat = msg.chatId;
            console.log(`\n━━━ ${msg.chatId.split("@")[0]} ━━━\n`);
          }

          const time = format(new Date(msg.timestamp), "MMM d, HH:mm");
          const sender = msg.senderName || msg.sender.split("@")[0];
          const fromMe = msg.isFromMe ? " (you)" : "";
          
          console.log(`[${time}] ${sender}${fromMe}:`);
          console.log(`  ${msg.body.slice(0, 200)}${msg.body.length > 200 ? "..." : ""}`);
          if (msg.quotedBody) {
            console.log(`  ↳ Reply to: "${msg.quotedBody.slice(0, 50)}..."`);
          }
          if (mediaResults[msg.id]) {
            console.log(`  📎 Media: ${mediaResults[msg.id]}`);
          }
          console.log();
        }
        
        console.log(`\nTotal: ${messages.length} message(s)`);
      }

      process.exit(0);
    } catch (err) {
      console.error("❌ Error:", (err as Error).message);
      process.exit(1);
    }
  });

// Search command (shorthand)
program
  .command("search <query>")
  .description("Search messages across all chats")
  .option("--since <time>", "Messages since", "30d")
  .option("--limit <n>", "Maximum results", "50")
  .option("--json", "Output as JSON")
  .action(async (query, options) => {
    try {
      if (!client.isLinked()) {
        console.log("❌ Not linked. Run 'wacli link' first.");
        process.exit(1);
      }

      const since = parseTimeArg(options.since);

      const messages = client.getMessages({
        search: query,
        since,
        limit: parseInt(options.limit),
      });

      if (options.json) {
        console.log(JSON.stringify(messages, null, 2));
      } else {
        if (messages.length === 0) {
          console.log(`\n🔍 No messages found for "${query}"`);
          process.exit(0);
        }

        console.log(`\n🔍 Search results for "${query}" (${messages.length}):\n`);
        
        for (const msg of messages) {
          const time = format(new Date(msg.timestamp), "MMM d, HH:mm");
          const sender = msg.senderName || msg.sender.split("@")[0];
          const chatName = msg.chatId.split("@")[0];
          
          console.log(`[${time}] ${chatName} - ${sender}:`);
          // Highlight search term
          const highlighted = msg.body.replace(
            new RegExp(`(${query})`, "gi"),
            "**$1**"
          );
          console.log(`  ${highlighted.slice(0, 200)}${highlighted.length > 200 ? "..." : ""}`);
          console.log();
        }
      }

      process.exit(0);
    } catch (err) {
      console.error("❌ Error:", (err as Error).message);
      process.exit(1);
    }
  });

// Download command - download media from a message
program
  .command("download <messageId>")
  .description("Download media from a message")
  .option("-o, --output <path>", "Output path (file or directory)", "./")
  .option("--json", "Output result as JSON")
  .action(async (messageId, options) => {
    try {
      if (!client.isLinked()) {
        console.log("❌ Not linked. Run 'wacli link' first.");
        process.exit(1);
      }

      // Check if message exists in store first
      const msg = client.getMessageById(messageId);
      if (!msg) {
        console.error(`❌ Message not found: ${messageId}`);
        console.log("Tip: Run 'wacli sync' to fetch message history.");
        process.exit(1);
      }

      if (!msg.hasMedia) {
        console.error(`❌ Message has no media to download.`);
        process.exit(1);
      }

      console.log(`📥 Downloading ${msg.mediaType} from message ${messageId}...`);
      console.log(`   From: ${msg.senderName || msg.sender}`);
      console.log(`   Chat: ${msg.chatId.split("@")[0]}`);
      
      // Connect to WhatsApp for download
      console.log("🔄 Connecting...");
      await client.connect();
      
      const outputPath = await client.downloadMedia(messageId, options.output);
      
      await client.disconnect();

      if (options.json) {
        console.log(JSON.stringify({ success: true, path: outputPath, messageId, mediaType: msg.mediaType }));
      } else {
        console.log(`\n✅ Downloaded to: ${outputPath}`);
      }

      process.exit(0);
    } catch (err) {
      console.error("❌ Download failed:", (err as Error).message);
      process.exit(1);
    }
  });

// Listen command - stay connected and receive real-time messages
program
  .command("listen")
  .description("Stay connected and receive real-time messages")
  .option("--quiet", "Don't print incoming messages, just save them")
  .action(async (options) => {
    try {
      if (!client.isLinked()) {
        console.log("❌ Not linked. Run 'wacli link' first.");
        process.exit(1);
      }

      console.log("🔄 Connecting to WhatsApp...");
      await client.connect({ syncHistory: true });
      console.log("✅ Connected! Listening for messages...");
      console.log("   Press Ctrl+C to stop.\n");

      // Set up message listener
      client.onMessage((msg) => {
        if (!options.quiet) {
          const time = format(new Date(msg.timestamp), "HH:mm:ss");
          const sender = msg.senderName || msg.sender.split("@")[0];
          const chatName = msg.chatId.split("@")[0];
          const fromMe = msg.isFromMe ? " (you)" : "";
          console.log(`[${time}] ${chatName} | ${sender}${fromMe}: ${msg.body.slice(0, 100)}${msg.body.length > 100 ? "..." : ""}`);
        }
      });

      // Keep alive
      process.on("SIGINT", async () => {
        console.log("\n\n👋 Disconnecting...");
        await client.disconnect();
        process.exit(0);
      });

      // Prevent exit
      await new Promise(() => {});
    } catch (err) {
      console.error("❌ Error:", (err as Error).message);
      process.exit(1);
    }
  });

program.parse();

import { client } from "./dist/client.js";
import { downloadMediaMessage, downloadContentFromMessage } from "@whiskeysockets/baileys";
import * as path from "path";
import * as fs from "fs";
import * as os from "os";

const messageId = process.argv[2];
const outputPath = process.argv[3] || "/tmp/audio.ogg";

if (!messageId) {
  console.error("Usage: node download-media.mjs <messageId> [outputPath]");
  process.exit(1);
}

// Load the message from store
const storePath = path.join(os.homedir(), ".config", "wacli", "data", "messages.json");
const store = JSON.parse(fs.readFileSync(storePath, "utf-8"));

// Find the message
let targetMessage = null;
let chatId = null;
for (const [chat, messages] of Object.entries(store.messages)) {
  const msg = messages.find(m => m.id === messageId);
  if (msg) {
    targetMessage = msg;
    chatId = chat;
    break;
  }
}

if (!targetMessage) {
  console.error("Message not found:", messageId);
  process.exit(1);
}

console.log("Found message:", targetMessage.id, "in chat:", chatId);
console.log("Has media:", targetMessage.hasMedia, "Type:", targetMessage.mediaType);
console.log("Timestamp:", new Date(targetMessage.timestamp).toISOString());

let foundMessage = null;
let downloadComplete = false;

try {
  console.log("Connecting to WhatsApp (no history sync)...");
  
  // Connect without syncing history to be faster
  await client.connect({ syncHistory: false });
  console.log("Connected!");

  const sock = client.getSocket();
  
  // Listen for incoming messages
  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    console.log("Received", messages.length, "messages via", type);
    for (const msg of messages) {
      console.log("  Message ID:", msg.key.id);
      if (msg.key.id === messageId) {
        console.log("FOUND target message!");
        foundMessage = msg;
        
        // Try to download immediately
        try {
          const buffer = await downloadMediaMessage(msg, "buffer", {});
          fs.writeFileSync(outputPath, buffer);
          console.log("SUCCESS! Downloaded to:", outputPath);
          downloadComplete = true;
        } catch (e) {
          console.error("Download error:", e.message);
        }
      }
    }
  });

  // Request message history for this chat
  console.log("\nRequesting message history...");
  
  const msgKey = {
    remoteJid: chatId,
    id: messageId,
    fromMe: targetMessage.isFromMe
  };
  
  try {
    const requestId = await sock.fetchMessageHistory(
      100,
      msgKey,
      Math.floor(targetMessage.timestamp / 1000) + 1
    );
    console.log("History request sent, ID:", requestId);
  } catch (e) {
    console.log("fetchMessageHistory error:", e.message);
  }
  
  // Wait for messages to come in
  console.log("Waiting for messages (30 seconds)...");
  
  for (let i = 0; i < 30 && !downloadComplete; i++) {
    await new Promise(r => setTimeout(r, 1000));
    process.stdout.write(".");
  }
  console.log();
  
  if (downloadComplete) {
    console.log("Download successful!");
  } else if (foundMessage) {
    console.log("Message found but download failed");
  } else {
    console.log("Message not found in history");
  }
  
  await client.disconnect();
  process.exit(downloadComplete ? 0 : 1);
} catch (err) {
  console.error("Error:", err.message);
  process.exit(1);
}

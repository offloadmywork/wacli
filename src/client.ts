import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  WASocket,
  proto,
  GroupMetadata,
  WAMessage,
  isJidGroup,
} from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import pino from "pino";
import qrcode from "qrcode-terminal";
import * as path from "path";
import * as fs from "fs";
import * as os from "os";
import {
  MessageStore,
  StoredMessage,
  loadStore,
  saveStore,
  processMessage,
  addMessage,
  filterMessages,
  MessageFilter,
} from "./store.js";

const logger = pino({ level: "silent" });

function getAuthDir(): string {
  const configDir = path.join(os.homedir(), ".config", "wacli");
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }
  return path.join(configDir, "auth");
}

export class WacliClient {
  private sock: WASocket | null = null;
  private connected = false;
  private authDir: string;
  private store: MessageStore;
  private syncComplete = false;

  constructor() {
    this.authDir = getAuthDir();
    this.store = loadStore();
  }

  isLinked(): boolean {
    const credsPath = path.join(this.authDir, "creds.json");
    return fs.existsSync(credsPath);
  }

  async connect(options?: { showQr?: boolean; syncHistory?: boolean }): Promise<void> {
    const { state, saveCreds } = await useMultiFileAuthState(this.authDir);
    const { version } = await fetchLatestBaileysVersion();

    this.sock = makeWASocket({
      version,
      auth: state,
      logger,
      printQRInTerminal: false,
      syncFullHistory: options?.syncHistory ?? true,
      getMessage: async (key) => {
        // Look up message from store
        const chatMsgs = this.store.messages.get(key.remoteJid || "");
        const msg = chatMsgs?.find(m => m.id === key.id);
        if (msg) {
          return { conversation: msg.body };
        }
        return { conversation: "" };
      },
    });

    // Handle incoming messages
    this.sock.ev.on("messages.upsert", async ({ messages, type }) => {
      for (const msg of messages) {
        const stored = processMessage(msg, this.store);
        if (stored) {
          addMessage(this.store, stored);
        }
      }
      // Save periodically
      saveStore(this.store);
    });

    // Handle history sync
    this.sock.ev.on("messaging-history.set", async ({ chats, contacts, messages, isLatest }) => {
      // Process contacts
      for (const contact of contacts) {
        if (contact.id && contact.name) {
          this.store.contacts.set(contact.id.split("@")[0], contact.name);
        }
      }

      // Process chats
      for (const chat of chats) {
        if (chat.id) {
          this.store.chats.set(chat.id, {
            name: chat.name || chat.id,
            isGroup: chat.id.endsWith("@g.us"),
            lastMessageTime: (chat.conversationTimestamp as number) * 1000 || 0,
          });
        }
      }

      // Process messages
      for (const msg of messages) {
        const stored = processMessage(msg, this.store);
        if (stored) {
          addMessage(this.store, stored);
        }
      }

      if (isLatest) {
        this.syncComplete = true;
      }

      saveStore(this.store);
    });

    // Handle group metadata
    this.sock.ev.on("groups.upsert", async (groups) => {
      for (const group of groups) {
        this.store.chats.set(group.id, {
          name: group.subject,
          isGroup: true,
          lastMessageTime: 0,
        });
      }
      saveStore(this.store);
    });

    this.sock.ev.on("groups.update", async (updates) => {
      for (const update of updates) {
        const existing = this.store.chats.get(update.id!);
        if (existing && update.subject) {
          existing.name = update.subject;
        }
      }
      saveStore(this.store);
    });

    // Handle contacts
    this.sock.ev.on("contacts.upsert", async (contacts) => {
      for (const contact of contacts) {
        if (contact.id && contact.name) {
          this.store.contacts.set(contact.id.split("@")[0], contact.name);
        }
      }
      saveStore(this.store);
    });

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("Connection timeout (60s)"));
      }, 60000);

      this.sock!.ev.on("connection.update", async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr && options?.showQr) {
          console.log("\n📱 Scan this QR code with WhatsApp:\n");
          qrcode.generate(qr, { small: true });
          console.log("\nOpen WhatsApp → Settings → Linked Devices → Link a Device\n");
        }

        if (connection === "close") {
          const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
          if (statusCode === DisconnectReason.loggedOut) {
            clearTimeout(timeout);
            reject(new Error("Logged out. Run 'wacli link' to re-authenticate."));
          }
        }

        if (connection === "open") {
          this.connected = true;
          clearTimeout(timeout);
          resolve();
        }
      });

      this.sock!.ev.on("creds.update", saveCreds);
    });
  }

  async waitForSync(timeoutMs: number = 30000): Promise<void> {
    if (this.syncComplete) return;

    return new Promise((resolve) => {
      const start = Date.now();
      const check = () => {
        if (this.syncComplete || Date.now() - start > timeoutMs) {
          resolve();
        } else {
          setTimeout(check, 500);
        }
      };
      check();
    });
  }

  async disconnect(): Promise<void> {
    saveStore(this.store);
    if (this.sock) {
      this.sock.end(undefined);
      this.sock = null;
      this.connected = false;
    }
  }

  async unlink(): Promise<void> {
    await this.disconnect();
    if (fs.existsSync(this.authDir)) {
      fs.rmSync(this.authDir, { recursive: true });
    }
    // Also clear the message store
    const storePath = path.join(os.homedir(), ".config", "wacli", "data", "messages.json");
    if (fs.existsSync(storePath)) {
      fs.unlinkSync(storePath);
    }
  }

  async getChats(): Promise<{ id: string; name: string; isGroup: boolean; messageCount: number }[]> {
    if (!this.sock) throw new Error("Not connected");

    // Fetch groups from WhatsApp
    const groups = await this.sock.groupFetchAllParticipating();
    for (const [jid, group] of Object.entries(groups)) {
      this.store.chats.set(jid, {
        name: group.subject,
        isGroup: true,
        lastMessageTime: this.store.chats.get(jid)?.lastMessageTime || 0,
      });
    }
    saveStore(this.store);

    // Return all chats with message counts
    const chats: { id: string; name: string; isGroup: boolean; messageCount: number }[] = [];
    for (const [id, chat] of this.store.chats) {
      chats.push({
        id,
        name: chat.name,
        isGroup: chat.isGroup,
        messageCount: this.store.messages.get(id)?.length || 0,
      });
    }

    // Sort by last message time
    chats.sort((a, b) => {
      const aTime = this.store.chats.get(a.id)?.lastMessageTime || 0;
      const bTime = this.store.chats.get(b.id)?.lastMessageTime || 0;
      return bTime - aTime;
    });

    return chats;
  }

  getMessages(filter: MessageFilter = {}): StoredMessage[] {
    return filterMessages(this.store, filter);
  }

  getMessageCount(): number {
    let count = 0;
    for (const messages of this.store.messages.values()) {
      count += messages.length;
    }
    return count;
  }

  getChatCount(): number {
    return this.store.chats.size;
  }

  getSocket(): WASocket {
    if (!this.sock) throw new Error("Not connected");
    return this.sock;
  }
}

export const client = new WacliClient();

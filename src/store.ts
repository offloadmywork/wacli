import { proto, WAMessage, Chat, Contact } from "@whiskeysockets/baileys";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

export interface StoredMessage {
  id: string;
  chatId: string;
  sender: string;
  senderName?: string;
  timestamp: number;
  body: string;
  isFromMe: boolean;
  quotedMessageId?: string;
  quotedBody?: string;
  hasMedia: boolean;
  mediaType?: string;
}

export interface MessageStore {
  messages: Map<string, StoredMessage[]>; // chatId -> messages
  chats: Map<string, { name: string; isGroup: boolean; lastMessageTime: number }>;
  contacts: Map<string, string>; // jid -> name
}

function getStorePath(): string {
  const dir = path.join(os.homedir(), ".config", "wacli", "data");
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return path.join(dir, "messages.json");
}

export function loadStore(): MessageStore {
  const storePath = getStorePath();
  if (fs.existsSync(storePath)) {
    try {
      const data = JSON.parse(fs.readFileSync(storePath, "utf-8"));
      return {
        messages: new Map(Object.entries(data.messages || {}).map(([k, v]) => [k, v as StoredMessage[]])),
        chats: new Map(Object.entries(data.chats || {})),
        contacts: new Map(Object.entries(data.contacts || {})),
      };
    } catch {
      // Corrupted store, start fresh
    }
  }
  return {
    messages: new Map(),
    chats: new Map(),
    contacts: new Map(),
  };
}

export function saveStore(store: MessageStore): void {
  const storePath = getStorePath();
  const data = {
    messages: Object.fromEntries(store.messages),
    chats: Object.fromEntries(store.chats),
    contacts: Object.fromEntries(store.contacts),
  };
  fs.writeFileSync(storePath, JSON.stringify(data, null, 2));
}

export function extractMessageBody(msg: WAMessage): string {
  const m = msg.message;
  if (!m) return "";
  
  if (m.conversation) return m.conversation;
  if (m.extendedTextMessage?.text) return m.extendedTextMessage.text;
  if (m.imageMessage?.caption) return `[Image] ${m.imageMessage.caption}`;
  if (m.videoMessage?.caption) return `[Video] ${m.videoMessage.caption}`;
  if (m.documentMessage?.caption) return `[Document] ${m.documentMessage.fileName || ""}`;
  if (m.audioMessage) return "[Audio]";
  if (m.stickerMessage) return "[Sticker]";
  if (m.contactMessage) return `[Contact: ${m.contactMessage.displayName}]`;
  if (m.locationMessage) return `[Location: ${m.locationMessage.name || ""}]`;
  if (m.reactionMessage) return `[Reaction: ${m.reactionMessage.text}]`;
  if (m.pollCreationMessage) return `[Poll: ${m.pollCreationMessage.name}]`;
  
  return "";
}

export function getMediaType(msg: WAMessage): string | undefined {
  const m = msg.message;
  if (!m) return undefined;
  
  if (m.imageMessage) return "image";
  if (m.videoMessage) return "video";
  if (m.audioMessage) return "audio";
  if (m.documentMessage) return "document";
  if (m.stickerMessage) return "sticker";
  
  return undefined;
}

export function processMessage(
  msg: WAMessage,
  store: MessageStore
): StoredMessage | null {
  if (!msg.key.id || !msg.key.remoteJid) return null;
  
  const chatId = msg.key.remoteJid;
  const isGroup = chatId.endsWith("@g.us");
  const sender = isGroup 
    ? msg.key.participant || msg.key.remoteJid
    : msg.key.fromMe 
      ? "me" 
      : msg.key.remoteJid;
  
  const body = extractMessageBody(msg);
  if (!body && !getMediaType(msg)) return null; // Skip empty messages
  
  const stored: StoredMessage = {
    id: msg.key.id!,
    chatId,
    sender,
    senderName: store.contacts.get(sender.split("@")[0]) || msg.pushName || undefined,
    timestamp: (msg.messageTimestamp as number) * 1000,
    body,
    isFromMe: msg.key.fromMe || false,
    hasMedia: !!getMediaType(msg),
    mediaType: getMediaType(msg),
  };
  
  // Handle quoted messages
  const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
  if (quoted) {
    stored.quotedMessageId = msg.message?.extendedTextMessage?.contextInfo?.stanzaId || undefined;
    stored.quotedBody = quoted.conversation || quoted.extendedTextMessage?.text || "[Media]";
  }
  
  // Update contact name if available
  if (msg.pushName && sender !== "me") {
    store.contacts.set(sender.split("@")[0], msg.pushName);
  }
  
  return stored;
}

export function addMessage(store: MessageStore, msg: StoredMessage): void {
  const existing = store.messages.get(msg.chatId) || [];
  
  // Avoid duplicates
  if (existing.some(m => m.id === msg.id)) return;
  
  existing.push(msg);
  
  // Keep only last 1000 messages per chat
  if (existing.length > 1000) {
    existing.splice(0, existing.length - 1000);
  }
  
  // Sort by timestamp
  existing.sort((a, b) => a.timestamp - b.timestamp);
  
  store.messages.set(msg.chatId, existing);
  
  // Update chat info
  const chat = store.chats.get(msg.chatId);
  if (chat) {
    chat.lastMessageTime = Math.max(chat.lastMessageTime, msg.timestamp);
  }
}

export interface MessageFilter {
  chatId?: string;
  chatName?: string;
  isGroup?: boolean;
  sender?: string;
  search?: string;
  since?: Date;
  until?: Date;
  limit?: number;
}

export function filterMessages(
  store: MessageStore,
  filter: MessageFilter
): StoredMessage[] {
  let results: StoredMessage[] = [];
  
  for (const [chatId, messages] of store.messages) {
    const chat = store.chats.get(chatId);
    
    // Filter by chat type
    if (filter.isGroup !== undefined) {
      const isGroup = chatId.endsWith("@g.us");
      if (filter.isGroup !== isGroup) continue;
    }
    
    // Filter by chat ID
    if (filter.chatId && !chatId.includes(filter.chatId)) continue;
    
    // Filter by chat name
    if (filter.chatName && chat) {
      if (!chat.name.toLowerCase().includes(filter.chatName.toLowerCase())) continue;
    }
    
    for (const msg of messages) {
      // Filter by time
      if (filter.since && msg.timestamp < filter.since.getTime()) continue;
      if (filter.until && msg.timestamp > filter.until.getTime()) continue;
      
      // Filter by sender
      if (filter.sender) {
        const senderMatch = 
          msg.sender.includes(filter.sender) ||
          (msg.senderName?.toLowerCase().includes(filter.sender.toLowerCase()));
        if (!senderMatch) continue;
      }
      
      // Filter by search text
      if (filter.search) {
        if (!msg.body.toLowerCase().includes(filter.search.toLowerCase())) continue;
      }
      
      results.push(msg);
    }
  }
  
  // Sort by timestamp descending (newest first)
  results.sort((a, b) => b.timestamp - a.timestamp);
  
  // Apply limit
  if (filter.limit) {
    results = results.slice(0, filter.limit);
  }
  
  return results;
}

---
name: wacli
description: WhatsApp CLI for reading messages from groups and DMs. Use when the user asks about WhatsApp messages, wants to check WhatsApp, read conversations, search WhatsApp history, or needs WhatsApp integration.
---

# wacli - WhatsApp CLI

Read WhatsApp messages via Baileys (unofficial WhatsApp Web API).

## Installation

```bash
cd /tmp && git clone https://github.com/offloadmywork/wacli.git
cd wacli && npm install && npm run build && npm link
```

## First-Time Setup

```bash
wacli link --serve
```

Opens a Cloudflare tunnel with QR code. User scans with WhatsApp → Settings → Linked Devices.

**Note:** QR expires after ~2 min. If timeout, run again.

## Commands

```bash
# Check connection
wacli status

# Sync message history (run periodically)
wacli sync

# List chats
wacli chats [--groups] [--dms] [--json]

# Read messages
wacli messages [--since 3h] [--chat <id>] [--sender <name>] [--search <text>] [--json]

# Search across all chats
wacli search "query" [--since 30d] [--limit 50]
```

## Time Filters

Use with `--since`: `1h`, `24h`, `7d`, `1m` or ISO date `2024-01-01`

## Examples

```bash
# Last 3 hours of messages
wacli messages --since 3h

# Messages from a specific person
wacli messages --sender "John" --since 24h

# Search for keyword
wacli search "meeting" --since 7d

# Group messages only
wacli messages --groups --since 1h

# JSON output for parsing
wacli messages --since 1h --json | jq '.[] | {sender: .senderName, body}'
```

## Config Locations

- Auth: `~/.config/wacli/auth/`
- Data: `~/.config/wacli/data/`

## Troubleshooting

- **"Not linked"**: Run `wacli link --serve`
- **Connection issues**: Run `wacli unlink` then `wacli link --serve`
- **No messages**: Run `wacli sync` first to fetch history

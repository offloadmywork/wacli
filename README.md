# wacli

WhatsApp CLI for reading messages from groups and DMs.

## Installation

```bash
npm install -g wacli
```

Or run directly:

```bash
npx wacli
```

## Quick Start

```bash
# Link your WhatsApp account (scan QR code)
wacli link

# Sync message history
wacli sync

# Read recent messages
wacli messages --since 24h

# Search messages
wacli search "meeting"
```

## Commands

### `wacli link`
Link wacli to your WhatsApp account by scanning a QR code.

### `wacli unlink`
Remove the WhatsApp link and clear all stored data.

### `wacli status`
Check connection status and message store statistics.

### `wacli sync`
Sync message history from WhatsApp.

Options:
- `--timeout <seconds>` - Sync timeout (default: 30)

### `wacli chats`
List all chats (groups and DMs).

Options:
- `--groups` - Show only groups
- `--dms` - Show only direct messages
- `--json` - Output as JSON

### `wacli groups`
List WhatsApp groups.

Options:
- `--json` - Output as JSON

### `wacli messages`
Read messages from chats with powerful filtering.

Options:
- `--chat <id>` - Filter by chat ID or name
- `--groups` - Show only group messages
- `--dms` - Show only DM messages
- `--since <time>` - Messages since (e.g., `1h`, `24h`, `7d`, `1m`, `2024-01-01`)
- `--until <time>` - Messages until
- `--sender <name>` - Filter by sender name or phone
- `--search <text>` - Search message content
- `--limit <n>` - Maximum messages to return (default: 100)
- `--json` - Output as JSON
- `--no-connect` - Use cached messages only (offline mode)

### `wacli search <query>`
Search messages across all chats.

Options:
- `--since <time>` - Messages since (default: 30d)
- `--limit <n>` - Maximum results (default: 50)
- `--json` - Output as JSON

## Examples

```bash
# Get messages from the last hour
wacli messages --since 1h

# Get group messages from the last week
wacli messages --groups --since 7d

# Search for messages containing "meeting"
wacli search "meeting"

# Get messages from a specific sender
wacli messages --sender "Mom" --since 7d

# Export messages as JSON
wacli messages --since 24h --json > messages.json

# Read cached messages without connecting
wacli messages --since 1h --no-connect
```

## Data Storage

wacli stores data in `~/.config/wacli/`:
- `auth/` - WhatsApp authentication credentials
- `data/messages.json` - Cached messages and contacts

## How It Works

wacli uses [Baileys](https://github.com/WhiskeySockets/Baileys) to connect to WhatsApp Web. When you run `wacli link`, it generates a QR code that you scan with your phone's WhatsApp app (Settings → Linked Devices → Link a Device).

Messages are synced from WhatsApp when you connect and stored locally for fast offline access. Use `wacli sync` to fetch historical messages.

## Requirements

- Node.js 18+
- A phone with WhatsApp installed

## Privacy

All data is stored locally on your machine. No data is sent to any external servers except WhatsApp's own servers for message sync.

## License

MIT

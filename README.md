# wacli

WhatsApp CLI for reading messages from groups and DMs.

## Installation

```bash
npm install -g wacli
# or
npx wacli
```

## Quick Start

```bash
# Link your WhatsApp account (scan QR code)
wacli link

# List your groups
wacli groups

# Read recent messages
wacli messages --since 24h

# Read messages from a specific group
wacli messages --chat "Family Group" --since 7d
```

## Commands

### `wacli link`
Link wacli to your WhatsApp account by scanning a QR code.

### `wacli unlink`
Remove the WhatsApp link and clear credentials.

### `wacli status`
Check if wacli is linked and can connect.

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
Read messages from chats.

Options:
- `--chat <id>` - Filter by chat ID or name
- `--groups` - Show only group messages
- `--dms` - Show only DM messages
- `--since <time>` - Messages since (e.g., `1h`, `24h`, `7d`, `2024-01-01`)
- `--until <time>` - Messages until
- `--sender <name>` - Filter by sender name
- `--search <text>` - Search message content
- `--limit <n>` - Maximum messages to return (default: 100)
- `--json` - Output as JSON

## Examples

```bash
# Get messages from the last hour
wacli messages --since 1h

# Get group messages from the last week as JSON
wacli messages --groups --since 7d --json

# Search for messages containing "meeting"
wacli messages --search "meeting" --since 30d

# Get messages from a specific sender
wacli messages --sender "Mom" --since 7d
```

## Data Storage

wacli stores credentials in `~/.config/wacli/`:
- `auth/` - WhatsApp authentication data
- `data/` - Message cache and settings

## Requirements

- Node.js 18+
- A phone with WhatsApp installed

## How It Works

wacli uses [Baileys](https://github.com/WhiskeySockets/Baileys) to connect to WhatsApp Web. When you run `wacli link`, it generates a QR code that you scan with your phone's WhatsApp app (Settings → Linked Devices → Link a Device).

Messages are fetched from WhatsApp's servers when you run commands. No messages are stored locally unless you enable message caching.

## License

MIT

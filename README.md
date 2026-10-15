# wacli

WhatsApp CLI for AI agents. Read messages from groups and DMs via Baileys.

## Install

```bash
git clone https://github.com/offloadmywork/wacli.git
cd wacli && npm install && npm run build && npm link
```

## Setup (First Time)

```bash
wacli link --serve
```

Creates Cloudflare tunnel with QR code. User scans with WhatsApp → Settings → Linked Devices. QR expires in ~2 min.

## Commands

```bash
wacli status                          # Check connection
wacli sync                            # Fetch message history
wacli chats [--groups|--dms] [--json] # List chats
wacli messages [options]              # Read messages
wacli search "query" [options]        # Search all chats
wacli download <messageId> [-o path]  # Download media from message
wacli unlink                          # Remove link
```

## Message Filters

```bash
--since <time>    # 1h, 24h, 7d, 1m, or ISO date
--until <time>    # End time
--chat <id>       # Filter by chat ID/name
--sender <name>   # Filter by sender
--search <text>   # Search content
--groups          # Groups only
--dms             # DMs only
--limit <n>       # Max results (default: 100)
--include-media   # Download media attachments
--media-dir <dir> # Where to save media (default: ./media)
--json            # JSON output
```

`--chat` accepts a full stored chat ID, a bare group ID (the portion before `@g.us`), or a partial chat/contact name. Exact IDs take precedence. Name lookup uses Unicode NFC normalization and case-insensitive matching, including Hebrew text without transliteration or identity inference. A unique match is required; a query matching multiple distinct chats prints quoted candidate names/IDs and exits with code 1 without messages. Use a more specific selector or one candidate's full ID. `--groups`/`--dms` can narrow candidates; time, sender, search and limit filters do not silently disambiguate identities. `--json` emits an `ambiguous_chat` error with candidates instead of a message array. Empty selectors return no messages. Existing raw message output and RPC plaintext transport are unchanged. This does not resolve phone/LID aliases.

## Examples

```bash
wacli messages --since 3h
wacli messages --sender "Mom" --since 7d
wacli messages --groups --since 1h --json
wacli messages --since 1h --include-media    # Download all media
wacli download ABC123DEF -o ./downloads/     # Download specific media
wacli search "meeting" --since 7d
```

Individual chats with cached messages are included in the chat registry even when no history chat entry was received. Older caches recover missing entries in memory when loaded; normal store saves persist them. Existing chat names are preserved, with a cached contact name or chat ID used only for missing entries. This does not fetch additional history or resolve phone/LID aliases.

## Storage

- Auth: `~/.config/wacli/auth/`
- Data: `~/.config/wacli/data/`

## OpenClaw Skill

Symlink for agent access:
```bash
ln -sf /path/to/wacli/skill ~/.openclaw/skills/wacli
```

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Not linked | `wacli link --serve` |
| Connection failed | `wacli unlink && wacli link --serve` |
| No messages | `wacli sync` |
| QR timeout | Re-run `wacli link --serve`, scan faster |

## License

MIT

# Troubleshooting

## better-sqlite3 version mismatch

If Electron and locally-built native module versions differ, you may see:

`ERR_DLOPEN_FAILED ... NODE_MODULE_VERSION ...`

Rebuild the native module against Electron:

```bash
npm rebuild better-sqlite3 --runtime=electron --target=40.2.1 --dist-url=https://electronjs.org/headers
```

Then restart the app.

## Debug unpacked build

Useful for debugging packaged output without installer:

```bash
npm run compile -- --dir -c.asar=false
```

## Renderer Vite env vars

Only `VITE_*` prefixed variables are exposed to renderer code.

## Search/provider failures

- Use Settings -> Servers refresh to verify provider health.
- If selected provider is unavailable, app will attempt fallback providers for search.

# Testing

## Framework

- Playwright for E2E tests
- No unit test framework is configured

## Running Tests

```bash
npm test   # run playwright e2e tests
```

**Important:** Tests require a compiled app in `dist/`. Run `npm run compile` before `npm test`.

## Test File

- `tests/e2e.spec.ts` — single test entry point
- Uses `_electron` from Playwright to launch the compiled app

## What's Tested

- Main window state (visible, not crashed, devTools closed)
- Interactive UI elements (buttons, logos)
- Preload context exposure (`versions`, `sha256sum`, `send`)

## Writing Tests

Tests use Electron-specific fixtures:

```typescript
const electronApp = await electron.launch({
  executablePath: executablePath,
  args: ['--no-sandbox'],
});
const page = await electronApp.firstWindow();
```

## Debugging

To debug a packaged build without installer:

```bash
npm run compile -- --dir -c.asar=false
```

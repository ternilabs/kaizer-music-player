# `@app/integrate-renderer`

Helper package to adapt a freshly generated Vite renderer into this Electron monorepo.

## Purpose

This package is not runtime app logic.  
It automates post-create steps for `packages/renderer`.

Main actions performed in `index.js`:

- Rename renderer package to `@app/renderer`
- Ensure `vite build` includes `--base ./`
- Set `main` and `exports` to `./dist/index.html`

## Scripts

```bash
npm start --workspace @app/integrate-renderer
```

## Related Root Commands

- `npm run create-renderer`  
  Runs `create-renderer.js` (wrapper around `npm create vite`)
- `npm run integrate-renderer`  
  Runs this package's integration script
- `npm run init`  
  Executes create + integrate + install workflow

## Files

- `create-renderer.js` - scaffold helper
- `index.js` - integration patching logic for renderer `package.json`

---
Last reviewed: 2026-02-13

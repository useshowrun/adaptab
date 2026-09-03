# Deploy AdapTab to Netlify

The recommended path is Git-based deployment so the live app, public source,
and future adapter changes stay synchronized.

## GitHub

1. Create a **public, empty** repository named `adaptab`. Do not initialize it
   with a README, license, or `.gitignore`; those already exist locally.
2. Copy its HTTPS URL, for example `https://github.com/OWNER/adaptab.git`.
3. Add that URL as this project's `origin` and push the `main` branch.

## Netlify

1. Log in at `https://app.netlify.com/`.
2. Choose **Add new project → Import an existing project → GitHub**.
3. Select the new public `adaptab` repository.
4. Netlify should read `netlify.toml`; verify:
   - Build command: `npm run build`
   - Publish directory: `dist`
   - Functions directory: `netlify/functions`
5. Deploy without adding secrets. The MVP requires no environment variables.
6. Optionally rename the generated site to an available `adaptab-*` name.

After deployment, open `/start` in ChatGPT's integrated browser. The page
should expose four WebMCP bootstrap tools. Run the same Raising.fi resolve,
bundle, inject, discovery, and invocation sequence recorded in
`IMPLEMENTATION_STATUS.md`.

Netlify's runtime supplies the Blobs configuration to Functions automatically.
No target-site cookie or token belongs in Netlify settings.

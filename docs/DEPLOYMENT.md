# Deploy AdapTab to Netlify

The recommended path is Git-based deployment so the live app, public source,
and future adapter changes stay synchronized.

## GitHub

1. Create a **public, empty** repository named `adaptab`. Do not initialize it
   with a README, license, or `.gitignore`; those already exist locally.
2. Copy its HTTPS URL, for example `https://github.com/useshowrun/adaptab.git`.
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

## Enable the private workspace

The public catalog works without Identity. To activate `/workspace`:

1. In the Netlify project, enable Netlify Identity.
2. Keep registration invite-only for a private demo, or open registration only
   while creating intended test accounts.
3. Enable GitHub under external OAuth providers if the **Continue with GitHub**
   button should be used. Email/password remains available.
4. Open `/workspace`, sign in, and create a fixed-recipient tool with one to
   three complete LinkedIn `/in/` URLs.
5. Open the returned `/tools/<opaque-id>` page while signed in. Confirm that
   `adaptab_private_tool_info` and `adaptab_get_private_bundle` are discoverable.

The opaque URL is a locator, not a bearer token. Private Functions always read
the Identity session and scope the Netlify Blobs key to that owner. Do not place
access tokens in query strings.

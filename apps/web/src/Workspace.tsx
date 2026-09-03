import { getUser, handleAuthCallback, login, logout, oauthLogin, signup, type User } from "@netlify/identity";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { authenticatedFetch, postJson } from "./api";
import { encryptPrivateSource, hasPrivateToolKey, savePrivateToolKey } from "./private-crypto";
import { registerPrivateBootstrapTools, registerPrivateWorkspaceTools } from "./register-private-tools";

type ToolSummary = { name: string; description: string; routeFamily: string; readOnly: boolean; requiresConfirmation: boolean; inputSchema: Record<string, unknown> };
type PrivateTool = {
  id: string; label: string; kind: "template" | "encrypted-custom"; version: string;
  recipientProfileUrls?: string[]; origins: string[]; pathPatterns: string[]; tools: ToolSummary[];
  encryption: "generated-template" | "client-aes-gcm"; toolUrl: string; createdAt: string;
};
type ImportDocument = {
  label: string;
  manifest: { version: string; origins: string[]; pathPatterns: string[]; networkAllowlist: string[]; tools: ToolSummary[] };
  source: string;
};

const importExample = JSON.stringify({
  label: "Internal portal page reader",
  manifest: {
    version: "1.0.0",
    origins: ["https://portal.example.com"],
    pathPatterns: ["/*"],
    networkAllowlist: [],
    tools: [{
      name: "adaptab_internal_page_context",
      description: "Read the title and URL of the current signed-in portal page.",
      routeFamily: "portal",
      readOnly: true,
      requiresConfirmation: false,
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
    }],
  },
  source: `await document.modelContext.registerTool({
  name: "adaptab_internal_page_context",
  description: "Read the title and URL of the current signed-in portal page.",
  inputSchema: { type: "object", properties: {}, additionalProperties: false },
  annotations: { readOnlyHint: true },
  execute: () => ({ title: document.title, url: location.href })
});
return { ok: true, tools: ["adaptab_internal_page_context"] };`,
}, null, 2);

function readImportDocument(value: string): ImportDocument | null {
  try {
    const document = JSON.parse(value) as ImportDocument;
    if (!document || typeof document !== "object" || typeof document.label !== "string" || typeof document.source !== "string" || !document.manifest || !Array.isArray(document.manifest.origins) || !Array.isArray(document.manifest.pathPatterns) || !Array.isArray(document.manifest.networkAllowlist) || !Array.isArray(document.manifest.tools)) return null;
    return document;
  } catch { return null; }
}

function AuthPanel({ onAuthenticated }: { onAuthenticated: (user: User) => void }) {
  const [email, setEmail] = useState(""); const [password, setPassword] = useState("");
  const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  async function submit(action: "login" | "signup") {
    setBusy(true); setError("");
    try {
      const user = action === "login" ? await login(email, password) : await signup(email, password);
      if (user.confirmedAt || action === "login") onAuthenticated(user); else setError("Account created. Confirm the email, then sign in.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Authentication failed."); }
    finally { setBusy(false); }
  }
  return <section className="workspace-card auth-card">
    <p className="eyebrow">PRIVATE WORKSPACE</p><h1>Keep your own<br /><em>tools private.</em></h1>
    <p className="lede">Sign in to create owner-only adapters. Private configurations never appear in the public catalog.</p>
    <button className="primary-button" disabled={busy} onClick={() => oauthLogin("github")}>Continue with GitHub</button>
    <div className="auth-divider"><span>or email</span></div>
    <label>Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label>
    <label>Password<input type="password" minLength={6} value={password} onChange={(event) => setPassword(event.target.value)} /></label>
    <div className="button-row"><button disabled={busy || !email || password.length < 6} onClick={() => submit("login")}>Sign in</button><button disabled={busy || !email || password.length < 6} onClick={() => submit("signup")}>Create account</button></div>
    {error && <p className="form-error">{error}</p>}
  </section>;
}

function ToolRows({ tools }: { tools: ToolSummary[] }) {
  return <div className="tool-rows">{tools.map((tool) => <div className="tool-row" key={tool.name}>
    <div><code>{tool.name}</code><p>{tool.description}</p></div>
    <span className={tool.readOnly ? "tool-read" : "tool-write"}>{tool.readOnly ? "READ" : "WRITE · CONFIRM"}</span>
  </div>)}</div>;
}

export default function Workspace() {
  const toolId = useMemo(() => location.pathname.match(/^\/tools\/([a-f0-9-]{36})\/?$/i)?.[1], []);
  const [user, setUser] = useState<User | null | undefined>(undefined); const [tools, setTools] = useState<PrivateTool[]>([]);
  const [selected, setSelected] = useState<PrivateTool | null>(null); const [label, setLabel] = useState("My LinkedIn group");
  const [recipients, setRecipients] = useState(""); const [customJson, setCustomJson] = useState("");
  const [message, setMessage] = useState(""); const [busy, setBusy] = useState(false); const [webmcp, setWebmcp] = useState("loading");
  const importPreview = useMemo(() => readImportDocument(customJson), [customJson]);

  async function loadWorkspace(authenticatedUser: User) {
    setUser(authenticatedUser); setMessage("");
    try {
      if (toolId) {
        const result = await postJson<{ tool: PrivateTool }>("/api/private-tool", { toolId }); setSelected(result.tool);
        registerPrivateBootstrapTools(toolId).then(setWebmcp).catch(() => setWebmcp("error"));
      } else {
        const response = await authenticatedFetch("/api/private-tools", { cache: "no-store" });
        if (!response.ok) throw new Error("Private workspace is unavailable.");
        const body = await response.json(); setTools(Array.isArray(body.tools) ? body.tools : []);
        registerPrivateWorkspaceTools().then(setWebmcp).catch(() => setWebmcp("error"));
      }
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : "Private workspace is unavailable."); }
  }
  useEffect(() => { (async () => { try { await handleAuthCallback(); } catch { /* normal outside callbacks */ }
    const current = await getUser(); if (current) await loadWorkspace(current); else setUser(null);
  })(); }, []);

  async function createTemplate(event: FormEvent) {
    event.preventDefault(); setMessage(""); setBusy(true);
    try {
      const recipientProfileUrls = recipients.split(/\r?\n/).map((value) => value.trim()).filter(Boolean);
      const result = await postJson<{ tool: PrivateTool }>("/api/private-tools", { kind: "template", label, recipientProfileUrls });
      setTools((current) => [result.tool, ...current]); setRecipients(""); setMessage("LinkedIn adapter created. Its individual tools are now in your library.");
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : "Tool creation failed."); }
    finally { setBusy(false); }
  }

  async function importCustom(event: FormEvent) {
    event.preventDefault(); setMessage(""); setBusy(true);
    try {
      const document = readImportDocument(customJson);
      if (!document) throw new Error("The import document is missing label, manifest, paths, tools, or source.");
      const encrypted = await encryptPrivateSource(document.source, document.manifest.origins, document.manifest.pathPatterns);
      const result = await postJson<{ tool: PrivateTool }>("/api/private-tools", { kind: "encrypted-custom", label: document.label, manifest: document.manifest, encryptedSource: encrypted.encryptedSource, sourceHash: encrypted.sourceHash });
      savePrivateToolKey(result.tool.id, encrypted.key); setTools((current) => [result.tool, ...current]); setCustomJson("");
      setMessage("Private adapter encrypted in this browser and added. Its source never reached GitHub or Netlify in plaintext.");
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : "Private import failed."); }
    finally { setBusy(false); }
  }

  if (user === undefined) return <main className="workspace"><p className="workspace-loading">Checking your AdapTab session…</p></main>;
  if (!user) return <main className="workspace"><nav><a className="wordmark" href="/start">AdapTab</a><a href="/start">Public catalog</a></nav><AuthPanel onAuthenticated={loadWorkspace} /></main>;
  const actionCount = tools.reduce((count, adapter) => count + adapter.tools.length, 0);

  return <main className="workspace">
    <nav><a className="wordmark" href="/start">AdapTab</a><div className="nav-actions"><a href="/workspace">Workspace</a><button onClick={async () => { await logout(); location.href = "/workspace"; }}>Sign out</button></div></nav>
    <header className="workspace-header"><div><p className="eyebrow">PRIVATE WORKSPACE</p><h1>{toolId ? "Private adapter." : "Your private adapters."}</h1></div><p>{user.email || user.name || "Authenticated owner"}</p></header>
    {toolId ? <section className="workspace-card adapter-detail">
      {selected ? <>
        <div className="adapter-meta"><span className="private-badge">OWNER ONLY</span><span>{selected.encryption === "client-aes-gcm" ? "CLIENT ENCRYPTED" : "REVIEWED TEMPLATE"}</span></div>
        <h2>{selected.label}</h2><p>{selected.origins.join(" · ")} · v{selected.version}</p>
        <div className={`status status-${webmcp}`}><span />Activation tools: {webmcp.replaceAll("_", " ")}</div>
        <h3>{selected.tools.length} WebMCP {selected.tools.length === 1 ? "action" : "actions"}</h3><ToolRows tools={selected.tools} />
        {selected.recipientProfileUrls && <><h3>Fixed LinkedIn recipients</h3><ul>{selected.recipientProfileUrls.map((url) => <li key={url}><a href={url}>{url}</a></li>)}</ul></>}
        {selected.kind === "encrypted-custom" && <div className="notice"><b>Device key:</b> {hasPrivateToolKey(selected.id) ? "available in this browser" : "missing in this browser"}. AdapTab cannot decrypt this source on the server.</div>}
        <div className="notice"><b>Lifecycle:</b> the trusted browser bridge evaluates the bundle only on an expected top-level origin. Full navigation or a new tab requires reinjection.</div>
      </> : <p>Loading private adapter…</p>}{message && <p className="form-error">{message}</p>}
    </section> : <>
      <section className="workspace-card library-card">
        <div className="library-heading"><div><p className="eyebrow">ADAPTER LIBRARY</p><h2>{tools.length} private {tools.length === 1 ? "adapter" : "adapters"}</h2></div><span>{actionCount} WebMCP {actionCount === 1 ? "action" : "actions"}</span></div>
        <div className={`status status-${webmcp}`}><span />Workspace discovery: {webmcp.replaceAll("_", " ")}</div>
        <div className="adapter-packages">{tools.length ? tools.map((adapter) => <a className="adapter-package" key={adapter.id} href={adapter.toolUrl}>
          <div className="package-heading"><div><b>{adapter.label}</b><p>{adapter.origins.join(" · ")} · v{adapter.version}</p></div><span>{adapter.encryption === "client-aes-gcm" ? "ENCRYPTED" : "TEMPLATE"}</span></div><ToolRows tools={adapter.tools} />
        </a>) : <p>No private tools yet. Create from a reviewed template or import an encrypted adapter below.</p>}</div>
      </section>
      <section className="creation-section"><div><p className="eyebrow">ADD TO YOUR LIBRARY</p><h2>Two private paths.</h2></div><div className="workspace-grid">
        <form className="workspace-card" onSubmit={createTemplate}><span className="private-badge">REVIEWED TEMPLATE</span><h2>LinkedIn recipient group</h2><p>Configure the tested preview and confirmed-send workflow. Only the recipient URLs are private data.</p>
          <label>Adapter label<input maxLength={80} minLength={3} required value={label} onChange={(event) => setLabel(event.target.value)} /></label>
          <label>LinkedIn profile URLs<textarea required rows={5} placeholder="One /in/ profile URL per line; maximum 3" value={recipients} onChange={(event) => setRecipients(event.target.value)} /></label>
          <button className="primary-button" disabled={busy} type="submit">Create from template</button></form>
        <form className="workspace-card" onSubmit={importCustom}><span className="private-badge">CLIENT ENCRYPTED</span><h2>Import custom adapter</h2><p>Paste a manifest and source. Encryption happens before upload; the key stays in this browser. Imported code is unreviewed and runs with the target page's access.</p>
          <label>Private adapter JSON<textarea required rows={12} placeholder={importExample} value={customJson} onChange={(event) => setCustomJson(event.target.value)} /></label>
          {importPreview && <div className="permission-preview"><b>Permission preview</b><p><strong>Pages:</strong> {importPreview.manifest.origins.join(", ")} · {importPreview.manifest.pathPatterns.join(", ")}</p><p><strong>Declared network:</strong> {importPreview.manifest.networkAllowlist.length ? importPreview.manifest.networkAllowlist.join(", ") : "none"}</p><ToolRows tools={importPreview.manifest.tools} /><p className="permission-warning">Custom source is owner-supplied and unreviewed. The declared network list is descriptive metadata; the source runs in the page's main world. Import only code you trust.</p></div>}
          <details><summary>Import format</summary><pre>{importExample}</pre></details>
          <button className="primary-button" disabled={busy || !importPreview} type="submit">Encrypt and import</button></form>
      </div>{message && <p className={message.toLowerCase().includes("fail") || message.toLowerCase().includes("invalid") ? "form-error" : "form-message"}>{message}</p>}</section>
    </>}
  </main>;
}

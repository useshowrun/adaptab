import { getUser, handleAuthCallback, login, logout, oauthLogin, signup, type User } from "@netlify/identity";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { postJson } from "./api";
import { registerPrivateBootstrapTools } from "./register-private-tools";

type PrivateTool = {
  id: string;
  label: string;
  version: string;
  recipientProfileUrls: string[];
  toolUrl: string;
  createdAt: string;
};

function AuthPanel({ onAuthenticated }: { onAuthenticated: (user: User) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(action: "login" | "signup") {
    setBusy(true); setError("");
    try {
      const user = action === "login" ? await login(email, password) : await signup(email, password);
      if (user.confirmedAt || action === "login") onAuthenticated(user);
      else setError("Account created. Confirm the email, then sign in.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Authentication failed.");
    } finally { setBusy(false); }
  }

  return <section className="workspace-card auth-card">
    <p className="eyebrow">PRIVATE WORKSPACE</p>
    <h1>Keep your own<br /><em>tools private.</em></h1>
    <p className="lede">Sign in to create owner-only adapters. Private configurations never appear in the public catalog.</p>
    <button className="primary-button" disabled={busy} onClick={() => oauthLogin("github")}>Continue with GitHub</button>
    <div className="auth-divider"><span>or email</span></div>
    <label>Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label>
    <label>Password<input type="password" minLength={6} value={password} onChange={(event) => setPassword(event.target.value)} /></label>
    <div className="button-row">
      <button disabled={busy || !email || password.length < 6} onClick={() => submit("login")}>Sign in</button>
      <button disabled={busy || !email || password.length < 6} onClick={() => submit("signup")}>Create account</button>
    </div>
    {error && <p className="form-error">{error}</p>}
  </section>;
}

export default function Workspace() {
  const toolId = useMemo(() => location.pathname.match(/^\/tools\/([a-f0-9-]{36})\/?$/i)?.[1], []);
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [tools, setTools] = useState<PrivateTool[]>([]);
  const [selected, setSelected] = useState<PrivateTool | null>(null);
  const [label, setLabel] = useState("My LinkedIn test group");
  const [recipients, setRecipients] = useState("");
  const [message, setMessage] = useState("");
  const [webmcp, setWebmcp] = useState("loading");

  async function loadWorkspace(authenticatedUser: User) {
    setUser(authenticatedUser); setMessage("");
    try {
      if (toolId) {
        const result = await postJson<{ tool: PrivateTool }>("/api/private-tool", { toolId });
        setSelected(result.tool);
        registerPrivateBootstrapTools(toolId).then(setWebmcp).catch(() => setWebmcp("error"));
      } else {
        const response = await fetch("/api/private-tools", { credentials: "same-origin", cache: "no-store" });
        if (!response.ok) throw new Error("Private workspace is unavailable.");
        const body = await response.json();
        setTools(Array.isArray(body.tools) ? body.tools : []);
      }
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Private workspace is unavailable.");
    }
  }

  useEffect(() => {
    (async () => {
      try { await handleAuthCallback(); } catch { /* normal when this is not a callback */ }
      const current = await getUser();
      if (current) await loadWorkspace(current); else setUser(null);
    })();
  }, []);

  async function createTool(event: FormEvent) {
    event.preventDefault(); setMessage("");
    try {
      const recipientProfileUrls = recipients.split(/\r?\n/).map((value) => value.trim()).filter(Boolean);
      const result = await postJson<{ tool: PrivateTool }>("/api/private-tools", { label, recipientProfileUrls });
      setTools((current) => [result.tool, ...current]);
      setRecipients("");
      setMessage("Private tool created. Open its activation page to equip an agent.");
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : "Tool creation failed."); }
  }

  if (user === undefined) return <main className="workspace"><p className="workspace-loading">Checking your AdapTab session…</p></main>;
  if (!user) return <main className="workspace"><nav><a className="wordmark" href="/start">AdapTab</a><a href="/start">Public catalog</a></nav><AuthPanel onAuthenticated={loadWorkspace} /></main>;

  return <main className="workspace">
    <nav><a className="wordmark" href="/start">AdapTab</a><div className="nav-actions"><a href="/workspace">Workspace</a><button onClick={async () => { await logout(); location.href = "/workspace"; }}>Sign out</button></div></nav>
    <header className="workspace-header"><div><p className="eyebrow">PRIVATE WORKSPACE</p><h1>{toolId ? "Private tool." : "Your tools."}</h1></div><p>{user.email || user.name || "Authenticated owner"}</p></header>
    {toolId ? <section className="workspace-card">
      {selected ? <>
        <span className="private-badge">OWNER ONLY</span><h2>{selected.label}</h2>
        <p>This activation page exposes two authenticated WebMCP bootstrap tools: inspect this configuration and retrieve its reviewed installer.</p>
        <div className={`status status-${webmcp}`}><span />WebMCP bootstrap: {webmcp.replaceAll("_", " ")}</div>
        <h3>Fixed LinkedIn recipients</h3>
        <ul>{selected.recipientProfileUrls.map((url) => <li key={url}><a href={url}>{url}</a></li>)}</ul>
        <div className="notice"><b>Lifecycle:</b> evaluate the returned source in a signed-in LinkedIn top-level page. Full navigation or a new tab requires agent-level reinjection.</div>
      </> : <p>Loading private tool…</p>}
      {message && <p className="form-error">{message}</p>}
    </section> : <div className="workspace-grid">
      <form className="workspace-card" onSubmit={createTool}>
        <p className="eyebrow">NEW PRIVATE TOOL</p><h2>Fixed recipient group</h2>
        <p>Create a bounded LinkedIn messaging adapter from reviewed code. Arbitrary JavaScript is not accepted.</p>
        <label>Tool label<input maxLength={80} minLength={3} required value={label} onChange={(event) => setLabel(event.target.value)} /></label>
        <label>LinkedIn profile URLs<textarea required rows={5} placeholder="One /in/ profile URL per line; maximum 3" value={recipients} onChange={(event) => setRecipients(event.target.value)} /></label>
        <button className="primary-button" type="submit">Create private tool</button>
        {message && <p className="form-message">{message}</p>}
      </form>
      <section className="workspace-card"><p className="eyebrow">YOUR LIBRARY</p><h2>{tools.length} private {tools.length === 1 ? "tool" : "tools"}</h2>
        <div className="private-list">{tools.length ? tools.map((tool) => <a key={tool.id} href={tool.toolUrl}><b>{tool.label}</b><span>{tool.recipientProfileUrls.length} fixed recipients · Open activation page →</span></a>) : <p>No private tools yet.</p>}</div>
      </section>
    </div>}
  </main>;
}

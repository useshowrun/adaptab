import { useEffect, useState } from "react";
import { registerBootstrapTools } from "./register-bootstrap";

type BootstrapState = "loading" | "registered" | "already_registered" | "unsupported" | "error";
type AdapterSummary = {
  id: string;
  version: string;
  product: string;
  tools: Array<{ name: string; readOnly: boolean }>;
};

export default function App() {
  const [state, setState] = useState<BootstrapState>("loading");
  const [adapters, setAdapters] = useState<AdapterSummary[]>([]);

  useEffect(() => {
    registerBootstrapTools().then(setState).catch(() => setState("error"));
    fetch(`/api/catalog?fresh=${Date.now()}`, {
      cache: "no-store",
      headers: { accept: "application/json" },
    })
      .then((response) => {
        if (!response.ok) throw new Error("Catalog unavailable");
        return response.json();
      })
      .then((body) => setAdapters(Array.isArray(body.adapters) ? body.adapters : []))
      .catch(() => setAdapters([]));
  }, []);

  const message = {
    loading: "Registering bootstrap tools…",
    registered: "Four bootstrap tools are ready in this tab.",
    already_registered: "Bootstrap tools are already active in this document.",
    unsupported: "This browser does not expose WebMCP to the page.",
    error: "WebMCP was available, but tool registration failed.",
  }[state];

  return (
    <main>
      <nav><a className="wordmark" href="/start">AdapTab</a><a href="https://github.com/useshowrun/showrun">Prior art: Showrun</a></nav>
      <section className="hero">
        <p className="eyebrow">OPEN ADAPTER CATALOG</p>
        <h1>WebMCP for<br /><em>every tab.</em></h1>
        <p className="lede">Give an agent one starting page. AdapTab resolves a reviewed adapter and equips the site you already opened—using your live browser session, without exporting credentials.</p>
        <div className={`status status-${state}`}><span aria-hidden="true" />{message}</div>
      </section>
      <section className="flow" aria-label="How AdapTab works">
        <article><b>01</b><h2>Resolve</h2><p>Match the target origin, route, intent, and browser capability.</p></article>
        <article><b>02</b><h2>Equip</h2><p>Return a versioned installer with an exact origin guard and SHA-256.</p></article>
        <article><b>03</b><h2>Use</h2><p>Register bounded tools inside the authenticated top-level page.</p></article>
      </section>
      <section className="catalog-section">
        <div className="catalog-heading">
          <div><p className="eyebrow">LIVE CATALOG</p><h2>Small tools.<br />Exact routes.</h2></div>
          <p>{adapters.length || "—"} reviewed adapters available</p>
        </div>
        <div className="adapter-list">
          {adapters.length ? adapters.map((adapter, index) => (
            <article key={adapter.id}>
              <b>{String(index + 1).padStart(2, "0")}</b>
              <div><h3>{adapter.product}</h3><p>{adapter.tools.map((tool) => tool.name).join(" · ")}</p></div>
              <span>{adapter.tools.every((tool) => tool.readOnly) ? "READ ONLY" : "CONFIRMATION"}</span>
              <code>{adapter.id}@{adapter.version}</code>
            </article>
          )) : <p className="catalog-loading">Loading the public catalog…</p>}
        </div>
      </section>
      <footer><span>Hackathon MVP · 2026</span><span>No cookie leaves the target page.</span></footer>
    </main>
  );
}

import { useEffect, useState } from "react";
import { registerBootstrapTools } from "./register-bootstrap";

type BootstrapState = "loading" | "registered" | "already_registered" | "unsupported" | "error";

export default function App() {
  const [state, setState] = useState<BootstrapState>("loading");

  useEffect(() => {
    registerBootstrapTools().then(setState).catch(() => setState("error"));
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
      <section className="catalog">
        <div><p className="eyebrow">LIVE ADAPTER</p><h2>Raising.fi</h2></div>
        <p>Public funding search · read-only · no login · current document</p>
        <code>raising-fi.public.funding@1.0.0</code>
      </section>
      <footer><span>Hackathon MVP · 2026</span><span>No cookie leaves the target page.</span></footer>
    </main>
  );
}

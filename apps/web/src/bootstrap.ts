import { registerBootstrapTools } from "./register-bootstrap";

const status = document.getElementById("status");

function setStatus(message: string) {
  if (status) status.textContent = message;
}

registerBootstrapTools()
  .then((result) => {
    setStatus(result === "unsupported"
      ? "This browser does not expose WebMCP to this page."
      : "AdapTab tools are ready. Keep this page available while the agent works.");
  })
  .catch(() => setStatus("AdapTab could not register its WebMCP tools."));

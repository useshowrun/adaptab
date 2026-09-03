import { defineConfig } from "vitest/config";
import type { IncomingMessage, ServerResponse } from "node:http";
import react from "@vitejs/plugin-react";
import type { Plugin } from "vite";
import bundle from "./netlify/functions/bundle.mts";
import catalog from "./netlify/functions/catalog.mts";
import reportResult from "./netlify/functions/report-result.mts";
import requestAdapter from "./netlify/functions/request-adapter.mts";
import resolve from "./netlify/functions/resolve.mts";
import privateTools from "./netlify/functions/private-tools.mts";
import privateTool from "./netlify/functions/private-tool.mts";
import privateBundle from "./netlify/functions/private-bundle.mts";

type FunctionHandler = (request: Request) => Promise<Response>;

function localFunctionBridge(): Plugin {
  const handlers: Record<string, FunctionHandler> = {
    "/api/bundle": bundle,
    "/api/catalog": catalog,
    "/api/report-result": reportResult,
    "/api/request-adapter": requestAdapter,
    "/api/resolve": resolve,
    "/api/private-tools": privateTools,
    "/api/private-tool": privateTool,
    "/api/private-bundle": privateBundle,
  };

  return {
    name: "adaptab-local-functions",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use(async (req: IncomingMessage, res: ServerResponse, next) => {
        const url = new URL(req.url ?? "/", "http://127.0.0.1:5173");
        const handler = handlers[url.pathname];
        if (!handler) return next();
        const chunks: Buffer[] = [];
        for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        const body = Buffer.concat(chunks);
        const request = new Request(url, {
          method: req.method,
          headers: req.headers as HeadersInit,
          ...(body.length ? { body } : {}),
        });
        const response = await handler(request);
        res.statusCode = response.status;
        response.headers.forEach((value, key) => res.setHeader(key, value));
        res.end(Buffer.from(await response.arrayBuffer()));
      });
    },
  };
}

export default defineConfig({
  root: "apps/web",
  plugins: [react(), localFunctionBridge()],
  build: {
    outDir: "../../dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: new URL("./apps/web/index.html", import.meta.url).pathname,
        bootstrap: new URL("./apps/web/bootstrap.html", import.meta.url).pathname,
      },
    },
  },
  test: { include: ["tests/**/*.test.ts"] },
});

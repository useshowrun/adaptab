import { getUser, verifyRequestOrigin } from "@netlify/identity";
import type { Config } from "@netlify/functions";
import {
  createPrivateToolRecord,
  createEncryptedPrivateToolRecord,
  summarizePrivateTool,
  type PrivateToolRepository,
} from "../../packages/private-tools/src/index";
import { assertKeys, handleError, HttpError, json, parseJsonBody } from "./_shared/http.mts";
import { BlobPrivateToolRepository } from "./_shared/private-tools.mts";

type User = { id: string; email?: string };
type Dependencies = {
  currentUser: () => Promise<User | null>;
  repository: PrivateToolRepository;
  verifyOrigin: (request: Request) => void;
};

function protectOrigin(request: Request) {
  try {
    verifyRequestOrigin(request);
  } catch {
    throw new HttpError(403, "origin_rejected", "This private-tool request must come from the AdapTab origin.");
  }
}

export function createPrivateToolsHandler(dependencies: Dependencies) {
  return async (request: Request) => {
    try {
      const user = await dependencies.currentUser();
      if (!user) throw new HttpError(401, "authentication_required", "Sign in to access your private workspace.");
      if (request.method === "GET") {
        const records = await dependencies.repository.list(user.id);
        return json({ user: { id: user.id, email: user.email }, tools: records.map(summarizePrivateTool) });
      }
      dependencies.verifyOrigin(request);
      const body = await parseJsonBody(request, 150000);
      const existing = await dependencies.repository.list(user.id);
      if (existing.length >= 20) {
        throw new HttpError(409, "private_tool_limit", "This MVP workspace is limited to 20 private tools.");
      }
      let record;
      try {
        if (body.kind === "encrypted-custom") {
          assertKeys(body, ["kind", "label", "manifest", "encryptedSource", "sourceHash"]);
          record = createEncryptedPrivateToolRecord(user.id, {
            label: body.label,
            manifest: body.manifest,
            encryptedSource: body.encryptedSource,
            sourceHash: body.sourceHash,
          });
        } else {
          assertKeys(body, ["kind", "label", "recipientProfileUrls"]);
          if (body.kind !== undefined && body.kind !== "template") throw new Error("kind is not supported.");
          record = createPrivateToolRecord(user.id, {
            label: body.label,
            recipientProfileUrls: body.recipientProfileUrls,
          });
        }
      } catch (error) {
        throw new HttpError(400, "invalid_input", error instanceof Error ? error.message : "The private tool is invalid.");
      }
      await dependencies.repository.put(record);
      return json({ tool: summarizePrivateTool(record) }, 201);
    } catch (error) {
      return handleError(error);
    }
  };
}

const handler = createPrivateToolsHandler({
  currentUser: getUser,
  repository: new BlobPrivateToolRepository(),
  verifyOrigin: protectOrigin,
});

export default handler;
export const config: Config = { path: "/api/private-tools" };

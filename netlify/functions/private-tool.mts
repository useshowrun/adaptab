import { getUser, verifyRequestOrigin } from "@netlify/identity";
import type { Config } from "@netlify/functions";
import { summarizePrivateTool, type PrivateToolRepository } from "../../packages/private-tools/src/index";
import { assertKeys, handleError, HttpError, json, parseJsonBody, requireString } from "./_shared/http.mts";
import { BlobPrivateToolRepository } from "./_shared/private-tools.mts";

type Dependencies = {
  currentUser: () => Promise<{ id: string } | null>;
  repository: PrivateToolRepository;
  verifyOrigin: (request: Request) => void;
};

function protectOrigin(request: Request) {
  try { verifyRequestOrigin(request); }
  catch { throw new HttpError(403, "origin_rejected", "This private-tool request must come from the AdapTab origin."); }
}

export function createPrivateToolHandler(dependencies: Dependencies) {
  return async (request: Request) => {
    try {
      const user = await dependencies.currentUser();
      if (!user) throw new HttpError(401, "authentication_required", "Sign in to access this private tool.");
      dependencies.verifyOrigin(request);
      const body = await parseJsonBody(request, 1024);
      assertKeys(body, ["toolId"]);
      const toolId = requireString(body, "toolId", { min: 36, max: 36 })!;
      if (!/^[a-f0-9-]{36}$/i.test(toolId)) throw new HttpError(400, "invalid_input", "toolId is invalid.");
      const record = await dependencies.repository.get(user.id, toolId);
      if (!record) throw new HttpError(404, "private_tool_not_found", "This private tool is unavailable to the signed-in user.");
      return json({ tool: summarizePrivateTool(record) });
    } catch (error) { return handleError(error); }
  };
}

export default createPrivateToolHandler({ currentUser: getUser, repository: new BlobPrivateToolRepository(), verifyOrigin: protectOrigin });
export const config: Config = { path: "/api/private-tool" };

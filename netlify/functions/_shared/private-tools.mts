import { createHash } from "node:crypto";
import { getStore } from "@netlify/blobs";
import type { PrivateToolRecord, PrivateToolRepository } from "../../../packages/private-tools/src/index";

function ownerPrefix(ownerId: string) {
  return `owners/${createHash("sha256").update(ownerId, "utf8").digest("hex")}/tools/`;
}

export class BlobPrivateToolRepository implements PrivateToolRepository {
  private get store() {
    return getStore({
      name: `adaptab-${process.env.CONTEXT || "local"}-private-tools`,
      consistency: "strong",
    });
  }

  async list(ownerId: string): Promise<PrivateToolRecord[]> {
    const prefix = ownerPrefix(ownerId);
    const result = await this.store.list({ prefix });
    const records = await Promise.all(result.blobs.map(({ key }) => this.store.get(key, { type: "json" }) as Promise<PrivateToolRecord | null>));
    return records.filter((record): record is PrivateToolRecord => Boolean(record)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async get(ownerId: string, toolId: string): Promise<PrivateToolRecord | null> {
    return this.store.get(`${ownerPrefix(ownerId)}${toolId}`, { type: "json" }) as Promise<PrivateToolRecord | null>;
  }

  async put(record: PrivateToolRecord): Promise<void> {
    await this.store.setJSON(`${ownerPrefix(record.ownerId)}${record.id}`, record, { onlyIfNew: true });
  }
}

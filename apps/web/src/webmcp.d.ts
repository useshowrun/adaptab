interface ModelContextToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations?: Record<string, unknown>;
  execute: (input: unknown) => Promise<unknown> | unknown;
}

interface Document {
  modelContext?: {
    registerTool(tool: ModelContextToolDefinition): Promise<void> | void;
  };
}

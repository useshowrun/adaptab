import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import { openAiDocsBundleSource } from "../adapters/openai/docs/bundle";

type RegisteredTool = { name: string; execute?: (input?: unknown) => Promise<unknown> };

class MockNode {
  textContent: string;
  tagName: string;
  parentElement: MockNode | null = null;
  previousElementSibling: MockNode | null = null;
  private attributes: Record<string, string>;
  private one = new Map<string, MockNode | null>();
  private many = new Map<string, MockNode[]>();
  private ancestors = new Map<string, MockNode | null>();

  constructor(textContent = "", options: { tagName?: string; attributes?: Record<string, string> } = {}) {
    this.textContent = textContent;
    this.tagName = options.tagName ?? "DIV";
    this.attributes = options.attributes ?? {};
  }

  setQuery(selector: string, value: MockNode | null) {
    this.one.set(selector, value);
    return this;
  }

  setQueryAll(selector: string, value: MockNode[]) {
    this.many.set(selector, value);
    return this;
  }

  setClosest(selector: string, value: MockNode | null) {
    this.ancestors.set(selector, value);
    return this;
  }

  querySelector(selector: string) {
    return this.one.get(selector) ?? null;
  }

  querySelectorAll(selector: string) {
    return this.many.get(selector) ?? [];
  }

  closest(selector: string) {
    return this.ancestors.get(selector) ?? null;
  }

  getAttribute(name: string) {
    return this.attributes[name] ?? null;
  }
}

function codeBlock(code: string, language: string, sectionName: string) {
  const heading = new MockNode(sectionName, { tagName: "H2", attributes: { id: "create-a-response" } });
  const section = new MockNode().setQuery("h1, h2, h3, h4, h5, h6", heading);
  const pre = new MockNode(code, { tagName: "PRE" });
  const node = new MockNode(code, { tagName: "CODE", attributes: { class: `language-${language}` } });
  node.setClosest("pre", pre);
  node.setClosest("section, article", section);
  node.setClosest("[data-stldocs-language], [data-language], [data-lang]", null);
  node.setClosest(".stldocs-snippet, .stldocs-snippet-multi-pane", null);
  return node;
}

function propertyNode({
  name,
  type,
  description,
  optional = false,
  nested = false,
}: {
  name: string;
  type: string;
  description: string;
  optional?: boolean;
  nested?: boolean;
}) {
  const nameNode = new MockNode(name);
  const typeNode = new MockNode(type);
  const declaration = new MockNode(`${name}: ${optional ? "optional " : ""}${type}`)
    .setQuery(".stldocs-type-propertyname .stldocs-text-identifier", nameNode)
    .setQuery(".stldocs-type", typeNode);
  const descriptionNode = new MockNode(description);
  const constraintName = new MockNode("maximum");
  const constraintValue = new MockNode("20");
  const constraint = new MockNode()
    .setQuery(".stldocs-property-constraint-name", constraintName)
    .setQuery(".stldocs-property-constraint-value", constraintValue);
  const suffix = nested ? " > (property) nested" : "";
  const info = new MockNode("", { attributes: { id: `(resource) responses > (method) create > (param) ${name} > (schema)${suffix}` } })
    .setQuery(".stldocs-property-declaration", declaration)
    .setQuery(".stldocs-property-description", descriptionNode)
    .setQueryAll(".stldocs-property-constraint", [constraint]);
  const node = new MockNode("", { attributes: { "data-stldocs-language": "http", class: "stldocs-property" } })
    .setQuery(".stldocs-property-info", info);
  node.setClosest("[data-stldocs-language]", node);
  if (nested) node.parentElement = new MockNode("", { attributes: { class: "stldocs-property" } });
  return node;
}

function makePage(origin = "https://developers.openai.com") {
  const registered: RegisteredTool[] = [{ name: "search_openai_docs" }];
  const codeNodes = [
    codeBlock("const response = await client.responses.create({ input: 'hello' });", "typescript", "Create a response"),
    codeBlock("response = client.responses.create(input='hello')", "python", "Create a response"),
  ];
  const schemaNodes = [
    propertyNode({ name: "input", type: "string or array", description: "Text, image, or file input for the model." }),
    propertyNode({ name: "background", type: "boolean", description: "Run the response in the background.", optional: true }),
    propertyNode({ name: "compact_threshold", type: "number", description: "Nested compaction threshold.", optional: true, nested: true }),
  ];
  const method = new MockNode("", { attributes: { "data-stldocs-method": "post" } });
  const root = new MockNode()
    .setQueryAll("pre code", codeNodes)
    .setQueryAll(".stldocs-method-parameters[data-stldocs-property-group='body'] .stldocs-property", schemaNodes)
    .setQueryAll("table", [])
    .setQuery("[data-stldocs-method]", method);
  const documentNode = new MockNode();
  Object.assign(documentNode, {
    title: "Create a model response",
    modelContext: { registerTool: async (tool: RegisteredTool) => { registered.push(tool); } },
  });
  documentNode.setQuery("main, article", root);
  documentNode.setQuery("[data-stldocs-method][aria-current='page']", method);
  const pageWindow: Record<string, unknown> = {};
  pageWindow.top = pageWindow;
  const context = {
    window: pageWindow,
    document: documentNode,
    location: { origin, href: `${origin}/api/reference/resources/responses/methods/create`, pathname: "/api/reference/resources/responses/methods/create" },
    URL,
    Set,
  };
  return { context, registered, root };
}

function findTool(registered: RegisteredTool[], name: string) {
  const tool = registered.find((candidate) => candidate.name === name);
  if (!tool?.execute) throw new Error(`Missing executable tool ${name}.`);
  return tool.execute;
}

describe("OpenAI Docs public installer", () => {
  it("supplements a native tool set exactly once with two namespaced read tools", async () => {
    const { context, registered } = makePage();
    await expect(runInNewContext(openAiDocsBundleSource, context)).resolves.toMatchObject({ status: "installed" });
    await expect(runInNewContext(openAiDocsBundleSource, context)).resolves.toMatchObject({ status: "already_installed" });
    expect(registered.map(({ name }) => name)).toEqual([
      "search_openai_docs",
      "adaptab_openai_docs_extract_code_examples",
      "adaptab_openai_docs_read_api_schema",
    ]);
  });

  it("guards both approved origins and rejects lookalikes and iframes", async () => {
    await expect(runInNewContext(openAiDocsBundleSource, makePage("https://learn.chatgpt.com").context)).resolves.toMatchObject({ status: "installed" });
    await expect(runInNewContext(openAiDocsBundleSource, makePage("https://developers.openai.com.evil.test").context)).rejects.toThrow("origin guard");
    const iframe = makePage();
    iframe.context.window.top = {};
    await expect(runInNewContext(openAiDocsBundleSource, iframe.context)).rejects.toThrow("top-level");
  });

  it("extracts and filters bounded code examples from the live page", async () => {
    const { context, registered } = makePage();
    await runInNewContext(openAiDocsBundleSource, context);
    const execute = findTool(registered, "adaptab_openai_docs_extract_code_examples");
    await expect(execute({ language: "ts", contains: "responses.create", limit: 2 })).resolves.toMatchObject({
      ok: true,
      count: 1,
      totalMatches: 1,
      examples: [{ language: "typescript", section: "Create a response", sourceLink: expect.stringContaining("#create-a-response") }],
    });
    await expect(execute({ language: "rust", limit: 2 })).resolves.toMatchObject({ count: 0, hint: expect.stringContaining("live DOM") });
    await expect(execute({ limit: 11 })).rejects.toThrow("limit must be an integer");
    await expect(execute({ unknown: true })).rejects.toThrow("unsupported fields");
  });

  it("reads semantic API parameters and optionally includes nested properties", async () => {
    const { context, registered } = makePage();
    await runInNewContext(openAiDocsBundleSource, context);
    const execute = findTool(registered, "adaptab_openai_docs_read_api_schema");
    await expect(execute({ query: "background", language: "HTTP" })).resolves.toMatchObject({
      ok: true,
      method: "POST",
      count: 1,
      parameters: [{ name: "background", type: "boolean", required: false, nestedDepth: 0 }],
    });
    const nested = await execute({ includeNested: true, limit: 50 }) as { parameters: Array<{ name: string; anchor: string }> };
    expect(nested.parameters.map(({ name }) => name)).toEqual(["input", "background", "compact_threshold"]);
    expect(nested.parameters[0].anchor).toContain("https://developers.openai.com/api/reference/");
    await expect(execute({ includeNested: "yes" })).rejects.toThrow("includeNested must be a boolean");

    const fallback = makePage();
    const table = new MockNode()
      .setQueryAll("thead th", [new MockNode("Parameter"), new MockNode("Type"), new MockNode("Required"), new MockNode("Description")])
      .setQueryAll("tbody tr", [
        new MockNode().setQueryAll("th, td", [new MockNode("model"), new MockNode("string"), new MockNode("required"), new MockNode("Model identifier.")]),
      ]);
    fallback.root
      .setQueryAll(".stldocs-method-parameters[data-stldocs-property-group='body'] .stldocs-property", [])
      .setQueryAll("table", [table]);
    await runInNewContext(openAiDocsBundleSource, fallback.context);
    await expect(findTool(fallback.registered, "adaptab_openai_docs_read_api_schema")({ query: "model" })).resolves.toMatchObject({
      count: 1,
      parameters: [{ name: "model", type: "string", required: true, description: "Model identifier." }],
    });
  });
});

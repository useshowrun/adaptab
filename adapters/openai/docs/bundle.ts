export const openAiDocsBundleSource = String.raw`(async () => {
  "use strict";
  const ADAPTER_ID = "openai.docs.page-extractors";
  const VERSION = "1.0.0";
  const ALLOWED_ORIGINS = ["https://developers.openai.com", "https://learn.chatgpt.com"];
  const TOOL_NAMES = [
    "adaptab_openai_docs_extract_code_examples",
    "adaptab_openai_docs_read_api_schema"
  ];
  const marker = "__adaptab__" + ADAPTER_ID.replace(/[^a-z0-9]/gi, "_");

  const assertPage = () => {
    if (!ALLOWED_ORIGINS.includes(location.origin)) {
      throw new Error("AdapTab origin guard rejected " + location.origin + " for " + ADAPTER_ID + ".");
    }
  };
  assertPage();
  if (window.top !== window) {
    throw new Error("AdapTab adapters must be installed in the top-level document.");
  }
  if (typeof document.modelContext?.registerTool !== "function") {
    throw new Error("This document does not expose the WebMCP registerTool API.");
  }

  const previous = window[marker];
  if (previous?.installing === true) {
    return { ok: false, status: "installation_in_progress", adapterId: ADAPTER_ID, version: VERSION };
  }
  if (previous?.version === VERSION && previous?.installed === true) {
    return { ok: true, status: "already_installed", adapterId: ADAPTER_ID, version: VERSION, tools: TOOL_NAMES };
  }

  const array = (value) => Array.from(value || []);
  const query = (node, selector) => typeof node?.querySelector === "function" ? node.querySelector(selector) : null;
  const queryAll = (node, selector) => typeof node?.querySelectorAll === "function" ? array(node.querySelectorAll(selector)) : [];
  const closest = (node, selector) => typeof node?.closest === "function" ? node.closest(selector) : null;
  const attribute = (node, name) => typeof node?.getAttribute === "function" ? node.getAttribute(name) : null;
  const clean = (value, maximum = 300) => typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, maximum) : "";
  const rawText = (node) => typeof node?.textContent === "string" ? node.textContent.trim() : "";
  const assertObject = (input, allowed) => {
    if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).some((key) => !allowed.includes(key))) {
      throw new Error("Input contains unsupported fields.");
    }
  };
  const optionalText = (value, name, maximum) => {
    if (value === undefined) return null;
    if (typeof value !== "string" || value.trim().length < 1 || value.trim().length > maximum) {
      throw new Error(name + " must contain 1 through " + maximum + " characters.");
    }
    return value.trim();
  };
  const integer = (value, fallback, maximum, name) => {
    const result = value ?? fallback;
    if (typeof result !== "number" || !Number.isInteger(result) || result < 1 || result > maximum) {
      throw new Error(name + " must be an integer from 1 through " + maximum + ".");
    }
    return result;
  };
  const canonicalLanguage = (value) => {
    const normalized = clean(value, 40).toLocaleLowerCase("en-US");
    if (["js", "javascript", "node", "node.js", "nodejs"].includes(normalized)) return "javascript";
    if (["ts", "typescript"].includes(normalized)) return "typescript";
    if (["py", "python"].includes(normalized)) return "python";
    if (["sh", "shell", "bash", "zsh"].includes(normalized)) return "shell";
    if (["curl", "c-url"].includes(normalized)) return "curl";
    return normalized;
  };
  const elementTag = (node) => clean(node?.tagName, 10).toLocaleLowerCase("en-US");
  const isHeading = (node) => /^h[1-6]$/.test(elementTag(node));
  const sectionDetailsFor = (node) => {
    const details = (heading) => {
      const section = clean(heading?.textContent, 240);
      if (!section) return null;
      const id = clean(attribute(heading, "id"), 500);
      return {
        section,
        sourceLink: id ? location.origin + location.pathname + "#" + encodeURIComponent(id) : page().url
      };
    };
    let current = node;
    for (let depth = 0; current && depth < 7; depth += 1) {
      let sibling = current.previousElementSibling;
      for (let scanned = 0; sibling && scanned < 12; scanned += 1) {
        if (isHeading(sibling)) {
          const result = details(sibling);
          if (result) return result;
        }
        const nestedHeadings = queryAll(sibling, "h1, h2, h3, h4, h5, h6");
        const nestedHeading = nestedHeadings[nestedHeadings.length - 1];
        const nestedResult = details(nestedHeading);
        if (nestedResult) return nestedResult;
        sibling = sibling.previousElementSibling;
      }
      current = current.parentElement;
    }
    const ownedSection = closest(node, "section, article");
    const ownedHeading = query(ownedSection, "h1, h2, h3, h4, h5, h6");
    const ownedResult = details(ownedHeading);
    if (ownedResult) return ownedResult;
    return {
      section: clean(query(document, "main h1, article h1, h1")?.textContent || document.title, 240),
      sourceLink: page().url
    };
  };
  const languageFor = (node) => {
    const pre = closest(node, "pre") || node;
    const languageOwner = closest(node, "[data-stldocs-language], [data-language], [data-lang]");
    const snippet = closest(node, ".stldocs-snippet, .stldocs-snippet-multi-pane");
    const currentValue = query(snippet, "[data-current-value]");
    const label = query(snippet, ".stl-snippet-dropdown-button-text");
    const candidates = [
      attribute(node, "data-language"), attribute(node, "data-lang"),
      attribute(pre, "data-language"), attribute(pre, "data-lang"),
      attribute(languageOwner, "data-stldocs-language"), attribute(languageOwner, "data-language"),
      attribute(currentValue, "data-current-value"), label?.textContent
    ];
    for (const candidate of candidates) {
      const normalized = canonicalLanguage(candidate);
      if (normalized) return normalized;
    }
    const classes = [attribute(node, "class"), attribute(pre, "class")].filter(Boolean).join(" ");
    const classMatch = classes.match(/(?:language|lang)-([a-z0-9+#.-]+)/i);
    return classMatch ? canonicalLanguage(classMatch[1]) : "unknown";
  };
  const page = () => ({ title: clean(document.title, 240), url: clean(location.href, 1000) });

  window[marker] = { version: VERSION, installed: false, installing: true };
  try {
    const registrations = [
      document.modelContext.registerTool({
        name: TOOL_NAMES[0],
        description: "Extract bounded code examples from the currently open OpenAI documentation page through a third-party AdapTab adapter. Filter by language or text without replacing the site's native search and navigation tools.",
        inputSchema: {
          type: "object",
          properties: {
            language: { type: "string", minLength: 1, maxLength: 40, description: "Optional language label, such as TypeScript, Python, curl, HTTP, or JSON." },
            contains: { type: "string", minLength: 1, maxLength: 120, description: "Optional case-insensitive text to match in code or its section heading." },
            limit: { type: "integer", minimum: 1, maximum: 10, default: 5, description: "Maximum examples to return from the live page." }
          },
          additionalProperties: false
        },
        annotations: { readOnlyHint: true },
        execute: async (input = {}) => {
          assertPage();
          assertObject(input, ["language", "contains", "limit"]);
          const requestedLanguage = optionalText(input.language, "language", 40);
          const contains = optionalText(input.contains, "contains", 120);
          const limit = integer(input.limit, 5, 10, "limit");
          const root = query(document, "main, article") || document;
          let nodes = queryAll(root, "pre code");
          if (nodes.length === 0) nodes = queryAll(root, "pre");
          const all = [];
          const seen = new Set();
          for (const node of nodes) {
            const unboundedCode = rawText(node);
            if (!unboundedCode) continue;
            const language = languageFor(node);
            const sectionDetails = sectionDetailsFor(node);
            const key = language + "\n" + unboundedCode;
            if (seen.has(key)) continue;
            seen.add(key);
            all.push({
              language,
              ...sectionDetails,
              code: unboundedCode.slice(0, 12000),
              truncated: unboundedCode.length > 12000
            });
          }
          const languageFilter = requestedLanguage ? canonicalLanguage(requestedLanguage) : null;
          const containsFilter = contains ? contains.toLocaleLowerCase("en-US") : null;
          const matches = all.filter((example) => {
            const matchesLanguage = !languageFilter || canonicalLanguage(example.language) === languageFilter;
            const haystack = (example.section + "\n" + example.code).toLocaleLowerCase("en-US");
            return matchesLanguage && (!containsFilter || haystack.includes(containsFilter));
          });
          return {
            ok: true,
            source: "Current OpenAI documentation DOM via a third-party AdapTab adapter",
            page: page(),
            filters: { language: requestedLanguage, contains },
            availableLanguages: [...new Set(all.map((example) => example.language))].sort(),
            count: Math.min(matches.length, limit),
            totalMatches: matches.length,
            truncated: matches.length > limit || matches.some((example) => example.truncated),
            examples: matches.slice(0, limit),
            hint: matches.length === 0 && requestedLanguage
              ? "No matching code block is present in the live DOM. Select that language in OpenAI Docs or navigate to its language-specific API reference page, then retry."
              : null
          };
        }
      }),
      document.modelContext.registerTool({
        name: TOOL_NAMES[1],
        description: "Read a bounded, structured API parameter schema from the currently open OpenAI API reference page through a third-party AdapTab adapter. Uses semantic reference markup with a table fallback.",
        inputSchema: {
          type: "object",
          properties: {
            query: { type: "string", minLength: 1, maxLength: 120, description: "Optional case-insensitive filter over parameter name, type, declaration, and description." },
            language: { type: "string", minLength: 1, maxLength: 40, description: "Optional API reference language, such as HTTP, Python, TypeScript, Java, or Go." },
            includeNested: { type: "boolean", default: false, description: "Include nested object properties as well as top-level request parameters." },
            limit: { type: "integer", minimum: 1, maximum: 50, default: 20, description: "Maximum parameters to return from the live page." }
          },
          additionalProperties: false
        },
        annotations: { readOnlyHint: true },
        execute: async (input = {}) => {
          assertPage();
          assertObject(input, ["query", "language", "includeNested", "limit"]);
          const textFilter = optionalText(input.query, "query", 120);
          const requestedLanguage = optionalText(input.language, "language", 40);
          if (input.includeNested !== undefined && typeof input.includeNested !== "boolean") {
            throw new Error("includeNested must be a boolean.");
          }
          const includeNested = input.includeNested === true;
          const limit = integer(input.limit, 20, 50, "limit");
          const root = query(document, "main, article") || document;
          const structuredNodes = queryAll(root, ".stldocs-method-parameters[data-stldocs-property-group='body'] .stldocs-property");
          const parameters = [];
          for (const node of structuredNodes) {
            const info = query(node, ".stldocs-property-info");
            const declarationNode = query(info, ".stldocs-property-declaration");
            const nameNode = query(declarationNode, ".stldocs-type-propertyname .stldocs-text-identifier") || query(declarationNode, ".stldocs-text-identifier");
            const name = clean(nameNode?.textContent, 160);
            if (!name) continue;
            const id = clean(attribute(info, "id"), 1000);
            let nestedDepth = 0;
            let ancestor = node.parentElement;
            for (let depth = 0; ancestor && depth < 30; depth += 1) {
              const classes = clean(attribute(ancestor, "class"), 500).split(" ");
              if (classes.includes("stldocs-property")) nestedDepth += 1;
              ancestor = ancestor.parentElement;
            }
            if (!includeNested && nestedDepth > 0) continue;
            const declaration = clean(declarationNode?.textContent, 500);
            const type = clean(query(declarationNode, ".stldocs-type")?.textContent, 300);
            const description = clean(query(info, ".stldocs-property-description")?.textContent, 1200);
            const languageOwner = closest(node, "[data-stldocs-language]") || node;
            const language = canonicalLanguage(attribute(languageOwner, "data-stldocs-language")) || "unknown";
            const constraints = queryAll(info, ".stldocs-property-constraint").map((constraint) => ({
              name: clean(query(constraint, ".stldocs-property-constraint-name")?.textContent, 80),
              value: clean(query(constraint, ".stldocs-property-constraint-value")?.textContent, 160)
            })).filter((constraint) => constraint.name && constraint.value);
            parameters.push({
              name,
              type,
              required: !/\boptional\b/i.test(declaration),
              declaration,
              description,
              constraints,
              language,
              nestedDepth,
              anchor: id ? location.origin + location.pathname + "#" + encodeURIComponent(id) : null
            });
          }

          if (parameters.length === 0) {
            for (const table of queryAll(root, "table")) {
              const headers = queryAll(table, "thead th").map((cell) => clean(cell.textContent, 80).toLocaleLowerCase("en-US"));
              if (!headers.some((header) => /parameter|property|field|name/.test(header))) continue;
              const nameIndex = headers.findIndex((header) => /parameter|property|field|name/.test(header));
              const typeIndex = headers.findIndex((header) => /type/.test(header));
              const requiredIndex = headers.findIndex((header) => /required|optional/.test(header));
              const descriptionIndex = headers.findIndex((header) => /description|details/.test(header));
              for (const row of queryAll(table, "tbody tr")) {
                const cells = queryAll(row, "th, td");
                const name = clean(cells[nameIndex]?.textContent, 160);
                if (!name) continue;
                const requirement = requiredIndex >= 0 ? clean(cells[requiredIndex]?.textContent, 80) : "";
                parameters.push({
                  name,
                  type: typeIndex >= 0 ? clean(cells[typeIndex]?.textContent, 300) : "",
                  required: /^required$|^yes$|^true$/i.test(requirement),
                  declaration: "",
                  description: descriptionIndex >= 0 ? clean(cells[descriptionIndex]?.textContent, 1200) : "",
                  constraints: [],
                  language: "unknown",
                  nestedDepth: 0,
                  anchor: null
                });
              }
            }
          }

          const deduped = [];
          const seen = new Set();
          for (const parameter of parameters) {
            const key = [parameter.language, parameter.nestedDepth, parameter.name, parameter.type, parameter.description].join("\n");
            if (seen.has(key)) continue;
            seen.add(key);
            deduped.push(parameter);
          }
          const languageFilter = requestedLanguage ? canonicalLanguage(requestedLanguage) : null;
          const queryFilter = textFilter ? textFilter.toLocaleLowerCase("en-US") : null;
          const matches = deduped.filter((parameter) => {
            const matchesLanguage = !languageFilter || canonicalLanguage(parameter.language) === languageFilter;
            const haystack = [parameter.name, parameter.type, parameter.declaration, parameter.description].join(" ").toLocaleLowerCase("en-US");
            return matchesLanguage && (!queryFilter || haystack.includes(queryFilter));
          });
          const methodNode = query(document, "[data-stldocs-method][aria-current='page']") || query(root, "[data-stldocs-method]");
          return {
            ok: true,
            source: "Current OpenAI API reference DOM via a third-party AdapTab adapter",
            page: page(),
            method: clean(attribute(methodNode, "data-stldocs-method"), 20).toUpperCase() || null,
            filters: { query: textFilter, language: requestedLanguage, includeNested },
            availableLanguages: [...new Set(deduped.map((parameter) => parameter.language))].sort(),
            count: Math.min(matches.length, limit),
            totalMatches: matches.length,
            truncated: matches.length > limit,
            parameters: matches.slice(0, limit),
            hint: deduped.length === 0
              ? "No structured API parameters were found in the live DOM. Navigate to an OpenAI API reference method page, then retry."
              : null
          };
        }
      })
    ];
    await Promise.all(registrations);
    window[marker] = { version: VERSION, installed: true, installing: false };
    return { ok: true, status: "installed", adapterId: ADAPTER_ID, version: VERSION, tools: TOOL_NAMES };
  } catch (error) {
    delete window[marker];
    throw error;
  }
})()`;

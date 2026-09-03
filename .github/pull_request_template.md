## Adapter change

- Adapter ID and version:
- Target origin and route family:
- Authorized workflow:
- Endpoint/DOM provenance:

## Authoring contract

- [ ] I read `docs/ADAPTER_AUTHORING.md`.
- [ ] The manifest contains `executionPolicy` and matching `agentGuidance`.
- [ ] The adapter reuses one resolved top-level tab, or explains why extra tabs are required.
- [ ] Resource URLs are explicitly classified as inputs or navigation targets.
- [ ] Known structured requests are preferred where available.
- [ ] The adapter does not introduce demo caps, silently omit available fields, or otherwise narrow the authorized capability.
- [ ] Every functional input, output, or execution limit is declared with its reason, source, value where applicable, and configurability.
- [ ] Reads and mutations are separated; every mutation requires confirmation and does not automatically retry ambiguity.
- [ ] Credentials remain inside the target browser page.
- [ ] Sanitized fixtures and origin, route, lifecycle, error, and limit tests are included.
- [ ] `npm run check` passes.

## Evidence for declared limits

Describe the upstream, security, consent, reliability, or user-policy basis for
each limit. “Safer for the demo” is not sufficient.

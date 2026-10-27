# Contributing to dakera-ai-sdk

Thank you for your interest in contributing to the Dakera integration for the Vercel AI SDK! This guide
covers everything you need to get started.

## Reporting Bugs

Open an issue using the bug report template. Include the `ai`, `@dakera-ai/dakera` and `@dakera-ai/ai-sdk`
versions, the Dakera server version (`curl http://localhost:3000/health` shows it), a minimal reproduction,
and the observed vs. expected behaviour.

## Development

Requirements: Node.js 20+; Docker for the live tests.

```bash
npm install
npm run lint                # ESLint (src, tests, examples)
npm run typecheck           # tsc on src and tests
npm test                    # unit tests (vitest); live tests are skipped without a server
npm run build               # tsup → dist (CJS + ESM + .d.ts)
npm run typecheck:examples  # installs examples/ against the build and type-checks them
```

The unit tests need no server: they pass a fake `DakeraClient` through the `client` option.
`tests/integration.test.ts` runs the middleware (generate and stream) and the tools against a real server,
with the AI SDK's mock language model, when `DAKERA_API_URL` is set:

```bash
docker run -d --name dakera-test -p 3300:3300 \
  -e DAKERA_PORT=3300 -e DAKERA_AUTH_ENABLED=false \
  ghcr.io/dakera-ai/dakera:0.12.3

DAKERA_API_URL=http://localhost:3300 npm test
```

For a server with auth enabled, also set `DAKERA_API_KEY`.

## Pull Requests

- Keep changes focused and covered by tests; update the README, the examples and
  [CHANGELOG.md](CHANGELOG.md) for anything user-facing.
- Run `npm run lint`, `npm run typecheck`, `npm test` and `npm run build` before pushing. CI runs them on
  Node 20 and 22 with AI SDK 6 and the latest AI SDK, type-checks the examples, and runs the live tests
  against `ghcr.io/dakera-ai/dakera:0.12.3`.
- Follow the existing code style (strict TypeScript with `exactOptionalPropertyTypes`, ESM import
  specifiers, TSDoc on public exports).

## License

By contributing you agree that your contributions are licensed under the MIT License.

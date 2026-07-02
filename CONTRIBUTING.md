# Contributing to dakera-ai-sdk

Thank you for your interest in contributing to the Dakera integration for the
Vercel AI SDK! This guide covers everything you need to get started.

## Reporting Bugs

Open an issue using the bug report template. Include the AI SDK version, the
Dakera server version, a minimal reproduction, and the observed vs. expected
behaviour.

## Development

```bash
npm install
npm run typecheck   # tsc --noEmit
npm test            # vitest run
npm run build       # tsup → dist (cjs + esm + dts)
```

Requirements: Node.js >= 20. A running Dakera server is not required for the
unit tests — the `DakeraClient` is mocked. To exercise the integration end to
end, run a server via [`dakera-ai/dakera-deploy`](https://github.com/dakera-ai/dakera-deploy)
and set `DAKERA_URL` / `DAKERA_API_KEY`.

## Pull Requests

- Keep changes focused and covered by tests.
- Run `npm run typecheck`, `npm test`, and `npm run build` before pushing — CI
  runs all three on Node 20 and 22.
- Follow the existing code style (strict TypeScript, ESM import specifiers).

## License

By contributing you agree that your contributions are licensed under the MIT
License.

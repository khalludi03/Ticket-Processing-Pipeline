Default to using Node.js and npm.

- Use `node --strip-types <file>` to run TypeScript files (Node.js v24+ built-in, no tsx needed)
- Use `vitest` instead of `jest` or `bun test`
- Use `npm install` instead of `bun install` or `yarn install`
- Use `npm run <script>` instead of `bun run <script>`
- Use `npx <package> <command>` instead of `bunx <package> <command>`
- Use `dotenv` for loading .env (add `import 'dotenv/config'` at entry points)

## APIs

- Use `hono` for HTTP server. Don't use `express` or `Bun.serve()`.
- Use `pg` for PostgreSQL. Don't use `Bun.sql` or `postgres.js`.
- Use `node:fs` for file operations.

## Testing

Use `vitest` to run tests.

```ts#index.test.ts
import { test, expect } from "vitest";

test("hello world", () => {
  expect(1).toBe(1);
});
```

## TypeScript

Node.js v24+ has built-in TypeScript support — no extra package needed:

```sh
node --strip-types src/index.ts
node --watch --strip-types src/index.ts
```

/**
 * version — single source of truth for the MCP server name + version.
 *
 * Reads `package.json` once at module load and exports the parsed values.
 * Both `server.ts` (stdio bootstrap + /health response) and `http.ts`
 * (per-request McpServer construction) consume from here so the version
 * exposed to MCP clients always matches the package shipped on disk.
 *
 * Path resolution: `dist/version.js` is one directory below the package
 * root after build (`dist/` ⇄ `package.json`). `src/version.ts` is also
 * one directory below in dev (`src/` ⇄ `package.json`). Same `..` works
 * for both — no env-conditional logic needed.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const pkgRaw = readFileSync(join(here, '..', 'package.json'), 'utf-8');
const pkg = JSON.parse(pkgRaw) as { name: string; version: string };

export const SERVER_NAME = 'maxvision-linkedin-mcp';
export const SERVER_VERSION: string = pkg.version;

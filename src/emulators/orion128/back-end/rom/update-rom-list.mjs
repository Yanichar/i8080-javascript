#!/usr/bin/env node
'use strict'

/**
 * Regenerate `rom-list.json` from the `.bin` files sitting next to this script.
 *
 * The page lists the ROM directory at run time wherever the server answers a
 * directory request with an index (live-server, `python3 -m http.server`,
 * nginx autoindex). The WebStorm built-in server and most production static
 * hosts refuse to list a directory, and there `rom-list.json` is what the
 * drop-downs are built from - so run this after adding or removing a `.bin`.
 *
 *     node src/emulators/orion128/back-end/rom/update-rom-list.mjs
 */

import { readdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROM_DIR = dirname(fileURLToPath(import.meta.url));
const LIST_FILE = join(ROM_DIR, 'rom-list.json');

const entries = await readdir(ROM_DIR, { withFileTypes: true });

// Sorted exactly the way the page sorts them, so the drop-down order does not
// depend on which of the two listing paths produced the names.
const names = entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.bin'))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));

await writeFile(LIST_FILE, `${JSON.stringify(names, null, 2)}\n`, 'utf8');

console.log(`${LIST_FILE}: ${names.length} ROM images`);

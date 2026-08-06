'use strict'

/**
 * Load a raw binary file as a `Uint8Array`.
 *
 * Works both in the browser (via `fetch`) and under Node (via `fs`), so a ROM
 * or program image can be pulled straight from a `.bin` file in the emulator
 * page and in tests without first converting it into a JavaScript array.
 *
 * @param {string} path URL (browser) or file path (Node) of the `.bin` file
 * @returns {Promise<Uint8Array>} The file's bytes
 */
async function loadBinary(path) {
    // Browser: fetch it as an array buffer. `window` distinguishes the browser
    // from Node, which also exposes a global `fetch` these days.
    if (typeof window !== 'undefined' && typeof fetch === 'function') {
        const response = await fetch(path);
        if (!response.ok) {
            throw new Error(`Failed to load ${path}: HTTP ${response.status}`);
        }
        return new Uint8Array(await response.arrayBuffer());
    }

    // Node: read straight off disk.
    const { readFile } = await import('node:fs/promises');
    const buffer = await readFile(path);
    return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
}

export { loadBinary };

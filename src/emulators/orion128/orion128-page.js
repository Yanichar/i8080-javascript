'use strict'

import { Orion128Computer, SCREEN_WIDTH, SCREEN_HEIGHT, CLOCK_SPEED } from './back-end/orion128-computer.js';
import { loadBinary } from './back-end/bin-loader.js';
import { KEY_MATRIX, KEY_MODIFIERS } from './keyboard-map.js';

/**
 * Directory the monitor ROMs and ROM-disk images are served from. The page
 * lists the `.bin` files in here and lets you pick which to boot; everything is
 * loaded straight from the `.bin`, no conversion to JavaScript needed.
 */
const ROM_DIR = './back-end/rom/';
const DEFAULT_MONITOR = 'M1rk.bin';
const DEFAULT_ROM_DISK = 'ORDOS20.bin';

/** Sentinel option for leaving the ROM-disk / user port empty. */
const NO_ROM_DISK = '(none)';

/**
 * Never try to catch up on more than this much wall-clock time in one frame.
 * Without a cap, a backgrounded tab would come back and run the emulated CPU
 * flat out for however long it was away.
 */
const MAX_CATCH_UP_MS = 50;

/**
 * Address programs are loaded and started at. Anything below 0800 would be
 * hidden by the ROM overlay until the first write to system port No.1, so
 * programs built with the z88dk `+orion` target are linked to run from here.
 */
const PROGRAM_LOAD_ADDRESS = 0x1000;

// Created in main() once the monitor ROM has been fetched.
let _computer = null;

const _canvas = document.getElementById('screen');
const _context = _canvas.getContext('2d');
const _imageData = _context.createImageData(SCREEN_WIDTH, SCREEN_HEIGHT);
const _pixels = new Uint32Array(_imageData.data.buffer);

const _btnReset = document.getElementById('btnReset');
const _btnPause = document.getElementById('btnPause');
const _selMonitor = document.getElementById('selMonitor');
const _selRomDisk = document.getElementById('selRomDisk');
const _selScale = document.getElementById('selScale');
const _selProgram = document.getElementById('selProgram');
const _btnLoadProgram = document.getElementById('btnLoadProgram');
const _spanStatus = document.getElementById('spanStatus');

let _running = true;
let _lastFrameTime = 0;
let _cyclesThisSecond = 0;
let _secondStartedAt = 0;
let _measuredMHz = 0;
let _error = '';

function setScale(scale) {
    _canvas.style.width = `${SCREEN_WIDTH * scale}px`;
    _canvas.style.height = `${SCREEN_HEIGHT * scale}px`;
}

function drawScreen() {
    _computer.RenderScreen(_pixels);
    _context.putImageData(_imageData, 0, 0);
}

function updateStatus() {
    const state = _computer.CPUState;
    const mmu = _computer.MMU;
    const screen = mmu.ScreenBase.toString(16).toUpperCase().padStart(4, '0');
    const parts = [
        _running ? 'RUN' : 'PAUSED',
        `PC ${state.ProgramCounter.toString(16).toUpperCase().padStart(4, '0')}`,
        `SP ${state.StackPointer.toString(16).toUpperCase().padStart(4, '0')}`,
        `page ${mmu.MemoryPage}`,
        `screen ${screen}`,
        `palette ${mmu.AlternatePalette ? '2' : '1'}`,
        mmu.ROMOverlayEnabled ? 'ROM overlay on' : 'ROM overlay off',
        `${_measuredMHz.toFixed(2)} MHz`,
    ];
    if (state.Halt) parts.push('HALTED');
    if (_error) parts.push(_error);
    _spanStatus.textContent = parts.join('  |  ');
}

/**
 * Fetch a binary built for the `+orion` z88dk target, drop it into RAM and
 * start it. The machine is reset first, so the program gets the same memory
 * it would have had after power-on.
 *
 * @param {string} url Where to fetch the binary from
 */
async function loadProgram(url) {
    if (!_computer) return;
    _error = '';
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const bytes = new Uint8Array(await response.arrayBuffer());
        _computer.Reset();
        _computer.LoadProgram(bytes, PROGRAM_LOAD_ADDRESS);

        _running = true;
        _btnPause.textContent = 'Pause';
        _canvas.focus();
    } catch (error) {
        _error = `${url}: ${error.message}`;
    }
}

/**
 * One animation frame: run the CPU for however much emulated time has passed
 * since the last frame, then repaint.
 */
function frame(now) {
    requestAnimationFrame(frame);

    // A ROM swap replaces _computer asynchronously; skip frames while it is
    // being rebuilt (or if the last boot failed).
    if (!_computer) return;

    if (!_lastFrameTime) {
        _lastFrameTime = now;
        _secondStartedAt = now;
        return;
    }

    const elapsed = Math.min(now - _lastFrameTime, MAX_CATCH_UP_MS);
    _lastFrameTime = now;

    if (_running) {
        try {
            _cyclesThisSecond += _computer.RunCycles(Math.round((CLOCK_SPEED * elapsed) / 1000));
        } catch (error) {
            // Some monitor images use hardware this core does not emulate (e.g.
            // i8080 OUT/IN ports); stop rather than throw every frame.
            _running = false;
            _error = `${_selMonitor.value}: ${error.message}`;
        }
    }

    if (now - _secondStartedAt >= 1000) {
        _measuredMHz = _cyclesThisSecond / (now - _secondStartedAt) / 1000;
        _cyclesThisSecond = 0;
        _secondStartedAt = now;
    }

    drawScreen();
    updateStatus();
}

function onKeyDown(event) {
    if (!_computer || event.repeat) return;

    const modifier = KEY_MODIFIERS[event.code];
    if (modifier) {
        _computer.Keyboard.SetModifier(modifier, true);
        event.preventDefault();
        return;
    }

    const key = KEY_MATRIX[event.code];
    if (key) {
        _computer.Keyboard.SetKey(key.Row, key.Column, true);
        event.preventDefault();
    }
}

function onKeyUp(event) {
    if (!_computer) return;
    const modifier = KEY_MODIFIERS[event.code];
    if (modifier) {
        _computer.Keyboard.SetModifier(modifier, false);
        event.preventDefault();
        return;
    }

    const key = KEY_MATRIX[event.code];
    if (key) {
        _computer.Keyboard.SetKey(key.Row, key.Column, false);
        event.preventDefault();
    }
}

// Reset rebuilds the machine from the currently selected ROM and ROM-disk, so
// picking a different .bin and hitting Reset boots it.
_btnReset.addEventListener('click', () => { bootMachine(); });

_btnPause.addEventListener('click', () => {
    if (!_computer) return;
    _running = !_running;
    _btnPause.textContent = _running ? 'Pause' : 'Resume';
    _canvas.focus();
});

_selScale.addEventListener('change', () => setScale(Number(_selScale.value)));

_btnLoadProgram.addEventListener('click', () => loadProgram(_selProgram.value));

_canvas.addEventListener('keydown', onKeyDown);
_canvas.addEventListener('keyup', onKeyUp);

// A key held down while the canvas loses focus would otherwise stay stuck down
// in the matrix for ever.
_canvas.addEventListener('blur', () => { if (_computer) _computer.Keyboard.ReleaseAll(); });

/**
 * List the `.bin` files in the ROM directory. Tries a plain directory listing
 * first (most static dev servers autoindex), and falls back to a manifest.json
 * committed alongside the images.
 *
 * @param {string} dirUrl URL of the ROM directory, with a trailing slash
 * @returns {Promise<string[]>} File names, e.g. `['M1rk.bin', ...]`
 */
async function listBinFiles(dirUrl) {
    try {
        const response = await fetch(dirUrl);
        if (response.ok) {
            const html = await response.text();
            const names = [...html.matchAll(/href="([^"#?]+\.bin)(?:[?#][^"]*)?"/gi)]
                .map((match) => decodeURIComponent(match[1].split('/').pop()));
            const unique = [...new Set(names)].sort();
            if (unique.length) return unique;
        }
    } catch {
        // No directory listing; fall through to the manifest.
    }

    const response = await fetch(`${dirUrl}manifest.json`);
    if (!response.ok) throw new Error(`no ROM listing (HTTP ${response.status})`);
    return await response.json();
}

/**
 * Fill a <select> with options, selecting `preferred` if it is present.
 */
function populateSelect(select, names, preferred) {
    select.innerHTML = '';
    for (const name of names) {
        const option = document.createElement('option');
        option.value = name;
        option.textContent = name;
        select.appendChild(option);
    }
    if (names.includes(preferred)) select.value = preferred;
}

/**
 * (Re)build the machine from the ROM and ROM-disk currently selected in the
 * drop-downs and start it running. Called at start-up and on Reset.
 */
async function bootMachine() {
    _error = '';
    try {
        const monitorRom = await loadBinary(ROM_DIR + _selMonitor.value);
        const diskName = _selRomDisk.value;
        const romDiskImage = (diskName && diskName !== NO_ROM_DISK)
            ? await loadBinary(ROM_DIR + diskName)
            : null;
        _computer = new Orion128Computer(monitorRom, romDiskImage);
    } catch (error) {
        _computer = null;
        _error = `ROM (${_selMonitor.value}): ${error.message}`;
        _spanStatus.textContent = _error;
        return;
    }

    _running = true;
    _btnPause.textContent = 'Pause';
    _canvas.focus();
}

/**
 * Populate the ROM drop-downs, build the machine and start the render loop.
 * Everything that needs a live `_computer` waits until this has finished.
 */
async function main() {
    let files;
    try {
        files = await listBinFiles(ROM_DIR);
    } catch (error) {
        _spanStatus.textContent = `ROM directory: ${error.message}`;
        return;
    }

    populateSelect(_selMonitor, files, DEFAULT_MONITOR);
    populateSelect(_selRomDisk, [NO_ROM_DISK, ...files], DEFAULT_ROM_DISK);

    // Changing either selection reboots with the new images.
    _selMonitor.addEventListener('change', () => { bootMachine(); });
    _selRomDisk.addEventListener('change', () => { bootMachine(); });

    await bootMachine();

    setScale(Number(_selScale.value));
    requestAnimationFrame(frame);

    // Without a ?program= parameter the page comes up in the monitor and nothing
    // is loaded until the Load & run button is pressed. The parameter is there
    // for driving the page from a script.
    const requestedProgram = new URLSearchParams(window.location.search).get('program');
    if (requestedProgram) {
        _selProgram.value = requestedProgram;
        loadProgram(requestedProgram);
    }
}

main();

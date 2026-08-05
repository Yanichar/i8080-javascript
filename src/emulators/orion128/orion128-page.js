'use strict'

import { Orion128Computer, SCREEN_WIDTH, SCREEN_HEIGHT, CLOCK_SPEED } from './back-end/orion128-computer.js';
import { KEY_MATRIX, KEY_MODIFIERS } from './keyboard-map.js';

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

const _computer = new Orion128Computer();

const _canvas = document.getElementById('screen');
const _context = _canvas.getContext('2d');
const _imageData = _context.createImageData(SCREEN_WIDTH, SCREEN_HEIGHT);
const _pixels = new Uint32Array(_imageData.data.buffer);

const _btnReset = document.getElementById('btnReset');
const _btnPause = document.getElementById('btnPause');
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

    if (!_lastFrameTime) {
        _lastFrameTime = now;
        _secondStartedAt = now;
        return;
    }

    const elapsed = Math.min(now - _lastFrameTime, MAX_CATCH_UP_MS);
    _lastFrameTime = now;

    if (_running) {
        _cyclesThisSecond += _computer.RunCycles(Math.round((CLOCK_SPEED * elapsed) / 1000));
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
    if (event.repeat) return;

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

_btnReset.addEventListener('click', () => {
    _computer.Reset();
    _running = true;
    _btnPause.textContent = 'Pause';
    _canvas.focus();
});

_btnPause.addEventListener('click', () => {
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
_canvas.addEventListener('blur', () => _computer.Keyboard.ReleaseAll());

setScale(Number(_selScale.value));
_canvas.focus();
requestAnimationFrame(frame);

// Without a ?program= parameter the page comes up in the monitor and nothing is
// loaded until the Load & run button is pressed. The parameter is there for
// driving the page from a script.
const _requestedProgram = new URLSearchParams(window.location.search).get('program');
if (_requestedProgram) {
    _selProgram.value = _requestedProgram;
    loadProgram(_requestedProgram);
}

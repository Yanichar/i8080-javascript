'use strict'

import { Orion128Computer, SCREEN_WIDTH, SCREEN_HEIGHT, CLOCK_SPEED } from './back-end/orion128-computer.js';
import { KEY_MATRIX, KEY_MODIFIERS } from './keyboard-map.js';

/**
 * Never try to catch up on more than this much wall-clock time in one frame.
 * Without a cap, a backgrounded tab would come back and run the emulated CPU
 * flat out for however long it was away.
 */
const MAX_CATCH_UP_MS = 50;

const _computer = new Orion128Computer();

const _canvas = document.getElementById('screen');
const _context = _canvas.getContext('2d');
const _imageData = _context.createImageData(SCREEN_WIDTH, SCREEN_HEIGHT);
const _pixels = new Uint32Array(_imageData.data.buffer);

const _btnReset = document.getElementById('btnReset');
const _btnPause = document.getElementById('btnPause');
const _selScale = document.getElementById('selScale');
const _spanStatus = document.getElementById('spanStatus');

let _running = true;
let _lastFrameTime = 0;
let _cyclesThisSecond = 0;
let _secondStartedAt = 0;
let _measuredMHz = 0;

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
        `screen ${screen}`,
        `palette ${mmu.AlternatePalette ? '2' : '1'}`,
        mmu.ROMOverlayEnabled ? 'ROM overlay on' : 'ROM overlay off',
        `${_measuredMHz.toFixed(2)} MHz`,
    ];
    if (state.Halt) parts.push('HALTED');
    _spanStatus.textContent = parts.join('  |  ');
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

_canvas.addEventListener('keydown', onKeyDown);
_canvas.addEventListener('keyup', onKeyUp);

// A key held down while the canvas loses focus would otherwise stay stuck down
// in the matrix for ever.
_canvas.addEventListener('blur', () => _computer.Keyboard.ReleaseAll());

setScale(Number(_selScale.value));
_canvas.focus();
requestAnimationFrame(frame);

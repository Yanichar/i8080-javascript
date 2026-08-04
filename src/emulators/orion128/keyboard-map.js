'use strict'

/**
 * Mapping from browser `KeyboardEvent.code` values onto positions in the
 * Orion-128 keyboard matrix.
 *
 * The monitor's scan routine builds a raw key code of `row * 8 + column` and
 * then translates it: codes 00-0F are looked up in a table of control codes,
 * and codes 10-3F are turned into ASCII by adding 0x10 or 0x20 depending on
 * the state of the US (Shift) key. The comments below give the character each
 * matrix position produces when it is pressed on its own.
 *
 * `KeyboardEvent.code` describes the physical key rather than the character it
 * produces, so the mapping works the same whatever layout the host is using.
 */
const KEY_MATRIX = {
    // Row 0 - control keys
    'Home':          { Row: 0, Column: 0 },  // 0x0C - clear screen
    'End':           { Row: 0, Column: 1 },  // 0x1F - home cursor
    'Escape':        { Row: 0, Column: 2 },  // 0x1B - AR2
    'F1':            { Row: 0, Column: 3 },  // 0x00
    'F2':            { Row: 0, Column: 4 },  // 0x01
    'F3':            { Row: 0, Column: 5 },  // 0x02
    'F4':            { Row: 0, Column: 6 },  // 0x03
    'F5':            { Row: 0, Column: 7 },  // 0x04

    // Row 1 - editing keys
    'Tab':           { Row: 1, Column: 0 },  // 0x09
    'F6':            { Row: 1, Column: 1 },  // 0x0A - line feed
    'Enter':         { Row: 1, Column: 2 },  // 0x0D - VK
    'NumpadEnter':   { Row: 1, Column: 2 },
    'Backspace':     { Row: 1, Column: 3 },  // 0x7F - ZB
    'Delete':        { Row: 1, Column: 3 },
    'ArrowLeft':     { Row: 1, Column: 4 },  // 0x08
    'ArrowRight':    { Row: 1, Column: 5 },  // 0x19
    'ArrowUp':       { Row: 1, Column: 6 },  // 0x18
    'ArrowDown':     { Row: 1, Column: 7 },  // 0x1A

    // Rows 2 and 3 - digits and punctuation
    'Digit0':        { Row: 2, Column: 0 },  // 0
    'Digit1':        { Row: 2, Column: 1 },  // 1
    'Digit2':        { Row: 2, Column: 2 },  // 2
    'Digit3':        { Row: 2, Column: 3 },  // 3
    'Digit4':        { Row: 2, Column: 4 },  // 4
    'Digit5':        { Row: 2, Column: 5 },  // 5
    'Digit6':        { Row: 2, Column: 6 },  // 6
    'Digit7':        { Row: 2, Column: 7 },  // 7
    'Digit8':        { Row: 3, Column: 0 },  // 8
    'Digit9':        { Row: 3, Column: 1 },  // 9
    'Quote':         { Row: 3, Column: 2 },  // :
    'Semicolon':     { Row: 3, Column: 3 },  // ;
    'Comma':         { Row: 3, Column: 4 },  // ,
    'Minus':         { Row: 3, Column: 5 },  // -
    'Period':        { Row: 3, Column: 6 },  // .
    'Slash':         { Row: 3, Column: 7 },  // /

    // Rows 4 to 7 - @, the alphabet, brackets and space
    'Backquote':     { Row: 4, Column: 0 },  // @
    'KeyA':          { Row: 4, Column: 1 },
    'KeyB':          { Row: 4, Column: 2 },
    'KeyC':          { Row: 4, Column: 3 },
    'KeyD':          { Row: 4, Column: 4 },
    'KeyE':          { Row: 4, Column: 5 },
    'KeyF':          { Row: 4, Column: 6 },
    'KeyG':          { Row: 4, Column: 7 },
    'KeyH':          { Row: 5, Column: 0 },
    'KeyI':          { Row: 5, Column: 1 },
    'KeyJ':          { Row: 5, Column: 2 },
    'KeyK':          { Row: 5, Column: 3 },
    'KeyL':          { Row: 5, Column: 4 },
    'KeyM':          { Row: 5, Column: 5 },
    'KeyN':          { Row: 5, Column: 6 },
    'KeyO':          { Row: 5, Column: 7 },
    'KeyP':          { Row: 6, Column: 0 },
    'KeyQ':          { Row: 6, Column: 1 },
    'KeyR':          { Row: 6, Column: 2 },
    'KeyS':          { Row: 6, Column: 3 },
    'KeyT':          { Row: 6, Column: 4 },
    'KeyU':          { Row: 6, Column: 5 },
    'KeyV':          { Row: 6, Column: 6 },
    'KeyW':          { Row: 6, Column: 7 },
    'KeyX':          { Row: 7, Column: 0 },
    'KeyY':          { Row: 7, Column: 1 },
    'KeyZ':          { Row: 7, Column: 2 },
    'BracketLeft':   { Row: 7, Column: 3 },  // [
    'Backslash':     { Row: 7, Column: 4 },  // \
    'BracketRight':  { Row: 7, Column: 5 },  // ]
    'Equal':         { Row: 7, Column: 6 },  // ^
    'Space':         { Row: 7, Column: 7 },  // space
};

/**
 * The three keys wired to Port C of the PPI rather than to the matrix.
 */
const KEY_MODIFIERS = {
    'ShiftLeft':     'Shift',    // US
    'ShiftRight':    'Shift',
    'ControlLeft':   'Ctrl',     // SS
    'ControlRight':  'Ctrl',
    'F9':            'RusLat',   // RUS/LAT
};

export { KEY_MATRIX, KEY_MODIFIERS };

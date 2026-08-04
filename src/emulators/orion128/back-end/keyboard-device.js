'use strict'

import { Device } from '../../../core/device.js';

/**
 * The Orion-128 keyboard is wired to a KR580VV55 (i8255) PPI mapped into memory
 * at F400-F403:
 *
 *   F400 - Port A (output) : row select. A row is selected by driving its bit LOW.
 *   F401 - Port B (input)  : column read.  A pressed key pulls its bit LOW.
 *   F402 - Port C          : lower nibble output (tape out / RUS-LAT LED),
 *                            upper nibble input:
 *                              D4 - tape input
 *                              D5 - US    (Shift)
 *                              D6 - SS    (Ctrl)
 *                              D7 - RUS/LAT
 *                            All modifiers are active LOW.
 *   F403 - Control word (the monitor writes 0x8A during start-up).
 *
 * The monitor's scan routine (FC10) builds a key code as `row * 8 + column`,
 * so the matrix below is indexed the same way.
 */
class KeyboardDevice extends Device {

    constructor() {
        super();
        this._rows = new Uint8Array(8);
        this._portA = 0x00;
        this._portCOut = 0x00;
        this._modifiers = { Shift: false, Ctrl: false, RusLat: false };
        this._controlWord = 0x8A;
    }

    Reset() {
        this._rows.fill(0);
        this._portA = 0x00;
        this._portCOut = 0x00;
        this._modifiers = { Shift: false, Ctrl: false, RusLat: false };
    }

    /**
     * Press or release a key given its position in the hardware matrix.
     *
     * @param {number} row Row of the key (0-7), i.e. the Port A bit driven low
     * @param {number} column Column of the key (0-7), i.e. the Port B bit read low
     * @param {boolean} isDown `true` for a key press, `false` for a release
     */
    SetKey(row, column, isDown) {
        if (isDown) {
            this._rows[row] |= (1 << column);
        }
        else {
            this._rows[row] &= ~(1 << column) & 0xFF;
        }
    }

    /**
     * Press or release one of the three modifier keys, which are wired
     * separately to Port C rather than to the matrix.
     *
     * @param {string} name One of `Shift`, `Ctrl` or `RusLat`
     * @param {boolean} isDown `true` for a key press, `false` for a release
     */
    SetModifier(name, isDown) {
        if (name in this._modifiers) this._modifiers[name] = isDown;
    }

    ReleaseAll() {
        this._rows.fill(0);
        this._modifiers = { Shift: false, Ctrl: false, RusLat: false };
    }

    /**
     * @param {number} port Address of the 8255 register (F400-F403)
     * @returns {number} Byte read from the register
     */
    Read(port) {
        switch (port & 0x03) {
            case 0x00:
                return this._portA;

            case 0x01: {
                // Every row whose Port A bit is low is scanned; a pressed key in
                // one of those rows pulls its column bit low.
                let columns = 0x00;
                for (let row = 0; row < 8; row++) {
                    if ((this._portA & (1 << row)) === 0) columns |= this._rows[row];
                }
                return (~columns) & 0xFF;
            }

            case 0x02: {
                let portC = 0xF0 | (this._portCOut & 0x0F);
                if (this._modifiers.Shift) portC &= ~0x20 & 0xFF;
                if (this._modifiers.Ctrl) portC &= ~0x40 & 0xFF;
                if (this._modifiers.RusLat) portC &= ~0x80 & 0xFF;
                return portC;
            }

            default:
                return this._controlWord;
        }
    }

    /**
     * @param {number} port Address of the 8255 register (F400-F403)
     * @param {number} val Byte to write
     */
    Write(port, val) {
        switch (port & 0x03) {
            case 0x00:
                this._portA = val & 0xFF;
                break;

            case 0x02:
                this._portCOut = val & 0x0F;
                break;

            case 0x03:
                // Bit-7 set is a mode-select word; otherwise it is a bit
                // set/reset command for Port C.
                if (val & 0x80) {
                    this._controlWord = val & 0xFF;
                }
                else {
                    const bit = (val >> 1) & 0x07;
                    if (val & 0x01) this._portCOut |= (1 << bit);
                    else this._portCOut &= ~(1 << bit) & 0xFF;
                    this._portCOut &= 0x0F;
                }
                break;

            default:
                // Port B is an input; writes to it are ignored.
                break;
        }
    }
}

export { KeyboardDevice };

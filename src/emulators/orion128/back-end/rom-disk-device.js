'use strict'

import { Device } from '../../../core/device.js';

/**
 * A ROM-disk cartridge on user port No.1, wired to a KR580VV55 (i8255) PPI
 * mapped into memory at F500-F503. This is what the monitor's `R` command
 * (FB93) reads from:
 *
 *   FB98  MVI  A,90       ; port A input, ports B and C output
 *   FB9A  STA  F503       ; -> control word
 *   FB9D  SHLD F501       ; L -> Port B (F501), H -> Port C (F502): address
 *   FBA0  LDA  F500       ; Port A: data byte at that address
 *   ...   store to B800+i, bump the address, loop 0x800 times
 *   FBAC  JMP  BFFD       ; enter the freshly-loaded image
 *
 * So the cartridge presents an 11-bit address on Ports B (low 8 bits) and C
 * (high 3 bits) and returns the byte at that address on Port A:
 *
 *   F500 - Port A (input)  : data, image[(portC << 8) | portB]
 *   F501 - Port B (output) : address, low byte
 *   F502 - Port C (output) : address, high bits
 *   F503 - Control word    : the monitor writes 0x90 before reading
 *
 * The image is 2KB, exactly the amount the `R` command copies into B800-BFFF.
 */
class RomDiskDevice extends Device {

    /**
     * @param {Array|Uint8Array} image The ROM-disk image (up to 2KB)
     */
    constructor(image) {
        super();
        this._image = Uint8Array.from(image);
        this._portB = 0x00;
        this._portC = 0x00;
        this._controlWord = 0x90;
    }

    Reset() {
        this._portB = 0x00;
        this._portC = 0x00;
        this._controlWord = 0x90;
    }

    /**
     * The 11-bit address the CPU has latched onto Ports B and C. Masked to the
     * image size so a runaway read wraps rather than falling off the end.
     */
    get _address() {
        return (((this._portC & 0x07) << 8) | this._portB) % this._image.length;
    }

    /**
     * @param {number} port Address of the 8255 register (F500-F503)
     * @returns {number} Byte read from the register
     */
    Read(port) {
        switch (port & 0x03) {
            case 0x00:
                return this._image[this._address];

            // Ports B and C are outputs; reading an output port on a real 8255
            // gives back what was last written to it.
            case 0x01:
                return this._portB;

            case 0x02:
                return this._portC;

            default:
                return this._controlWord;
        }
    }

    /**
     * @param {number} port Address of the 8255 register (F500-F503)
     * @param {number} val Byte to write
     */
    Write(port, val) {
        switch (port & 0x03) {
            case 0x01:
                this._portB = val & 0xFF;
                break;

            case 0x02:
                this._portC = val & 0xFF;
                break;

            case 0x03:
                // Bit-7 set is a mode-select word; a bit set/reset command for
                // Port C is the only other thing that lands here.
                if (val & 0x80) {
                    this._controlWord = val & 0xFF;
                }
                else {
                    const bit = (val >> 1) & 0x07;
                    if (val & 0x01) this._portC |= (1 << bit);
                    else this._portC &= ~(1 << bit) & 0xFF;
                }
                break;

            default:
                // Port A is an input; writes to it are ignored.
                break;
        }
    }
}

export { RomDiskDevice };

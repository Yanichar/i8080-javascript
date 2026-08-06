'use strict'

import { Computer } from '../../../core/computer.js';
import { Orion128MMU } from './orion128-mmu.js';
import { KeyboardDevice } from './keyboard-device.js';
import { RomDiskDevice } from './rom-disk-device.js';

const SCREEN_WIDTH = 384;
const SCREEN_HEIGHT = 256;
const SCREEN_COLUMNS = SCREEN_WIDTH / 8;

/**
 * Clock speed of the i8080 in the Orion-128, in Hz.
 */
const CLOCK_SPEED = 2500000;

/**
 * The two monochrome palettes selected by bit D0 of system port No.1, as
 * 0xAABBGGRR values ready to drop into a Uint32 view of an ImageData buffer.
 */
const PALETTES = [
    { Background: 0xFF000000, Foreground: 0xFF33FF33 },  // green on black
    { Background: 0xFFFFCC33, Foreground: 0xFF33FFFF },  // yellow on cyan
];

/**
 * The simplest useful Orion-128: four banked 60K memory pages, monochrome
 * display, keyboard, a monitor ROM loaded from a `.bin` and a ROM-disk
 * cartridge on user port No.1. Colour is not emulated, and neither is tape.
 */
class Orion128Computer extends Computer {

    /**
     * @param {Array|Uint8Array} monitorRom The 2KB monitor ROM image, as loaded
     * from a `.bin` by `loadBinary()`.
     * @param {Array|Uint8Array|null} [romDiskImage] The ROM-disk cartridge image
     * on user port No.1. Pass `null` (or an empty image) for an empty user port.
     */
    constructor(monitorRom, romDiskImage = null) {
        super();

        this._keyboard = new KeyboardDevice();

        // The ROM-disk cartridge on user port No.1, read by the `R` command. A
        // null/empty image means nothing is plugged in and the port floats high.
        this._romDisk = (romDiskImage && romDiskImage.length)
            ? new RomDiskDevice(romDiskImage)
            : null;

        // Replace the generic MMU installed by `Computer` with one that knows
        // about the Orion's ROM overlay and memory-mapped ports.
        this._mmu = new Orion128MMU(monitorRom);
        this._mmu.ConnectKeyboard(this._keyboard);
        this._mmu.ConnectRomDisk(this._romDisk);
        this._mmu.ConnectBus(this.Bus);
        this.Bus.ConnectMMU(this._mmu);

        // Some monitors (e.g. M2) drive the system ports with i8080 OUT/IN
        // opcodes rather than memory writes. On real hardware an `OUT n`
        // duplicates the port number onto both halves of the address bus, and
        // the Orion decodes its ports on the high byte, so `OUT 0F9H` reaches
        // the same latch as `STA F900`. Bridge the CPU's port I/O onto the MMU
        // with that same (n << 8) | n address so both styles work.
        const ioBridge = {
            Read: (port) => this._mmu.Read(((port << 8) | port) & 0xFFFF),
            Write: (port, val) => this._mmu.Write(val, ((port << 8) | port) & 0xFFFF),
        };
        for (let port = 0; port < 256; port++) {
            this.Bus.ConnectDeviceToReadPort(port, ioBridge);
            this.Bus.ConnectDeviceToWritePort(port, ioBridge);
        }

        this.Reset();
    }

    get Keyboard() {
        return this._keyboard;
    }

    get RomDisk() {
        return this._romDisk;
    }

    get MMU() {
        return this._mmu;
    }

    static get ScreenWidth() {
        return SCREEN_WIDTH;
    }

    static get ScreenHeight() {
        return SCREEN_HEIGHT;
    }

    static get ClockSpeed() {
        return CLOCK_SPEED;
    }

    Reset() {
        this._keyboard.Reset();
        if (this._romDisk) this._romDisk.Reset();
        super.Reset();
    }

    /**
     * Run the CPU for (at least) a given number of clock cycles. Instructions
     * are never cut in half, so the count returned is usually a few cycles
     * over the number asked for.
     *
     * @param {number} cycles Number of clock cycles to run
     * @returns {number} Number of clock cycles actually consumed
     */
    RunCycles(cycles) {
        let consumed = 0;
        while (consumed < cycles) {
            if (this.CPUState.Halt) break;
            consumed += this._cpu.ExecuteNextInstruction().LastInstructionTicks;
        }
        return consumed;
    }

    /**
     * Load a binary image into RAM. Unlike `Computer.LoadProgram()` this writes
     * straight into memory, so it cannot be tripped up by the port decoding,
     * and it leaves the program counter alone.
     *
     * @param {Array|Uint8Array} bytes Bytes to load
     * @param {number} atAddr Address to load them at
     * @returns {number} Number of bytes loaded
     */
    LoadBinary(bytes, atAddr) {
        return this._mmu.LoadBytes(bytes, atAddr);
    }

    /**
     * Render the currently selected screen into a Uint32 view of an
     * `ImageData` buffer.
     *
     * Display RAM is laid out in columns, not rows: C000 holds the leftmost 8
     * pixels of the top line, C001 the 8 pixels directly below it, and so on
     * down to C0FF; C100 then starts the next column of 8 pixels to the right.
     * Within a byte the most significant bit is the leftmost pixel.
     *
     * @param {Uint32Array} pixels Destination, SCREEN_WIDTH * SCREEN_HEIGHT long
     */
    RenderScreen(pixels) {
        const screen = this._mmu.GetScreenBytes();
        const palette = PALETTES[this._mmu.AlternatePalette ? 1 : 0];
        const background = palette.Background;
        const foreground = palette.Foreground;

        for (let column = 0; column < SCREEN_COLUMNS; column++) {
            const columnBase = column << 8;
            const x = column << 3;
            for (let y = 0; y < SCREEN_HEIGHT; y++) {
                const bits = screen[columnBase + y];
                let target = y * SCREEN_WIDTH + x;
                for (let bit = 7; bit >= 0; bit--) {
                    pixels[target++] = (bits & (1 << bit)) ? foreground : background;
                }
            }
        }
    }
}

export { Orion128Computer, SCREEN_WIDTH, SCREEN_HEIGHT, CLOCK_SPEED };

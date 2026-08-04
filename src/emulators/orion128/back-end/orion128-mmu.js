'use strict'

import { MMU } from '../../../core/mmu.js';

const RAM_SIZE = 0x10000;
const ROM_BASE = 0xF800;
const ROM_SIZE = 0x0800;
const IO_BASE = 0xF400;

/**
 * Base addresses of the four screens selectable through system port No.3.
 */
const SCREEN_BASES = [0xC000, 0x8000, 0x4000, 0x0000];

/**
 * Memory map of the Orion-128 (memory page 0, the only page emulated here):
 *
 *   0000-BFFF   main RAM
 *   C000-EFFF   display RAM, 384x256 pixels
 *   F000-F3FF   system RAM
 *   F400-F7FF   ports (decoded on the high byte only, so each port is
 *               mirrored over 256 addresses)
 *   F800-FFFF   monitor ROM on read / system ports No.1-4 on write
 *
 * The i8080 starts at 0000 after RESET but the monitor lives at the top of the
 * address space, so the ROM is also overlaid onto 0000-07FF until the first
 * write to system port No.1 (F800) takes it away again.
 */
class Orion128MMU extends MMU {

    /**
     * @param {Array|Uint8Array} rom The 2KB monitor ROM image
     */
    constructor(rom) {
        super();
        this._rom = Uint8Array.from(rom);
        if (this._rom.length !== ROM_SIZE) {
            console.log(`WARNING: monitor ROM is ${this._rom.length} bytes, expected ${ROM_SIZE}`);
        }
        this._keyboard = null;
        this._ram = new Uint8Array(RAM_SIZE);
        this.Reset();
    }

    ConnectKeyboard(keyboard) {
        this._keyboard = keyboard;
    }

    get BytesUsed() {
        return this._bytesUsed;
    }

    get Total() {
        return RAM_SIZE;
    }

    /**
     * @returns {boolean} `true` while the ROM is still overlaid onto 0000-07FF
     */
    get ROMOverlayEnabled() {
        return this._romOverlay;
    }

    /**
     * @returns {number} Base address of the screen currently selected by
     * system port No.3
     */
    get ScreenBase() {
        return SCREEN_BASES[this._systemPort3 & 0x03];
    }

    /**
     * @returns {boolean} `true` when system port No.1 selects palette No.2
     * (yellow on cyan) rather than palette No.1 (green on black)
     */
    get AlternatePalette() {
        return (this._systemPort1 & 0x01) !== 0;
    }

    Reset() {
        if (this._ram) this._ram.fill(0);
        this._bytesUsed = 0;
        this._romOverlay = true;
        this._systemPort1 = 0x00;
        this._systemPort2 = 0x00;
        this._systemPort3 = 0x00;
        this._systemPort4 = 0x00;
        this._userPorts = new Uint8Array(3);
    }

    Read(addr) {
        addr &= 0xFFFF;

        if (addr >= ROM_BASE) return this._rom[addr - ROM_BASE];
        if (this._romOverlay && addr < ROM_SIZE) return this._rom[addr];
        if (addr >= IO_BASE) return this._readPort(addr);

        return this._ram[addr];
    }

    Write(val, addr) {
        addr &= 0xFFFF;
        val &= 0xFF;

        if (addr < IO_BASE) {
            if (this._ram[addr] === 0 && val !== 0) this._bytesUsed++;
            this._ram[addr] = val;
            return;
        }

        this._writePort(addr, val);
    }

    /**
     * Read the whole of the currently selected screen without copying it.
     *
     * @returns {Uint8Array} A 12KB view onto the display RAM
     */
    GetScreenBytes() {
        const base = this.ScreenBase;
        return this._ram.subarray(base, base + 0x3000);
    }

    /**
     * Write bytes straight into RAM, bypassing the port decoding. Used to load
     * programs into memory before the CPU starts.
     *
     * @param {Array|Uint8Array} bytes Bytes to load
     * @param {number} atAddr Address to load them at
     * @returns {number} Number of bytes written
     */
    LoadBytes(bytes, atAddr) {
        for (let i = 0; i < bytes.length; i++) {
            this._ram[(atAddr + i) & 0xFFFF] = bytes[i] & 0xFF;
        }
        this._bytesUsed += bytes.length;
        return bytes.length;
    }

    /**
     * Ports are decoded on the high byte of the address, so F400-F4FF all
     * reach the keyboard PPI, F500-F5FF all reach user port No.1, and so on.
     */
    _readPort(addr) {
        switch (addr & 0xFF00) {
            case 0xF400:
                return this._keyboard ? this._keyboard.Read(addr) : 0xFF;

            // User and expansion ports: nothing is plugged in, so the bus
            // floats high.
            case 0xF500:
            case 0xF600:
            case 0xF700:
                return 0xFF;

            default:
                return 0xFF;
        }
    }

    _writePort(addr, val) {
        switch (addr & 0xFF00) {
            case 0xF400:
                if (this._keyboard) this._keyboard.Write(addr, val);
                break;

            case 0xF500:
                this._userPorts[0] = val;
                break;

            case 0xF600:
                this._userPorts[1] = val;
                break;

            case 0xF700:
                this._userPorts[2] = val;
                break;

            // System port No.1 - colour mode. Any write here also drops the
            // ROM overlay from 0000-07FF, which is how the monitor hands the
            // bottom of the address space back to RAM during start-up.
            case 0xF800:
                this._systemPort1 = val;
                this._romOverlay = false;
                break;

            // System port No.2 - memory page. This build only has page 0, so
            // the value is recorded but has no effect.
            case 0xF900:
                this._systemPort2 = val;
                break;

            // System port No.3 - selects one of the four screens.
            case 0xFA00:
                this._systemPort3 = val;
                break;

            // System port No.4 - graphical (0) or character display.
            case 0xFB00:
                this._systemPort4 = val;
                break;

            // FC00-FFFF is ROM; writes go nowhere.
            default:
                break;
        }
    }
}

export { Orion128MMU, SCREEN_BASES };

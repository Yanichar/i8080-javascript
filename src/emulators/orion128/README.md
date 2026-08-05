# Orion-128

The simplest useful build of the *Orion-128*, a Soviet home computer built
around the i8080 (KR580VM80A): four 60K memory pages, a 384x256 monochrome
display, the keyboard, and the M1 monitor in ROM. Colour is not emulated, and
neither is tape or disk.

The hardware description this was built from is in
[orion128-spec.md](../../../orion128-spec.md), with the remaining details
(the keyboard matrix, the PPI wiring and the display bit order) recovered by
disassembling the monitor ROM.

## Running it

The page uses ES modules, so it needs to be served over HTTP rather than opened
from the filesystem:

```
➜ cd src/emulators/orion128
➜ live-server
```

Then open `orion128-page.html`. Click the screen to give it focus and type.

## Hardware

| Component | Emulated as |
|---|---|
| CPU | `src/core/i8080.js`, run at 2.5 MHz |
| Memory & ports | `back-end/orion128-mmu.js` |
| Keyboard (i8255 PPI) | `back-end/keyboard-device.js` |
| Monitor ROM | `back-end/rom/monitor-rom.js`, generated from `roms/orion128/M1_rk.bin` |

### Memory map

Page 0, the page the monitor and the display controller live in:

| Range | Purpose |
|---|---|
| 0000-BFFF | main RAM |
| C000-EFFF | display RAM, 384x256 pixels |
| F000-F3FF | system RAM |
| F400-F7FF | ports |
| F800-FFFF | monitor ROM on read, system ports No.1-4 on write |

Ports are decoded on the high byte of the address only, so each one is mirrored
across 256 addresses.

### Memory pages

The low two bits of system port No.2 (F900) pick which of four pages is mapped
into 0000-EFFF. Page 1 is plain RAM at 0000-BFFF with the display's colour RAM
at C000-EFFF; pages 2 and 3 are plain RAM all the way up to EFFF.

F000-FFFF - the system RAM, the ports and the monitor ROM - belongs to no page
and reads the same whichever page is selected, which is what lets a program
running out of page 3 write to F900 and get back. The display controller
likewise always reads page 0.

Colour is not emulated: page 1 works as RAM, but the colour bits of system port
No.1 (D1, D2) are recorded and ignored, and the screen is drawn from the
monochrome palette D0 selects.

### The ROM overlay

The i8080 starts at 0000 after RESET, but the monitor lives at the top of the
address space. The machine solves this by overlaying the ROM onto 0000-07FF as
well, so the first instruction fetched is the `JMP F842` at the start of the
ROM. The monitor then sets up its stack and writes to system port No.1 (F800),
which drops the overlay and gives the bottom of the address space back to RAM.

### Display

Display RAM is laid out in columns rather than rows. C000 holds the leftmost 8
pixels of the top line, C001 the 8 pixels directly below it, and so on down to
C0FF; C100 then starts the next column of 8 pixels to the right, through to
EF00-EFFF for the last one. Within a byte the most significant bit is the
leftmost pixel.

Bit D0 of system port No.1 picks the palette: green on black, or yellow on
cyan. System port No.3 picks which of the four screens (C000, 8000, 4000 or
0000) is displayed.

### Keyboard

The keyboard hangs off an i8255 PPI at F400-F403:

| Address | Register |
|---|---|
| F400 | Port A, output: row select, a row is selected by driving its bit low |
| F401 | Port B, input: column read, a pressed key pulls its bit low |
| F402 | Port C: low nibble output (tape, RUS/LAT lamp), high nibble input (D4 tape in, D5 US, D6 SS, D7 RUS/LAT), all active low |
| F403 | Control word; the monitor writes 0x8A at start-up |

The monitor's scan routine at FC10 builds a raw key code of `row * 8 + column`,
then translates codes 00-0F through a table of control codes and codes 10-3F
into ASCII. `keyboard-map.js` maps browser `KeyboardEvent.code` values onto
matrix positions, so the layout the host is using does not matter.

| Host key | Orion key |
|---|---|
| Shift | US, the symbols on the digit keys |
| Ctrl | SS, control codes |
| F9 | RUS/LAT, toggles the Russian character set |
| Escape | AR2 |
| Home / End | Clear screen / home cursor |
| Backspace, Delete | ZB |
| Tab, F6 | Tab, line feed |
| F1 - F5 | Codes 00 - 04 |
| Arrows | Cursor movement |

## Regenerating the ROM module

`back-end/rom/monitor-rom.js` is generated from the binary. To rebuild it:

```
➜ python3 utils/rom_extractor/rom_extractor.py roms/orion128/M1_rk.bin
```

then rename the exported `Code` array to `MonitorROM`.

# Tessel 2 Firmware

[![Code of Conduct](https://img.shields.io/badge/%E2%9D%A4-code%20of%20conduct-blue.svg?style=flat)](https://github.com/tessel/project/blob/master/CONDUCT.md) [![Build Status](https://travis-ci.org/tessel/t2-firmware.svg?branch=master)](https://travis-ci.org/tessel/t2-firmware)

* [About the T2 Firmware](#about-the-t2-firmware)
  * [SAM D21 Overview](#sam-d21-overview)
  * [Directory structure](#directory-structure)
  * [Bridge](#bridge)
    * [Signals](#signals)
  * [Port command queue](#port-command-queue)
  * [Compiling](#compiling)
    * [Dependencies](#dependencies)
    * [Building](#building)
    * [Updating](#updating)

# About the T2 Firmware

## SAM D21 Overview

The Atmel SAM D21 microcontroller on Tessel 2 serves several purposes:

 * Controls the two module ports' GPIO, SPI, UART, I2C, and ADC interfaces from the SoC
 * Transfers data and commands between USB and the SoC for the Tessel CLI
 * Provides a USB serial console for the SoC
 * Programs the SoC's SPI flash over USB
 * Manages SoC and module port power state

## Directory structure

* `firmware/` -- The main SAMD21 firmware source
* `common/` -- Utilities for SAMD21 peripherals and board-specific headers
* `deps/` -- Dependency submodules: Atmel headers and USB stack
* `boot/` -- USB DFU bootloader
* `soc/` -- Bridge daemon running on the SoC that communicates with the MCU over SPI
* `node/` -- Node libraries for controlling the module ports via the MCU

## Bridge

The SPI bridge between the MT7620n ("SoC") and SAMD21 ("MCU") is modeled loosely on USB, and provides three
 bidirectional channels between Unix domain sockets on the Linux environment of the SoC and various functions
in the MCU firmware. Pipe 0 is connected to a pair of USB endpoints and used for Tessel CLI communication with the
Linux system. Pipes 1 and 2 are used for control of the two Tessel module ports.

#### Signals

* **MOSI**, **MISO**, **SCK**, **CS1** -- SPI lines. SoC is SPI master, MCU is SPI slave
* **SYNC** -- driven low by the SoC during setup transfers, driven high by the SoC during data transfers
* **IRQ** -- driven high by the MCU when it wants to be polled by the SoC because it has data to send or has
 become ready to receive

Note that the MT7620 SPI controller is designed only to talk to SPI flash and is not full duplex, and the protocol
designs around this limitation.

A transaction has a setup phase and an optional data phase. To begin the setup phase, the SoC brings SYNC low.
On this pin change, the MCU prepares a DMA chain for the setup transfer. In the setup transfer, each side provides:

  * A magic number, to verify correct operation
  * Bits specifying which channels are connected
  * Bits specifying which channels for which this side is ready to accept data
  * A byte for each channel specifying the data length ready to be sent on that channel

After this information is exchanged, both sides can compute the contents of the data transfer. If one side is
ready to accept data on that channel and the other sends a nonzero length, the transfer will be performed.
Otherwise that channel-direction is ignored for this transaction, and the writable bit or length count are repeated
in future transfers until the other is present. The SoC drives SYNC high to begin the data phase.

The data transfer payload contains the channel payloads in channel order. There is no framing information in the data
transfer, as it was derived from the setup payload. The MCU sets up a chain of DMA operations between the SPI
controller and the provided buffers.

## Port command queue

Each port has an independent command queue, which is accessed through a Unix domain socket on the Linux SoC. Node or
other software can submit a batch of actions that are sent in a single bridge transaction which are executed in order
and replies sent back via bridge and domain socket.

Some replies (pin change interrupt, UART receive) are asynchronously inserted into the stream of in-order replies.

The eventual goal is that the SoC will send larger command batches or macros to be executed in real-time,
isolated from the Linux preemptive scheduler and Node garbage collector.

## Compiling

### Dependencies

Building the firmware requires [gcc-arm-embedded](https://launchpad.net/gcc-arm-embedded).

#### OS X

To install quickly on a Mac with Homebrew:

```
brew tap tessel/tools
brew install gcc-arm
```

#### Ubuntu 14.04, 14.10

Use the [gcc-arm-embedded PPA](https://launchpad.net/~terry.guo/+archive/ubuntu/gcc-arm-embedded):

```
sudo add-apt-repository ppa:terry.guo/gcc-arm-embedded && sudo apt-get update
sudo apt-get install git gcc-arm-none-eabi
```

### Building

```
git clone https://github.com/tessel/t2-firmware --recursive
cd t2-firmware
make
```

### Updating
`dfu-util` is a command line utility to update the firmware on T2. See [their website](http://dfu-util.sourceforge.net/) for installation instructions (`brew install dfu-util` works).

Plug the USB port your T2 into your computer while holding down the button by the Tessel 2 logo - this will put T2 into bootloader mode, with the power LED blinking.

Now flash the device:
```
➜  dfu-util -aFlash -d 1209:7551 -D build/firmware.bin
...
dfu-util: Invalid DFU suffix signature
dfu-util: A valid DFU suffix will be required in a future dfu-util release!!!
Opening DFU capable USB device...
ID 1209:7551
Run-time device DFU version 0101
Claiming USB DFU Interface...
Setting Alternate Setting #0 ...
Determining device status: state = dfuIDLE, status = 0
dfuIDLE, continuing
DFU mode device DFU version 0101
Device returned transfer size 256
Copying data from PC to DFU device
Download	[=========================] 100%        12524 bytes
Download done.
state(7) = dfuMANIFEST, status(0) = No error condition is present
dfu-util: unable to read DFU status after completion
```

That should be it! Don't worry about the final warning at the bottom - it doesn't seem to affect anything.

Note that this only updates the firmware on the SAMD21 coprocessor. You will need to [update OpenWrt on the SoC](https://github.com/tessel/t2-cli#updating) separately. [Eventually](https://github.com/tessel/t2-cli/issues/109) this process will be integrated as the `tessel update` command.

## Using a SWD debug probe

Solder an [0.05in header](http://www.digikey.com/product-detail/en/GRPB052VWVN-RC/S9015E-05-ND/1786455) on J401 next to port A.

We use the [Bus Blaster v3](http://www.seeedstudio.com/depot/Bus-Blaster-v3-p-1415.html) with a
[Cortex Debug adapter cable](http://www.digikey.com/product-detail/en/ARM-JTAG-20-10/1188-1016-ND/3471401).

It needs to be [flashed to support SWD](http://bgamari.github.io/posts/2014-08-23-swd-with-busblaster-and-openocd.html).

Then run:

```
arm-none-eabi-gdb build/firmware.elf -ex 'target remote | openocd -c "gdb_port pipe; tcl_port 0; telnet_port 0" -f scripts/d21.cfg'
```

## Using onboard SWD

One of Tessel's unique features is the ability to program and debug the SAMD21 coprocessor from the
MT7620 SoC without an external SWD adapter. The SAMD21 SWD pins are connected to GPIOs on the SoC,
allowing `openocd` to bitbang the SWD protocol.

Log into your Tessel via SSH over WiFi or Ethernet. USB console is implemented in the SAMD21, and
will be unavailable while that processor is stopped.

Run the following commands to install and start openocd.

```
opkg update
opkg install openocd

cat > openocd.cfg <<EOF
interface sysfsgpio
transport select swd

sysfsgpio_swd_nums 41 42
source [find target/at91samdXX.cfg]
EOF

openocd -f openocd.cfg
```

Then, in a checkout of this repository after compiling:

```
arm-none-eabi-gdb build/firmware.elf -ex 'target remote <tessel ip>:3333'
```

## Flashing the bootloader

**Warning:** You probably do not need to do this. If the bootloader is intact, every other piece of
software on Tessel can be fixed over USB. If you break the SAMD21 bootloader and can't boot or access
the SoC, you'll need a SWD adapter to recover the device.

One of the duties of the SAMD21 is to sequence SoC power rails on bootup. Without it, the SoC may not
boot reliably. If you do this with onboard SWD, be very careful, and don't power down the Tessel until
you confirm that your computer recognizes the new bootloader over USB.

Compile the firmware, follow the openocd setup instructions above, then run:

```
$ arm-none-eabi-gdb build/boot.elf -ex 'target remote <tessel ip>:3333'
(gdb) load
(gdb) compare-sections
(gdb) mon reset run
```


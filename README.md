# Tessel 2 Firmware

* [About the T2 Firmware](#about-the-t2-firmware)
  * [SAM D21 Overview](#sam-d21-overview)
  * [Directory structure](#directory-structure)
  * [Bridge](#bridge)
   * [Signals](#signals)
  * [Port command queue](#port-command-queue)
  * [Compiling](#compiling)
   * [Dependencies](#dependencies)
   * [Building](#building)
* [T2 Hardware API](#t2-hardware-api)

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
git clone https://github.com/tessel/v2-firmware --recursive
cd v2-firmware
make
```

# T2 Hardware API

When you `require('tessel')` within a script which is executed on Tessel 2, this loads a library which interfaces with the Tessel 2 hardware, including pins, ports, and LEDs, just like Tessel 1 ([Tessel 1 hardware documentation](https://tessel.io/docs/hardwareAPI)). The code for Tessel 2's hardware object can be found [here](https://github.com/tessel/t2-firmware/blob/master/node/tessel.js).

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
    * [Flashing](#flashing)
* [T2 Hardware API](#t2-hardware-api)
  * [Ports and pins](#ports-and-pins)
    * [Modules](#modules)
    * [Pin mapping](#pin-mapping)
    * [Digital pins](#digital-pins)
    * [SPI](#spi)
    * [I2C](#i2c)
    * [UART/Serial](#uart-serial)
  * [Button and LEDs](#button-and-leds)
  * [USB ports](#usb-ports)

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

### Flashing
`dfu-util` is a command line utility to update the firmware on T2. See [their website](http://dfu-util.sourceforge.net/) for installation instructions. Plug the USB port your T2 into your computer while holding down the button by the Tessel 2 logo - this will put T2 into bootloader mode. Then (after running through the build steps above!) run `dfu-util -l` to make sure T2 is detected:
```
➜  dfu-util --list
...
Found DFU: [1d50:6097] ver=0002, devnum=13, cfg=1, intf=0, alt=1, name="SRAM", serial="UNKNOWN"
Found DFU: [1d50:6097] ver=0002, devnum=13, cfg=1, intf=0, alt=0, name="Flash", serial="UNKNOWN"
```
Note the vendor id and product id within the brackets (`1d50:6097` in this case). You'll need to substitute those numbers in the command below to flash the device:
```
➜  dfu-util -aFlash -d 1d50:6097 -D build/firmware.bin
...
dfu-util: Invalid DFU suffix signature
dfu-util: A valid DFU suffix will be required in a future dfu-util release!!!
Opening DFU capable USB device...
ID 1d50:6097
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

# T2 Hardware API

When you `require('tessel')` within a script which is executed on Tessel 2, this loads a library which interfaces with the Tessel 2 hardware, including pins, ports, and LEDs, just like Tessel 1 ([Tessel 1 hardware documentation](https://tessel.io/docs/hardwareAPI)). The code for Tessel 2's hardware object can be found [here](https://github.com/tessel/t2-firmware/blob/master/node/tessel.js).

## Ports and pins

Tessel has two ports, A and B. They are referred to as `tessel.port.B`. `tessel.port['B']` is also an acceptable reference style.

Tessel's ports can be used as module ports as in Tessel 1 (e.g. `accelerometer.use(tessel.port.B)`), or used as flexible GPIO pins (e.g. `myPin = tessel.port.A.pins[0]`).

### Modules

Tessel 2's module ports can be used with [Tessel modules](//tessel.io/modules) much as in [Tessel 1](http://start.tessel.io/modules).

Here is an example of using the Tessel Climate module on Tessel's port B:

```js
var tessel = require('tessel');
var climatelib = require('climate-si7020').use(tessel.port.B);
```

### Pin mapping

The module ports are not just for modules! They can also be used as flexible, simply addressable GPIO pins.

The pin capabilities for ports A and B are as follows:

| Port | Pin | Digital I/O | SCL | SDA | SCK | MISO | MOSI | TX | RX | Analog In | Analog Out |
|------|-----|-------------|-----|-----|-----|------|------|----|----|-----------|------------|
|A     | 0   | ✓           | ✓   |     |     |      |      |    |    |           |            |
|A     | 1   | ✓           |     | ✓   |     |      |      |    |    |           |            |
|A     | 2   | ✓           |     |     | ✓   |      |      |    |    |           |            |
|A     | 3   | ✓           |     |     |     | ✓    |      |    |    |           |            |
|A     | 4   | ✓           |     |     |     |      | ✓    |    |    | ✓         |            |
|A     | 5   | ✓           |     |     |     |      |      | ✓  |    |           |            |
|A     | 6   | ✓           |     |     |     |      |      |    | ✓  |           |            |
|A     | 7   | ✓           |     |     |     |      |      |    |    | ✓         |            |
|B     | 0   | ✓           | ✓   |     |     |      |      |    |    | ✓         |            |
|B     | 1   | ✓           |     | ✓   |     |      |      |    |    | ✓         |            |
|B     | 2   | ✓           |     |     | ✓   |      |      |    |    | ✓         |            |
|B     | 3   | ✓           |     |     |     | ✓    |      |    |    | ✓         |            |
|B     | 4   | ✓           |     |     |     |      | ✓    |    |    | ✓         |            |
|B     | 5   | ✓           |     |     |     |      |      | ✓  |    | ✓         |            |
|B     | 6   | ✓           |     |     |     |      |      |    | ✓  | ✓         |            |
|B     | 7   | ✓           |     |     |     |      |      |    |    | ✓         | ✓          |

If you're newer to hardware and these functions look like alphabet soup to you, take a look at our [communication protocols documentation](https://tessel.io/docs/communicationProtocols) to get an idea of how these pins should be used.

### Digital pins

A digital pin (any pin other than 3.3V and GND on Tessel 2) is either high (on/3.3V) or low (off/0V). On both of ports A and B, pins 0 and 1 are pulled high to 3.3V by default.

Here is an example usage of a digital pin on Tessel:

```js
var tessel = require('tessel'); // import tessel
var myPin = tessel.port.A.pin[2]; // select pin 2 on port A
myPin.output(1);  // turn pin high (on)
console.log(myPin.read()); // print the pin value to the console
myPin.output(0);  // turn pin low (off)
```

### Analog pins

An analog pin is a pin whose value can vary in the range between 0V and 3.3V. Pins 4 and 7 on port A and all pins on port B can read analog values (though pins 0 and 1 are pulled to 3.3V by default and are thus not recommended for this purpose). Pin 7 on port B can write an analog value.

Here is an example usage of an analog pin on Tessel:

```js
var tessel = require('tessel'); // import tessel
var myPin = tessel.port.B.pin[7]; // select pin 7 on port B
myPin.analogWrite(0.6);  // turn pin to 60% of high
myPin.analogRead(function (val) {
  console.log(val);
}); // print the pin value to the console
```

### PWM pins

PWM pins are not yet implemented. See [#21](https://github.com/tessel/t2-firmware/issues/21).

### I2C

An I2C channel uses the SCL and SDA pins (0 and 1 on Tessel 2). If you are unfamiliar with the I2C protocol, please see the [communication protocols tutorial](https://tessel.io/docs/communicationProtocols#i2c).

Here is an example using Tessel's I2C protocol:

```js
var port = tessel.port.A;
var slaveAddress = 0xDE;
var i2c = new port.I2C(slaveAddress)
i2c.transfer(new Buffer([0xde, 0xad, 0xbe, 0xef]), function (err, rx) {
  console.log('buffer returned by I2C slave ('+slaveAddress.toString(16)+'):', rx);
})
```

### SPI

A SPI channel uses the SCK, MISO, and MOSI pins (2, 3, and 4 on Tessel 2). If you are unfamiliar with the SPI protocol, please see the [communication protocols tutorial](https://tessel.io/docs/communicationProtocols#spi).

Here is an example using Tessel's SPI protocol:

```js
var port = tessel.port.A;
var spi = new port.SPI({
  clockSpeed: 4*1000*1000, // 4MHz
  cpol: 1, // polarity
  cpha: 0, // clock phase
});

spi.transfer(new Buffer([0xde, 0xad, 0xbe, 0xef]), function (err, rx) {
  console.log('buffer returned by SPI slave:', rx);
});
```

### UART/Serial

A UART (serial) channel uses the TX and RX pins (5 and 6 on Tessel 2). If you are unfamiliar with the UART protocol, please see the [communication protocols tutorial](https://tessel.io/docs/communicationProtocols#uart).

Here is an example using Tessel's UART protocol:

```js
var port = tessel.port.A;
var uart = new port.UART({
  baudrate: 115200
});

uart.write('ahoy hoy\n')
uart.on('data', function (data) {
  console.log('received:', data);
})

// UART objects are streams!
// pipe all incoming data to stdout:
uart.pipe(process.stdout);
```

## Button and LEDs

Tessel 2's button and LEDs are not yet exposed in the API – but you can change that! See [#15](https://github.com/tessel/t2-firmware/issues/15) for a description of what needs to be done.

## USB Ports

USB modules do not need to be accessed through the Tessel object. See [node-audiovideo](https://github.com/tessel/node-audiovideo) for an example USB module.

'use strict';

process.env.IS_TEST_MODE = true;
process.noDeprecation = true;

// System Objects
// spy/syub as needed
const cp = require('child_process');
const Duplex = require('stream').Duplex;
const Emitter = require('events').EventEmitter;
const fs = require('fs');
const net = require('net');

// Third Party Dependencies
const sinon = require('sinon');

// Exported Module
const Tessel = require('../../tessel-export');

// These are ONLY exported for testing.
const CMD = Tessel.CMD;
const REPLY = Tessel.REPLY;

// Shared sinon sandbox
const sandbox = sinon.sandbox.create();

class FakeSocket extends Duplex {
  constructor() {
    super();
    this.ref = () => {};
    this.unref = () => {};
  }
  read() {
    // Do not remove
  }
}

exports['Tessel'] = {
  setUp(done) {
    this.led = new Tessel.LED('red', '/sys/devices/leds/leds/tessel:red:error/brightness');
    this.LED = sandbox.stub(Tessel, 'LED').callsFake(() => this.led);
    this.Port = sandbox.stub(Tessel, 'Port');
    this.fsWrite = sandbox.stub(fs, 'writeFile');

    this.tessel = new Tessel();
    done();
  },

  tearDown(done) {
    Tessel.instance = null;
    sandbox.restore();
    done();
  },

  instanceReused(test) {
    test.expect(1);
    test.equal(new Tessel(), this.tessel);
    test.done();
  },

  instanceProperties(test) {
    test.expect(5);
    test.notEqual(typeof this.tessel.ports, undefined);
    test.notEqual(typeof this.tessel.port, undefined);
    test.notEqual(typeof this.tessel.led, undefined);
    test.notEqual(typeof this.tessel.network, undefined);
    test.notEqual(typeof this.tessel.version, undefined);
    test.done();
  },

  portsAliasToPort(test) {
    test.expect(1);
    test.equal(this.tessel.port, this.tessel.ports);
    test.done();
  },

  twoPortsInitialized(test) {
    test.expect(5);
    test.equal(this.tessel.ports.A instanceof Tessel.Port, true);
    test.equal(this.tessel.ports.B instanceof Tessel.Port, true);
    test.equal(this.Port.callCount, 2);
    test.deepEqual(this.Port.firstCall.args, ['A', '/var/run/tessel/port_a', this.tessel]);
    test.deepEqual(this.Port.lastCall.args, ['B', '/var/run/tessel/port_b', this.tessel]);
    test.done();
  },

  ledsLazyInitialization(test) {
    test.expect(3);
    test.equal(this.LED.callCount, 0);
    // Trigger a [[Get]], which will return the stub above
    test.equal(this.tessel.led[0], this.led);
    test.equal(this.LED.callCount, 1);
    test.done();
  },

  ledsLazyInitializedAndOff(test) {
    test.expect(5);

    test.strictEqual(this.tessel.led[0].value, 0);
    test.equal(this.fsWrite.callCount, 1);
    test.equal(this.fsWrite.lastCall.args[0], '/sys/devices/leds/leds/tessel:red:error/brightness');
    test.equal(this.fsWrite.lastCall.args[1], '0');
    test.equal(this.LED.callCount, 1);
    test.done();
  },

  fourLEDsInitialized(test) {
    test.expect(9);
    this.LED.restore();
    this.leds = [
      new Tessel.LED('red', '/sys/devices/leds/leds/tessel:red:error/brightness'),
      new Tessel.LED('amber', '/sys/devices/leds/leds/tessel:amber:wlan/brightness'),
      new Tessel.LED('green', '/sys/devices/leds/leds/tessel:green:user1/brightness'),
      new Tessel.LED('blue', '/sys/devices/leds/leds/tessel:blue:user2/brightness'),
    ];

    this.LED = sandbox.stub(Tessel, 'LED').callsFake(() => this.leds[this.LED.callCount - 1]);

    test.equal(this.tessel.led[0], this.leds[0]);
    test.equal(this.tessel.led[1], this.leds[1]);
    test.equal(this.tessel.led[2], this.leds[2]);
    test.equal(this.tessel.led[3], this.leds[3]);
    test.equal(this.LED.callCount, 4);
    test.deepEqual(
      this.LED.getCall(0).args, ['red', '/sys/devices/leds/leds/tessel:red:error/brightness']
    );
    test.deepEqual(
      this.LED.getCall(1).args, ['amber', '/sys/devices/leds/leds/tessel:amber:wlan/brightness']
    );
    test.deepEqual(
      this.LED.getCall(2).args, ['green', '/sys/devices/leds/leds/tessel:green:user1/brightness']
    );
    test.deepEqual(
      this.LED.getCall(3).args, ['blue', '/sys/devices/leds/leds/tessel:blue:user2/brightness']
    );

    test.done();
  },

  networkWifiInitialized(test) {
    test.expect(1);
    test.equal(this.tessel.network.wifi instanceof Tessel.Wifi, true);
    test.done();
  },

  tesselVersion(test) {
    test.expect(1);
    test.equal(this.tessel.version, 2);
    test.done();
  },
};

exports['Tessel.prototype'] = {
  setUp(done) {
    this.LED = sandbox.spy(Tessel, 'LED');
    this.Port = sandbox.stub(Tessel, 'Port');
    this.fsWrite = sandbox.stub(fs, 'writeFile');

    this.tessel = new Tessel();
    done();
  },

  tearDown(done) {
    Tessel.instance = null;
    sandbox.restore();
    done();
  },

  closeBoth(test) {
    test.expect(1);

    const spy = sandbox.spy();

    this.tessel.port.A.close = spy;
    this.tessel.port.B.close = spy;

    this.tessel.close();

    test.equal(spy.callCount, 2);
    test.done();
  },

  closeSpecificA(test) {
    test.expect(2);

    this.tessel.port.A.close = sandbox.spy();
    this.tessel.port.B.close = sandbox.spy();

    this.tessel.close('A');

    test.equal(this.tessel.port.A.close.callCount, 1);
    test.equal(this.tessel.port.B.close.callCount, 0);
    test.done();
  },

  closeSpecificB(test) {
    test.expect(2);

    this.tessel.port.A.close = sandbox.spy();
    this.tessel.port.B.close = sandbox.spy();

    this.tessel.close('B');

    test.equal(this.tessel.port.A.close.callCount, 0);
    test.equal(this.tessel.port.B.close.callCount, 1);
    test.done();
  },

  openOnlyIfNotAlreadyOpen(test) {
    test.expect(1);

    Tessel.Port.reset();

    const destroyed = false;
    const sock = {
      destroyed
    };

    this.tessel.port.A = {
      sock
    };
    this.tessel.port.B = {
      sock
    };

    this.tessel.open('A');
    this.tessel.open('B');

    test.equal(Tessel.Port.callCount, 0);
    test.done();
  },

  openInstantiatesTesselPortWithTheseArgs(test) {
    test.expect(7);

    test.equal(Tessel.Port.firstCall.args[0], 'A');
    test.equal(Tessel.Port.lastCall.args[0], 'B');

    Tessel.Port.reset();

    this.tessel.port.A = null;

    this.tessel.open('A');

    test.equal(this.tessel.port.A instanceof Tessel.Port, true);
    test.equal(Tessel.Port.callCount, 1);
    test.equal(Tessel.Port.lastCall.args[0], 'A');
    test.equal(Tessel.Port.lastCall.args[1], Tessel.Port.PATH.A);
    test.equal(Tessel.Port.lastCall.args[2], this.tessel);
    test.done();
  },

  openBothFromNothing(test) {
    test.expect(3);

    Tessel.Port.reset();

    this.tessel.port.A = null;
    this.tessel.port.B = null;

    this.tessel.open();

    test.equal(Tessel.Port.callCount, 2);
    test.equal(this.tessel.port.A instanceof Tessel.Port, true);
    test.equal(this.tessel.port.B instanceof Tessel.Port, true);

    test.done();
  },

  openBothFromPreviouslyDestroyedPort(test) {
    test.expect(3);

    Tessel.Port.reset();

    const destroyed = true;

    this.tessel.port.A.sock = {
      destroyed
    };
    this.tessel.port.B.sock = {
      destroyed
    };

    this.tessel.open();

    test.equal(Tessel.Port.callCount, 2);
    test.equal(this.tessel.port.A instanceof Tessel.Port, true);
    test.equal(this.tessel.port.B instanceof Tessel.Port, true);

    test.done();
  },

  reboot(test) {
    test.expect(7);

    const close = sandbox.stub(this.tessel, 'close');
    const execSync = sandbox.stub(cp, 'execSync');
    const destroyed = true;

    this.tessel.port.A.sock = {
      destroyed
    };
    this.tessel.port.B.sock = {
      destroyed
    };

    this.tessel.reboot();

    test.equal(close.callCount, 1);
    test.equal(execSync.callCount, 5);
    test.equal(execSync.getCall(0).args[0], '/etc/init.d/spid stop');
    test.equal(execSync.getCall(1).args[0], 'echo "39" > /sys/class/gpio/export');
    test.equal(execSync.getCall(2).args[0], 'echo "out" > /sys/class/gpio/gpio39/direction');
    test.equal(execSync.getCall(3).args[0], 'echo "0" > /sys/class/gpio/gpio39/value');
    test.equal(execSync.lastCall.args[0], 'reboot');
    test.done();
  },
  pollUntilSocketsDestroyed(test) {
    test.expect(1);

    sandbox.stub(global, 'setImmediate');
    sandbox.stub(this.tessel, 'close');
    sandbox.stub(cp, 'execSync');

    const destroyed = false;

    this.tessel.port.A.sock = {
      destroyed
    };
    this.tessel.port.B.sock = {
      destroyed
    };

    this.tessel.reboot();

    test.equal(global.setImmediate.callCount, 1);
    test.done();
  },
};


exports['Tessel.LED'] = {
  setUp(done) {
    this.led = new Tessel.LED('red', '/sys/devices/leds/leds/tessel:red:error/brightness');
    this.LED = sandbox.stub(Tessel, 'LED').callsFake(() => this.led);
    this.Port = sandbox.stub(Tessel, 'Port');
    this.fsWrite = sandbox.stub(fs, 'writeFile');
    this.ledWrite = sandbox.spy(this.led, 'write');
    this.tessel = new Tessel();
    done();
  },

  tearDown(done) {
    Tessel.instance = null;
    sandbox.restore();
    done();
  },

  high(test) {
    test.expect(3);

    this.tessel.led[0].high();

    test.strictEqual(this.tessel.led[0].value, 1);
    test.strictEqual(this.ledWrite.lastCall.args[0], 1);
    test.equal(this.fsWrite.lastCall.args[1], '1');
    test.done();
  },

  on(test) {
    test.expect(4);
    test.equal(this.tessel.led[0].on(), this.tessel.led[0]);
    test.strictEqual(this.tessel.led[0].value, 1);
    test.strictEqual(this.ledWrite.lastCall.args[0], 1);
    test.equal(this.fsWrite.lastCall.args[1], '1');
    test.done();
  },

  low(test) {
    test.expect(3);

    this.tessel.led[0].low();

    test.strictEqual(this.tessel.led[0].value, 0);
    test.strictEqual(this.ledWrite.lastCall.args[0], 0);
    test.equal(this.fsWrite.lastCall.args[1], '0');
    test.done();
  },

  off(test) {
    test.expect(4);
    test.equal(this.tessel.led[0].off(), this.tessel.led[0]);
    test.strictEqual(this.tessel.led[0].value, 0);
    test.strictEqual(this.ledWrite.lastCall.args[0], 0);
    test.equal(this.fsWrite.lastCall.args[1], '0');
    test.done();
  },

  isOn(test) {
    test.expect(3);

    test.equal(this.tessel.led[0].isOn, false);

    this.tessel.led[0].on();

    test.equal(this.tessel.led[0].isOn, true);

    test.throws(() => {
      this.tessel.led[0].isOn = false;
    });
    test.done();
  },

  outputIsTheSameAsWrite(test) {
    test.expect(1);
    this.ledWrite.restore();
    test.equal(Tessel.LED.prototype.output, Tessel.LED.prototype.write);
    test.done();
  },

  readStateValueOfLED(test) {
    test.expect(1);
    this.tessel.led[0].write(0);
    this.tessel.led[0].write(1);
    this.tessel.led[0].read((error, state) => {
      test.equal(state, 1);
      test.done();
    });
  },

  toggleUpdatesTheValue(test) {
    test.expect(4);

    test.strictEqual(this.tessel.led[0].value, 0);
    this.tessel.led[0].write(1);
    test.strictEqual(this.tessel.led[0].value, 1);
    this.tessel.led[0].toggle();
    test.strictEqual(this.tessel.led[0].value, 0);
    this.tessel.led[0].toggle();
    test.strictEqual(this.tessel.led[0].value, 1);
    test.done();
  },

  writeUpdatesTheValue(test) {
    test.expect(2);

    test.strictEqual(this.tessel.led[0].value, 0);
    this.tessel.led[0].write(1);
    test.strictEqual(this.tessel.led[0].value, 1);

    test.done();
  },

  writeAcceptsBooleanOrNumberForBackCompat(test) {
    test.expect(9);

    test.strictEqual(this.tessel.led[0].value, 0);

    this.tessel.led[0].write(true);
    test.strictEqual(this.tessel.led[0].value, 1);
    test.equal(this.fsWrite.lastCall.args[1], '1');

    this.tessel.led[0].write(false);
    test.strictEqual(this.tessel.led[0].value, 0);
    test.equal(this.fsWrite.lastCall.args[1], '0');

    this.tessel.led[0].write(1);
    test.strictEqual(this.tessel.led[0].value, 1);
    test.equal(this.fsWrite.lastCall.args[1], '1');

    this.tessel.led[0].write(0);
    test.strictEqual(this.tessel.led[0].value, 0);
    test.equal(this.fsWrite.lastCall.args[1], '0');

    test.done();
  },
};

exports['Tessel.LEDs (collection operations)'] = {
  setUp(done) {
    this.led = new Tessel.LED('red', '/sys/devices/leds/leds/tessel:red:error/brightness');
    this.LED = sandbox.stub(Tessel, 'LED').callsFake(() => this.led);
    this.LEDs = sandbox.spy(Tessel, 'LEDs');
    this.Port = sandbox.stub(Tessel, 'Port');
    this.fsWrite = sandbox.stub(fs, 'writeFile');

    // The same LED instance is used, so all callCounts should be 4
    this.on = sandbox.spy(this.led, 'on');
    this.off = sandbox.spy(this.led, 'off');
    this.toggle = sandbox.spy(this.led, 'toggle');

    this.tessel = new Tessel();
    done();
  },

  tearDown(done) {
    Tessel.instance = null;
    sandbox.restore();
    done();
  },

  alias(test) {
    test.expect(1);
    test.equal(this.tessel.led, this.tessel.leds);
    test.done();
  },

  on(test) {
    test.expect(2);
    test.equal(this.tessel.leds.on(), this.tessel.leds);
    test.equal(this.on.callCount, 4);
    test.done();
  },

  off(test) {
    test.expect(2);
    test.equal(this.tessel.leds.off(), this.tessel.leds);
    test.equal(this.off.callCount, 4);
    test.done();
  },

  toggle(test) {
    test.expect(2);
    test.equal(this.tessel.leds.toggle(), this.tessel.leds);
    test.equal(this.toggle.callCount, 4);
    test.done();
  },

};


exports['Tessel.Port'] = {
  setUp(done) {
    this.createConnection = sandbox.stub(net, 'createConnection').callsFake(() => new FakeSocket());

    this.tessel = new Tessel();
    done();
  },

  tearDown(done) {
    Tessel.instance = null;
    sandbox.restore();
    done();
  },

  emitter(test) {
    test.expect(1);

    const port = new Tessel.Port('foo', '/foo/bar/baz', this.tessel);

    test.ok(port instanceof Emitter);

    test.done();
  },

  netConnection(test) {
    test.expect(1);

    this.createConnection.restore();
    this.createConnection = sandbox.stub(net, 'createConnection').callsFake((options, callback) => {
      callback(new Error('Some error'));
    });

    test.throws(() => new Tessel.Port());
    test.done();
  },

  'socket event:error' (test) {
    test.expect(2);

    const port = new Tessel.Port('foo', '/foo/bar/baz', this.tessel);

    sandbox.stub(console, 'log');

    port.sock.emit('error', new Error('some error'));

    test.equal(console.log.callCount, 1);
    test.equal(console.log.lastCall.args[0], 'Socket: Error occurred: Error: some error');

    test.done();
  },

  'socket event:end' (test) {
    test.expect(2);

    const port = new Tessel.Port('foo', '/foo/bar/baz', this.tessel);

    sandbox.stub(console, 'log');

    port.sock.emit('end');

    test.equal(console.log.callCount, 1);
    test.equal(console.log.lastCall.args[0], 'Socket: The other end sent FIN packet.');

    test.done();
  },

  'socket event:close' (test) {
    test.expect(2);

    const port = new Tessel.Port('foo', '/foo/bar/baz', this.tessel);

    port.sock.isAllowedToClose = false;
    test.throws(() => port.sock.emit('close'));

    port.sock.isAllowedToClose = true;
    test.doesNotThrow(() => port.sock.emit('close'));

    test.done();
  },

  instanceProperties(test) {
    test.expect(16);

    const port = new Tessel.Port('foo', '/foo/bar/baz', this.tessel);

    test.equal(port.board, this.tessel);
    test.equal(port.mode, 'none');
    test.equal(port.name, 'foo');
    test.ok(Array.isArray(port.replyQueue));
    test.equal(port.replyQueue.length, 0);
    test.ok(Array.isArray(port.pin));
    test.equal(port.pin.length, 8);
    test.ok(Array.isArray(port.pwm));
    test.equal(port.pwm.length, 2);
    test.ok(port.sock);
    test.ok(port.I2C);
    test.equal(port.I2C.enabled, false);

    test.ok(port.SPI);
    test.ok(port.UART);

    test.equal(port.spi, null);
    test.equal(port.uart, null);

    test.done();
  },

  privateData(test) {
    test.expect(3);

    this.wm = sandbox.spy(WeakMap.prototype, 'set');

    const port = new Tessel.Port('foo', '/foo/bar/baz', this.tessel);

    const key = this.wm.lastCall.args[0];
    const state = this.wm.lastCall.args[1];

    test.equal(key, port);
    test.equal(state.spi, null);
    test.equal(state.uart, null);

    test.done();
  },

  isAllowedToCloseFalse(test) {
    test.expect(1);

    const port = new Tessel.Port('foo', '/foo/bar/baz', this.tessel);

    test.equal(port.sock.isAllowedToClose, false);
    test.done();
  },

  isAllowedToCloseTrue(test) {
    test.expect(5);

    const spy = sandbox.spy();
    const A = this.tessel.port.A;
    const B = this.tessel.port.B;

    test.equal(A.sock.isAllowedToClose, false);
    test.equal(B.sock.isAllowedToClose, false);

    // If any error is emitted, the test will fail.
    A.sock.destroy = () => {
      A.sock.emit('close');
    };
    B.sock.destroy = () => {
      B.sock.emit('close');
    };

    A.sock.on('close', spy);
    B.sock.on('close', spy);

    this.tessel.close();

    test.equal(A.sock.isAllowedToClose, true);
    test.equal(B.sock.isAllowedToClose, true);
    test.equal(spy.callCount, 2);
    test.done();
  },

  instancePropertiesDeprecated(test) {
    test.expect(7);

    const port = new Tessel.Port('foo', '/foo/bar/baz', this.tessel);

    test.equal(port.pin.G1, port.pin.g1);
    test.equal(port.pin.G1, port.pin[5]);
    test.equal(port.pin.G2, port.pin.g2);
    test.equal(port.pin.G2, port.pin[6]);
    test.equal(port.pin.G3, port.pin.g3);
    test.equal(port.pin.G3, port.pin[7]);
    test.deepEqual(port.digital, [port.pin[5], port.pin[6], port.pin[7]]);
    test.done();
  },

  forwardSocketPath(test) {
    test.expect(1);

    new Tessel.Port('foo', '/foo/bar/baz', this.tessel);
    test.deepEqual(this.createConnection.lastCall.args[0], {
      path: '/foo/bar/baz'
    });
    test.done();
  },

  eightPinsInitialized(test) {
    test.expect(9);

    this.Pin = sandbox.stub(Tessel, 'Pin');

    const port = new Tessel.Port('A', '/foo/bar/baz', this.tessel);

    test.equal(this.Pin.callCount, 8);
    test.equal(port.pin[0] instanceof Tessel.Pin, true);
    test.equal(port.pin[1] instanceof Tessel.Pin, true);
    test.equal(port.pin[2] instanceof Tessel.Pin, true);
    test.equal(port.pin[3] instanceof Tessel.Pin, true);
    test.equal(port.pin[5] instanceof Tessel.Pin, true);
    test.equal(port.pin[6] instanceof Tessel.Pin, true);
    test.equal(port.pin[4] instanceof Tessel.Pin, true);
    test.equal(port.pin[7] instanceof Tessel.Pin, true);

    test.done();
  },

  supportsADC_A(test) {
    test.expect(8);

    const port = new Tessel.Port('A', '/foo/bar/baz', this.tessel);

    test.equal(port.pin[0].supports.ADC, false);
    test.equal(port.pin[1].supports.ADC, false);
    test.equal(port.pin[2].supports.ADC, false);
    test.equal(port.pin[3].supports.ADC, false);
    test.equal(port.pin[5].supports.ADC, false);
    test.equal(port.pin[6].supports.ADC, false);

    test.equal(port.pin[4].supports.ADC, true);
    test.equal(port.pin[7].supports.ADC, true);

    test.done();
  },

  supportsADC_B(test) {
    test.expect(8);

    const port = new Tessel.Port('B', '/foo/bar/baz', this.tessel);

    test.equal(port.pin[0].supports.ADC, true);
    test.equal(port.pin[1].supports.ADC, true);
    test.equal(port.pin[2].supports.ADC, true);
    test.equal(port.pin[3].supports.ADC, true);
    test.equal(port.pin[4].supports.ADC, true);
    test.equal(port.pin[5].supports.ADC, true);
    test.equal(port.pin[6].supports.ADC, true);
    test.equal(port.pin[7].supports.ADC, true);

    test.done();
  },

  supports_INTA(test) {
    test.expect(8);

    const port = new Tessel.Port('A', '/foo/bar/baz', this.tessel);

    test.equal(port.pin[0].supports.INT, false);
    test.equal(port.pin[1].supports.INT, false);
    test.equal(port.pin[3].supports.INT, false);
    test.equal(port.pin[4].supports.INT, false);

    test.equal(port.pin[2].supports.INT, true);
    test.equal(port.pin[5].supports.INT, true);
    test.equal(port.pin[6].supports.INT, true);
    test.equal(port.pin[7].supports.INT, true);

    test.done();
  },

  supports_INTB(test) {
    test.expect(8);

    const port = new Tessel.Port('B', '/foo/bar/baz', this.tessel);

    test.equal(port.pin[0].supports.INT, false);
    test.equal(port.pin[1].supports.INT, false);
    test.equal(port.pin[3].supports.INT, false);
    test.equal(port.pin[4].supports.INT, false);

    test.equal(port.pin[2].supports.INT, true);
    test.equal(port.pin[5].supports.INT, true);
    test.equal(port.pin[6].supports.INT, true);
    test.equal(port.pin[7].supports.INT, true);

    test.done();
  },

  busProtocolClassWrappersAreConstructors(test) {
    test.expect(6);

    sandbox.stub(Tessel, 'I2C');
    sandbox.stub(Tessel, 'SPI');
    sandbox.stub(Tessel, 'UART');

    const port = new Tessel.Port('B', '/foo/bar/baz', this.tessel);

    test.doesNotThrow(() => {
      new port.I2C(1);
    });
    test.doesNotThrow(() => {
      new port.SPI({});
    });
    test.doesNotThrow(() => {
      new port.UART({});
    });

    test.equal(Tessel.I2C.callCount, 1);
    test.equal(Tessel.SPI.callCount, 1);
    test.equal(Tessel.UART.callCount, 1);

    test.done();
  },

};

exports['Tessel.Port.prototype'] = {
  setUp(done) {
    this.socket = new FakeSocket();

    this.createConnection = sandbox.stub(net, 'createConnection').callsFake(() => {
      this.socket.cork = sandbox.spy();
      this.socket.uncork = sandbox.spy();
      this.socket.write = sandbox.spy();
      this.socket.read = sandbox.stub().returns(new Buffer([REPLY.DATA]));
      return this.socket;
    });

    this.tessel = new Tessel();

    this.I2C = sandbox.stub(Tessel, 'I2C');
    this.SPI = sandbox.stub(Tessel, 'SPI');
    this.UART = sandbox.stub(Tessel, 'UART');

    this.port = new Tessel.Port('foo', '/foo/bar/baz', this.tessel);
    this.a = new Tessel.Port('A', '/foo/bar/a', this.tessel);
    this.b = new Tessel.Port('B', '/foo/bar/b', this.tessel);
    done();
  },

  tearDown(done) {
    Tessel.instance = null;
    sandbox.restore();
    done();
  },

  close(test) {
    test.expect(3);

    const spy = sandbox.spy();
    this.tessel.port.A.sock.destroy = spy;

    test.equal(this.tessel.port.A.sock.isAllowedToClose, false);

    this.tessel.port.A.close();

    test.equal(this.tessel.port.A.sock.isAllowedToClose, true);
    test.equal(spy.callCount, 1);

    test.done();
  },

  cork(test) {
    test.expect(1);

    this.port.cork();
    test.equal(this.socket.cork.callCount, 1);
    test.done();
  },

  uncork(test) {
    test.expect(1);

    this.port.uncork();
    test.equal(this.socket.uncork.callCount, 1);
    test.done();
  },

  sync(test) {
    test.expect(6);

    this.port.sync();
    test.equal(this.socket.write.callCount, 0);
    test.equal(this.port.replyQueue.length, 0);

    this.port.sync(() => {});
    test.equal(this.socket.write.callCount, 1);
    test.equal(this.port.replyQueue.length, 1);

    const buffer = this.socket.write.lastCall.args[0];

    test.equal(buffer instanceof Buffer, true);
    test.equal(buffer.readUInt8(0), CMD.ECHO);

    // TODO: test the other two buffer values,
    // but need to know what their purpose is.

    test.done();
  },

  command(test) {
    test.expect(4);

    this.port.command([], () => {});

    test.equal(this.socket.cork.callCount, 1);
    test.equal(this.socket.uncork.callCount, 1);

    // Called by command and sync
    test.equal(this.socket.write.callCount, 2);

    // The first call is from command.
    const buffer = this.socket.write.firstCall.args[0];

    test.equal(buffer instanceof Buffer, true);

    test.done();
  },

  status(test) {
    test.expect(3);

    this.port.status([], () => {});
    test.equal(this.socket.write.callCount, 1);
    test.equal(this.port.replyQueue.length, 1);

    const buffer = this.socket.write.lastCall.args[0];

    test.equal(buffer instanceof Buffer, true);

    test.done();
  },

  spi(test) {
    test.expect(5);

    test.equal(this.port.spi, undefined);

    const options = {};
    this.port.SPI(options);

    test.notEqual(this.port.spi, undefined);
    test.equal(Tessel.SPI.callCount, 1);
    test.deepEqual(Tessel.SPI.lastCall.args, [options, this.port]);
    test.equal(this.port.spi instanceof Tessel.SPI, true);

    test.done();
  },

  uart(test) {
    test.expect(5);

    test.equal(this.port.uart, undefined);

    const options = {};
    this.port.UART(options);

    test.notEqual(this.port.uart, undefined);
    test.equal(Tessel.UART.callCount, 1);
    test.deepEqual(Tessel.UART.lastCall.args, [options, this.port]);
    test.equal(this.port.uart instanceof Tessel.UART, true);

    test.done();
  },

  I2CnoArgsAlwaysHasPort(test) {
    test.expect(3);

    const device1 = new this.port.I2C();

    test.equal(device1 instanceof Tessel.I2C, true);

    test.equal(Tessel.I2C.callCount, 1);
    test.equal(Tessel.I2C.firstCall.args[0].port, this.port);

    test.done();
  },

  I2CwithAddressArg(test) {
    test.expect(6);

    const device1 = new this.port.I2C(0x00);
    const device2 = new this.port.I2C(0x01);

    test.notEqual(device1, device2);
    test.equal(device1 instanceof Tessel.I2C, true);
    test.equal(device2 instanceof Tessel.I2C, true);
    test.equal(Tessel.I2C.callCount, 2);

    test.equal(Tessel.I2C.firstCall.args[0].port, this.port);
    test.equal(Tessel.I2C.lastCall.args[0].port, this.port);

    test.done();
  },

  I2CwithOptsAlwaysHasPort(test) {
    test.expect(4);

    const device1 = new this.port.I2C({
      address: 0x00
    });

    test.equal(device1 instanceof Tessel.I2C, true);
    test.equal(Tessel.I2C.callCount, 1);
    test.equal(Tessel.I2C.firstCall.args[0].address, 0x00);
    test.equal(Tessel.I2C.firstCall.args[0].port, this.port);

    test.done();
  },

  I2CwithOptsWrongPortOverridden(test) {
    test.expect(3);

    const device1 = new this.port.I2C({
      address: 0x00,
      port: this.b
    });

    test.equal(device1 instanceof Tessel.I2C, true);
    // The correct port always overrides...
    test.equal(Tessel.I2C.firstCall.args[0].address, 0x00);
    test.equal(Tessel.I2C.firstCall.args[0].port, this.port);

    test.done();
  },

  I2CwithOptsForwarded(test) {
    test.expect(4);

    const device1 = new this.port.I2C({
      address: 0x00,
      frequency: 1e5,
      port: this.b
    });

    test.equal(device1 instanceof Tessel.I2C, true);
    // The correct port always overrides...
    test.equal(Tessel.I2C.firstCall.args[0].address, 0x00);
    test.equal(Tessel.I2C.firstCall.args[0].frequency, 1e5);
    test.equal(Tessel.I2C.firstCall.args[0].port, this.port);

    test.done();
  },

  multiplePortsI2C(test) {
    test.expect(11);

    const aDevice1 = new this.a.I2C(0x00);
    const aDevice2 = new this.a.I2C(0x01);

    const bDevice1 = new this.b.I2C(0x00);
    const bDevice2 = new this.b.I2C(0x01);

    test.notEqual(aDevice1, aDevice2);
    test.notEqual(bDevice1, bDevice2);

    test.equal(aDevice1 instanceof Tessel.I2C, true);
    test.equal(aDevice2 instanceof Tessel.I2C, true);
    test.equal(bDevice1 instanceof Tessel.I2C, true);
    test.equal(bDevice2 instanceof Tessel.I2C, true);

    test.equal(Tessel.I2C.callCount, 4);

    test.equal(Tessel.I2C.firstCall.args[0].port, this.a);
    test.equal(Tessel.I2C.secondCall.args[0].port, this.a);

    test.equal(Tessel.I2C.thirdCall.args[0].port, this.b);
    test.equal(Tessel.I2C.lastCall.args[0].port, this.b);

    test.done();
  },

  txLessThanByteTransferLimit(test) {
    test.expect(6);

    const buffer = new Buffer(255);

    this.cork = sandbox.stub(Tessel.Port.prototype, 'cork');
    this.sync = sandbox.stub(Tessel.Port.prototype, 'sync');
    this.uncork = sandbox.stub(Tessel.Port.prototype, 'uncork');

    this.a.tx(buffer, () => {});

    test.equal(this.cork.callCount, 1);
    test.equal(this.sync.callCount, 1);
    test.equal(this.uncork.callCount, 1);
    // The 2 call write sequence is called once
    test.equal(this.a.sock.write.callCount, 2);

    test.ok(this.a.sock.write.firstCall.args[0].equals(new Buffer([CMD.TX, 255])));
    test.ok(this.a.sock.write.lastCall.args[0].equals(buffer));

    test.done();
  },

  txGreaterThanByteTransferLimit(test) {
    test.expect(8);

    const buffer = new Buffer(510);

    this.cork = sandbox.stub(Tessel.Port.prototype, 'cork');
    this.sync = sandbox.stub(Tessel.Port.prototype, 'sync');
    this.uncork = sandbox.stub(Tessel.Port.prototype, 'uncork');

    this.a.tx(buffer, () => {});

    test.equal(this.cork.callCount, 1);
    test.equal(this.sync.callCount, 1);
    test.equal(this.uncork.callCount, 1);
    // The 2 call write sequence is called twice, since there
    // is twice as many bytes as the transfer limit
    test.equal(this.a.sock.write.callCount, 4);

    test.ok(this.a.sock.write.firstCall.args[0].equals(new Buffer([CMD.TX, 255])));
    test.ok(this.a.sock.write.secondCall.args[0].equals(buffer.slice(0, 255)));

    test.ok(this.a.sock.write.thirdCall.args[0].equals(new Buffer([CMD.TX, 255])));
    test.ok(this.a.sock.write.lastCall.args[0].equals(buffer.slice(255)));

    test.done();
  },

  txInvalidBuffer(test) {
    test.expect(1);

    test.throws(() => {
      this.a.tx(new Buffer(0));
    }, RangeError);

    test.done();
  },

  rx(test) {
    test.expect(5);

    this.cork = sandbox.stub(Tessel.Port.prototype, 'cork');
    this.uncork = sandbox.stub(Tessel.Port.prototype, 'uncork');

    const size = 4;
    const callback = sandbox.spy();

    this.a.rx(size, callback);

    test.equal(this.a.sock.write.callCount, 1);
    test.ok(this.a.sock.write.lastCall.args[0].equals(new Buffer([CMD.RX, size])));

    test.equal(this.a.replyQueue.length, 1);

    const replyQueueEntry = this.a.replyQueue[0];

    test.equal(replyQueueEntry.size, size);
    test.equal(replyQueueEntry.callback, callback);

    //
    // REPLY.DATA responses are tested in:
    // "Tessel.Port Commands (handling incoming socket stream)" -> "replydata"
    //

    test.done();
  },

  rxInvalidLengthZero(test) {
    test.expect(1);

    test.throws(() => {
      this.a.rx(0);
    }, RangeError);

    test.done();
  },

  rxInvalidLengthMax(test) {
    test.expect(1);

    test.throws(() => {
      this.a.rx(256);
    }, RangeError);

    test.done();
  },

  txrx(test) {
    test.expect(8);

    this.cork = sandbox.stub(Tessel.Port.prototype, 'cork');
    this.uncork = sandbox.stub(Tessel.Port.prototype, 'uncork');

    const buffer = new Buffer(4);
    const callback = sandbox.spy();

    this.a.txrx(buffer, callback);

    test.equal(this.cork.callCount, 1);
    test.equal(this.uncork.callCount, 1);
    test.equal(this.a.sock.write.callCount, 2);

    test.equal(this.a.replyQueue.length, 1);

    const replyQueueEntry = this.a.replyQueue[0];

    test.equal(replyQueueEntry.size, buffer.length);
    test.equal(replyQueueEntry.callback, callback);

    test.ok(this.a.sock.write.firstCall.args[0].equals(new Buffer([CMD.TXRX, buffer.length])));
    test.ok(this.a.sock.write.lastCall.args[0].equals(buffer));

    test.done();
  },

  txrxInvalidLengthZero(test) {
    test.expect(1);

    const buffer = new Buffer(0);

    test.throws(() => {
      this.a.txrx(buffer);
    }, RangeError);

    test.done();
  },

  txrxInvalidLengthMax(test) {
    test.expect(1);

    const buffer = new Buffer(256);

    test.throws(() => {
      this.a.txrx(buffer);
    }, RangeError);

    test.done();
  },

};

exports['Tessel.Port Commands (handling incoming socket stream)'] = {
  setUp(done) {
    this.socket = new FakeSocket();

    this.createConnection = sandbox.stub(net, 'createConnection').callsFake(() => {
      this.socket.cork = sandbox.spy();
      this.socket.uncork = sandbox.spy();
      this.socket.write = sandbox.spy();
      // Stubbed as needed
      this.socket.read = sandbox.stub().returns(new Buffer([REPLY.DATA]));
      return this.socket;
    });

    this.port = new Tessel.Port('foo', '/foo/bar/baz', {});

    done();
  },

  tearDown(done) {
    Tessel.instance = null;
    sandbox.restore();
    done();
  },

  readableButNull(test) {
    test.expect(1);

    this.port.sock.read.returns(null);

    this.port.sock.emit('readable');

    setImmediate(() => {
      test.ok(true, 'Reaching the next execution turns means that Buffer.concat did not fail on `null`');
      test.done();
    });
  },

  replyhigh(test) {
    test.expect(1);

    this.port.sock.read.returns(new Buffer([REPLY.HIGH]));
    this.port.replyQueue.push({
      size: 0,
      callback(err, data) {
        test.equal(data, REPLY.HIGH);
        test.done();
      },
    });

    this.port.sock.emit('readable');
  },

  replylow(test) {
    test.expect(1);

    this.port.sock.read.returns(new Buffer([REPLY.LOW]));
    this.port.replyQueue.push({
      size: 0,
      callback(err, data) {
        test.equal(data, REPLY.LOW);
        test.done();
      },
    });

    this.port.sock.emit('readable');
  },

  replydata(test) {
    test.expect(4);

    this.port.sock.read.returns(new Buffer([REPLY.DATA, 0xff, 0x7f, 0x3f, 0x1f]));
    this.port.replyQueue.push({
      size: 4,
      callback(err, data) {
        test.equal(data[0], 0xff);
        test.equal(data[1], 0x7f);
        test.equal(data[2], 0x3f);
        test.equal(data[3], 0x1f);
        test.done();
      },
    });

    this.port.sock.emit('readable');
  },

  replyDataPartial(test) {
    test.expect(4);

    this.port.replyQueue.push({
      size: 4,
      callback(err, data) {
        test.equal(data[0], 0xff);
        test.equal(data[1], 0x7f);
        test.equal(data[2], 0x3f);
        test.equal(data[3], 0x1f);
        test.done();
      },
    });

    this.port.sock.read.returns(new Buffer([REPLY.DATA, 0xff, 0x7f]));
    this.port.sock.emit('readable');

    this.port.sock.read.returns(new Buffer([0x3f, 0x1f]));
    this.port.sock.emit('readable');
  },

  noregisteredreplyhandler(test) {
    test.expect(1);

    test.throws(() => {
      this.port.replyQueue.length = 0;
      this.port.sock.read.returns(new Buffer([REPLY.HIGH]));
      this.port.sock.emit('readable');
    }, Error);

    test.done();
  },

  replydataunexpected(test) {
    test.expect(2);

    const spy = sandbox.spy();

    test.throws(() => {
      this.port.replyQueue.push({
        size: 0,
        callback: spy,
      });

      this.port.sock.read.returns(new Buffer([REPLY.DATA, 0xff, 0x7f]));
      this.port.sock.emit('readable');
    }, Error);

    test.equal(spy.callCount, 0);
    test.done();
  },


  replyasyncpinchange(test) {
    test.expect(4);

    const low = sandbox.spy();
    const high = sandbox.spy();

    this.port.pin[2].once('low', low);
    this.port.pin[5].once('high', high);

    this.port.sock.read.returns(new Buffer([REPLY.ASYNC_PIN_CHANGE_N + 2]));
    this.port.sock.emit('readable');

    this.port.sock.read.returns(new Buffer([REPLY.ASYNC_PIN_CHANGE_N + 5]));
    this.port.sock.emit('readable');

    test.equal(low.callCount, 1);
    test.equal(high.callCount, 1);

    test.equal(this.port.pin[2].interruptMode, null);
    test.equal(this.port.pin[5].interruptMode, null);

    test.done();
  },

  replyminasync(test) {
    test.expect(1);

    this.port.on('async-event', data => {
      test.equal(data, REPLY.MIN_ASYNC);
      test.done();
    });

    this.port.sock.read.returns(new Buffer([REPLY.MIN_ASYNC]));
    this.port.sock.emit('readable');
  },
};

exports['Tessel.Pin'] = {
  setUp(done) {

    this.createConnection = sandbox.stub(net, 'createConnection').callsFake(() => {
      const socket = new FakeSocket();
      socket.cork = sandbox.spy();
      socket.uncork = sandbox.spy();
      socket.write = sandbox.spy();
      // Stubbed as needed
      socket.read = sandbox.stub().returns(new Buffer([REPLY.DATA]));
      return socket;
    });

    this.command = sandbox.stub(Tessel.Port.prototype, 'command');

    this.tessel = new Tessel();

    this.a = new Tessel.Port('A', '/foo/bar/baz', this.tessel);
    this.b = new Tessel.Port('B', '/foo/bar/baz', this.tessel);

    done();
  },

  tearDown(done) {
    Tessel.instance = null;
    sandbox.restore();
    done();
  },

  emitter(test) {
    test.expect(1);
    test.equal(new Tessel.Pin(0, this.a) instanceof Emitter, true);
    test.done();
  },

  initializationA(test) {
    test.expect(54);

    const pins = [];

    for (let i = 0; i < 8; i++) {
      pins.push(new Tessel.Pin(i, this.a));
    }

    // Pin Number (matches index)
    test.equal(pins[0].pin, 0);
    test.equal(pins[1].pin, 1);
    test.equal(pins[2].pin, 2);
    test.equal(pins[3].pin, 3);
    test.equal(pins[4].pin, 4);
    test.equal(pins[5].pin, 5);
    test.equal(pins[6].pin, 6);
    test.equal(pins[7].pin, 7);

    // resolution property
    test.equal(pins[0].resolution, 4096);
    test.equal(pins[1].resolution, 4096);
    test.equal(pins[2].resolution, 4096);
    test.equal(pins[3].resolution, 4096);
    test.equal(pins[4].resolution, 4096);
    test.equal(pins[5].resolution, 4096);
    test.equal(pins[6].resolution, 4096);
    test.equal(pins[7].resolution, 4096);

    // Port
    test.equal(pins[0].port, this.a);
    test.equal(pins[1].port, this.a);
    test.equal(pins[2].port, this.a);
    test.equal(pins[3].port, this.a);
    test.equal(pins[4].port, this.a);
    test.equal(pins[5].port, this.a);
    test.equal(pins[6].port, this.a);
    test.equal(pins[7].port, this.a);

    // Interrupts on 2, 5, 6, 7
    test.equal(pins[2].supports.INT, true);
    test.equal(pins[5].supports.INT, true);
    test.equal(pins[6].supports.INT, true);
    test.equal(pins[7].supports.INT, true);

    // Analog on 4, 7
    test.equal(pins[4].supports.ADC, true);
    test.equal(pins[7].supports.ADC, true);

    // Pull resistors on 2-7
    test.equal(pins[0].supports.PULL, false);
    test.equal(pins[1].supports.PULL, false);
    test.equal(pins[2].supports.PULL, true);
    test.equal(pins[3].supports.PULL, true);
    test.equal(pins[4].supports.PULL, true);
    test.equal(pins[5].supports.PULL, true);
    test.equal(pins[6].supports.PULL, true);
    test.equal(pins[7].supports.PULL, true);

    // Present Interrupt Mode
    test.equal(pins[0].interruptMode, null);
    test.equal(pins[1].interruptMode, null);
    test.equal(pins[2].interruptMode, null);
    test.equal(pins[3].interruptMode, null);
    test.equal(pins[4].interruptMode, null);
    test.equal(pins[5].interruptMode, null);
    test.equal(pins[6].interruptMode, null);
    test.equal(pins[7].interruptMode, null);

    // isPWM?
    test.equal(pins[0].isPWM, false);
    test.equal(pins[1].isPWM, false);
    test.equal(pins[2].isPWM, false);
    test.equal(pins[3].isPWM, false);
    test.equal(pins[4].isPWM, false);
    test.equal(pins[5].isPWM, false);
    test.equal(pins[6].isPWM, false);
    test.equal(pins[7].isPWM, false);

    test.done();
  },

  initializationB(test) {
    test.expect(52);

    const pins = [];

    for (let i = 0; i < 8; i++) {
      pins.push(new Tessel.Pin(i, this.b));
    }

    // Pin Number (matches index)
    test.equal(pins[0].pin, 0);
    test.equal(pins[1].pin, 1);
    test.equal(pins[2].pin, 2);
    test.equal(pins[3].pin, 3);
    test.equal(pins[4].pin, 4);
    test.equal(pins[5].pin, 5);
    test.equal(pins[6].pin, 6);
    test.equal(pins[7].pin, 7);

    // Port
    test.equal(pins[0].port, this.b);
    test.equal(pins[1].port, this.b);
    test.equal(pins[2].port, this.b);
    test.equal(pins[3].port, this.b);
    test.equal(pins[4].port, this.b);
    test.equal(pins[5].port, this.b);
    test.equal(pins[6].port, this.b);
    test.equal(pins[7].port, this.b);

    // Interrupts on 2, 5, 6, 7
    test.equal(pins[2].supports.INT, true);
    test.equal(pins[5].supports.INT, true);
    test.equal(pins[6].supports.INT, true);
    test.equal(pins[7].supports.INT, true);

    // Analog on all
    test.equal(pins[0].supports.ADC, true);
    test.equal(pins[1].supports.ADC, true);
    test.equal(pins[2].supports.ADC, true);
    test.equal(pins[3].supports.ADC, true);
    test.equal(pins[4].supports.ADC, true);
    test.equal(pins[5].supports.ADC, true);
    test.equal(pins[6].supports.ADC, true);
    test.equal(pins[7].supports.ADC, true);

    // Pull resistors on 2-7
    test.equal(pins[0].supports.PULL, false);
    test.equal(pins[1].supports.PULL, false);
    test.equal(pins[2].supports.PULL, true);
    test.equal(pins[3].supports.PULL, true);
    test.equal(pins[4].supports.PULL, true);
    test.equal(pins[5].supports.PULL, true);
    test.equal(pins[6].supports.PULL, true);
    test.equal(pins[7].supports.PULL, true);

    // Present Interrupt Mode
    test.equal(pins[0].interruptMode, null);
    test.equal(pins[1].interruptMode, null);
    test.equal(pins[2].interruptMode, null);
    test.equal(pins[3].interruptMode, null);
    test.equal(pins[4].interruptMode, null);
    test.equal(pins[5].interruptMode, null);
    test.equal(pins[6].interruptMode, null);
    test.equal(pins[7].interruptMode, null);

    // isPWM?
    test.equal(pins[0].isPWM, false);
    test.equal(pins[1].isPWM, false);
    test.equal(pins[2].isPWM, false);
    test.equal(pins[3].isPWM, false);
    test.equal(pins[4].isPWM, false);
    test.equal(pins[5].isPWM, false);
    test.equal(pins[6].isPWM, false);
    test.equal(pins[7].isPWM, false);

    test.done();
  },

  interruptErrorMessages(test) {
    test.expect(4);

    const spy = sandbox.spy();

    try {
      this.a.pin[0].once('test', spy);
    } catch (error) {
      test.equal(error.message, 'Invalid pin event mode "test". Valid modes are "change", "rise", "fall", "high" and "low".');
    }

    try {
      this.a.pin[0].once('low', spy);
    } catch (error) {
      test.equal(error.message, 'Interrupts are not supported on pin 0. Pins 2, 5, 6, and 7 on either port support interrupts.');
    }

    try {
      this.a.pin[2].on('low', spy);
    } catch (error) {
      test.equal(error.message, 'Cannot use "on" with level interrupts. You can only use "once".');
    }

    // Set 'change', 'fall' and 'rise' before setting 'low' to verify that it allows these to be set simultaneously.
    // It will fail the test on the error message match if it doesn't allow them to be set simultaneously the way it should
    try {
      this.a.pin[2].on('change', spy);
      this.a.pin[2].on('fall', spy);
      this.a.pin[2].on('rise', spy);
      this.a.pin[2].once('low', spy);
    } catch (error) {
      test.equal(error.message, 'Cannot set pin interrupt mode to "low"; already listening for "change". Can only set multiple listeners with "change", "rise" & "fall".');
    }

    test.done();
  },

  levelInterruptInvalidPin(test) {
    test.expect(16);

    const spy = sandbox.spy();

    [0, 1, 3, 4].forEach(pinIndex => {
      test.throws(() => this.a.pin[pinIndex].once('high', spy));
      test.throws(() => this.a.pin[pinIndex].once('low', spy));
      test.throws(() => this.b.pin[pinIndex].once('high', spy));
      test.throws(() => this.b.pin[pinIndex].once('low', spy));
    });

    test.done();
  },

  interruptRiseInvalidPin(test) {
    test.expect(8);

    const spy = sandbox.spy();

    [0, 1, 3, 4].forEach(pinIndex => {
      test.throws(() => this.a.pin[pinIndex].on('rise', spy));
      test.throws(() => this.b.pin[pinIndex].on('rise', spy));
    });

    test.done();
  },

  interruptFallInvalidPin(test) {
    test.expect(8);

    const spy = sandbox.spy();

    [0, 1, 3, 4].forEach(pinIndex => {
      test.throws(() => this.a.pin[pinIndex].on('fall', spy));
      test.throws(() => this.b.pin[pinIndex].on('fall', spy));
    });

    test.done();
  },

  interruptHigh(test) {
    test.expect(9);

    const spy = sandbox.spy();

    [2, 5, 6, 7].forEach(function(pinIndex) {
      this.a.pin[pinIndex].once('high', spy);
      this.b.pin[pinIndex].once('high', spy);

      test.equal(this.a.pin[pinIndex].interruptMode, 'high');
      test.equal(this.b.pin[pinIndex].interruptMode, 'high');

      // Simulate receipt of pin state changes
      this.a.sock.read.returns(new Buffer([REPLY.ASYNC_PIN_CHANGE_N + pinIndex]));
      this.a.sock.emit('readable');

      this.b.sock.read.returns(new Buffer([REPLY.ASYNC_PIN_CHANGE_N + pinIndex]));
      this.b.sock.emit('readable');
    }, this);

    test.equal(spy.callCount, 8);
    test.done();
  },

  interruptLow(test) {
    test.expect(9);

    const spy = sandbox.spy();

    [2, 5, 6, 7].forEach(function(pinIndex) {
      this.a.pin[pinIndex].once('low', spy);
      this.b.pin[pinIndex].once('low', spy);

      test.equal(this.a.pin[pinIndex].interruptMode, 'low');
      test.equal(this.b.pin[pinIndex].interruptMode, 'low');

      // Simulate receipt of pin state changes
      this.a.sock.read.returns(new Buffer([REPLY.ASYNC_PIN_CHANGE_N + pinIndex]));
      this.a.sock.emit('readable');

      this.b.sock.read.returns(new Buffer([REPLY.ASYNC_PIN_CHANGE_N + pinIndex]));
      this.b.sock.emit('readable');
    }, this);

    test.equal(spy.callCount, 8);
    test.done();
  },

  interruptRise(test) {
    test.expect(9);

    const spy = sandbox.spy();

    [2, 5, 6, 7].forEach(function(pinIndex) {
      this.a.pin[pinIndex].on('rise', spy);
      this.b.pin[pinIndex].on('rise', spy);

      test.equal(this.a.pin[pinIndex].interruptMode, 'change');
      test.equal(this.b.pin[pinIndex].interruptMode, 'change');

      // Simulate receipt of pin state changes
      this.a.sock.read.returns(new Buffer([(REPLY.ASYNC_PIN_CHANGE_N + pinIndex) | (1 << 3)]));
      this.a.sock.emit('readable');

      this.b.sock.read.returns(new Buffer([(REPLY.ASYNC_PIN_CHANGE_N + pinIndex) | (1 << 3)]));
      this.b.sock.emit('readable');
    }, this);

    test.equal(spy.callCount, 8);
    test.done();
  },

  interruptFall(test) {
    test.expect(9);

    const spy = sandbox.spy();

    [2, 5, 6, 7].forEach(function(pinIndex) {
      this.a.pin[pinIndex].on('fall', spy);
      this.b.pin[pinIndex].on('fall', spy);

      test.equal(this.a.pin[pinIndex].interruptMode, 'change');
      test.equal(this.b.pin[pinIndex].interruptMode, 'change');

      // Simulate receipt of pin state changes
      this.a.sock.read.returns(new Buffer([REPLY.ASYNC_PIN_CHANGE_N + pinIndex]));
      this.a.sock.emit('readable');

      this.b.sock.read.returns(new Buffer([REPLY.ASYNC_PIN_CHANGE_N + pinIndex]));
      this.b.sock.emit('readable');
    }, this);

    test.equal(spy.callCount, 8);
    test.done();
  },

  interruptChange(test) {
    test.expect(9);

    const spy = sandbox.spy();

    [2, 5, 6, 7].forEach(function(pinIndex) {
      this.a.pin[pinIndex].on('change', spy);
      this.b.pin[pinIndex].on('change', spy);

      test.equal(this.a.pin[pinIndex].interruptMode, 'change');
      test.equal(this.b.pin[pinIndex].interruptMode, 'change');

      // Simulate receipt of pin state changes
      this.a.sock.read.returns(new Buffer([REPLY.ASYNC_PIN_CHANGE_N + pinIndex]));
      this.a.sock.emit('readable');

      this.b.sock.read.returns(new Buffer([REPLY.ASYNC_PIN_CHANGE_N + pinIndex]));
      this.b.sock.emit('readable');
    }, this);

    test.equal(spy.callCount, 8);
    test.done();
  },

  interruptChangeStateLow(test) {
    test.expect(17);

    const spy = sandbox.spy();

    [2, 5, 6, 7].forEach(function(pinIndex) {
      this.a.pin[pinIndex].on('change', spy);
      this.b.pin[pinIndex].on('change', spy);

      test.equal(this.a.pin[pinIndex].interruptMode, 'change');
      test.equal(this.b.pin[pinIndex].interruptMode, 'change');

      // Simulate receipt of pin state changes
      this.a.sock.read.returns(new Buffer([REPLY.ASYNC_PIN_CHANGE_N + pinIndex]));
      this.a.sock.emit('readable');

      this.b.sock.read.returns(new Buffer([REPLY.ASYNC_PIN_CHANGE_N + pinIndex]));
      this.b.sock.emit('readable');
    }, this);

    test.equal(spy.callCount, 8);

    for (let i = 0; i < 8; i++) {
      test.equal(spy.getCall(i).args[0], 0);
    }

    test.done();
  },

  interruptChangeStateHigh(test) {
    test.expect(17);

    const spy = sandbox.spy();

    [2, 5, 6, 7].forEach(function(pinIndex) {
      this.a.pin[pinIndex].on('change', spy);
      this.b.pin[pinIndex].on('change', spy);

      test.equal(this.a.pin[pinIndex].interruptMode, 'change');
      test.equal(this.b.pin[pinIndex].interruptMode, 'change');

      // Simulate receipt of pin state changes
      this.a.sock.read.returns(new Buffer([(REPLY.ASYNC_PIN_CHANGE_N + pinIndex) | (1 << 3)]));
      this.a.sock.emit('readable');

      this.b.sock.read.returns(new Buffer([(REPLY.ASYNC_PIN_CHANGE_N + pinIndex) | (1 << 3)]));
      this.b.sock.emit('readable');
    }, this);

    test.equal(spy.callCount, 8);

    for (let i = 0; i < 8; i++) {
      test.equal(spy.getCall(i).args[0], 1);
    }

    test.done();
  },

  removeListener(test) {
    test.expect(14);

    const spy = sandbox.spy();
    const spy2 = sandbox.spy();
    [2, 5, 6, 7].forEach(function(pinIndex) {
      this.a.pin[pinIndex].on('change', spy);
      this.a.pin[pinIndex].on('change', spy2);
      test.equal(this.a.pin[pinIndex].interruptMode, 'change');

      this.a.pin[pinIndex].removeListener('change', spy2);
      test.equal(this.a.pin[pinIndex].interruptMode, 'change');

      this.a.pin[pinIndex].removeListener('change', spy);
      test.equal(this.a.pin[pinIndex].interruptMode, null);

      this.a.sock.read.returns(new Buffer([REPLY.ASYNC_PIN_CHANGE_N + pinIndex]));
      this.a.sock.emit('readable');
    }, this);

    test.equal(spy.callCount, 0);
    test.equal(spy2.callCount, 0);
    test.done();
  },

  removeAllListenersByName(test) {
    test.expect(8);

    const spy = sandbox.spy();
    const spy2 = sandbox.spy();
    [2, 5, 6, 7].forEach(pinIndex => {
      this.a.pin[pinIndex].on('change', spy);
      this.a.pin[pinIndex].on('change', spy2);
      test.equal(this.a.pin[pinIndex].listenerCount('change'), 2);

      this.a.pin[pinIndex].removeAllListeners('change');
      test.equal(this.a.pin[pinIndex].listenerCount('change'), 0);
    });
    test.done();
  },

  removeAllListeners(test) {
    test.expect(29);

    const spy = sandbox.spy();
    const spy2 = sandbox.spy();
    let setter = sandbox.spy();

    [2, 5, 6, 7].forEach(pinIndex => {

      let descriptor = Object.getOwnPropertyDescriptor(this.a.pin[pinIndex], 'interruptMode');

      Object.defineProperties(this.a.pin[pinIndex], {
        interruptMode: {
          set(value) {
            setter();
            descriptor.set(value);
          },
        },
      });


      test.equal(this.a.pin[pinIndex].interruptMode, null);
      test.equal(this.a.pin[pinIndex].listenerCount('change'), 0);
      this.a.pin[pinIndex].once('change', spy);
      test.equal(this.a.pin[pinIndex].interruptMode, 'change');

      this.a.pin[pinIndex].once('change', spy2);
      test.equal(this.a.pin[pinIndex].interruptMode, 'change');
      test.equal(this.a.pin[pinIndex].listenerCount('change'), 2);

      this.a.pin[pinIndex].removeAllListeners();
      test.equal(this.a.pin[pinIndex].interruptMode, null);
      test.equal(this.a.pin[pinIndex].listenerCount('change'), 0);
    });

    // 4 pins * 3 calls = 12
    test.equal(setter.callCount, 12);
    test.done();
  },

  interruptNotSupported(test) {
    test.expect(8);

    [0, 1, 3, 4].forEach(pinIndex => {
      test.throws(() => {
        this.a.pin[pinIndex].once('low');
      }, Error);
      test.throws(() => {
        this.b.pin[pinIndex].once('low');
      }, Error);
    });
    test.done();
  },

  validInterruptModes(test) {
    test.expect(10);

    ['high', 'low', 'rise', 'fall', 'change'].forEach(mode => {
      this.a.pin[2].interruptMode = mode;

      test.equal(this.command.callCount, 1);
      test.deepEqual(
        this.command.lastCall.args[0], [CMD.GPIO_INT, 2 | (Tessel.Pin.INT_MODES[mode] << 4)]
      );
      this.command.reset();
    });
    test.done();
  },

  // It should throw an error if an invalid pull mode is provided
  invalidPullParam(test) {
    test.expect(1);

    test.throws(() => {
      this.a.pin[2].pull('invalid');
    }, Error);

    test.done();
  },

  // It should throw an error if a pin is not compatible with pulls
  pullIncompatiblePin(test) {
    test.expect(1);

    test.throws(() => {
      this.a.pin[0].pull('pullup');
    }, Error);

    test.done();
  },

  // It should default to `none` pull if one was not provided
  noModeDefaultNone(test) {
    test.expect(2);
    const pin = 2;
    this.a.pin[pin].pull();

    test.equal(this.command.callCount, 1);

    test.deepEqual(
      this.command.lastCall.args[0], [CMD.GPIO_PULL, pin | (Tessel.Pin.PULL_MODES.none << 4)]
    );

    test.done();
  },

  // It should send the right packets for valid pull modes
  setAllValidModes(test) {
    test.expect(6);
    const pin = 2;
    ['pulldown', 'pullup', 'none', ].forEach(function(pullMode) {
      this.a.pin[pin].pull(pullMode);

      test.equal(this.command.callCount, 1);
      test.deepEqual(
        this.command.lastCall.args[0], [CMD.GPIO_PULL, pin | (Tessel.Pin.PULL_MODES[pullMode] << 4)]
      );
      this.command.reset();
    }, this);
    test.done();
  },

  analogWritePortAndPinRangeError(test) {
    test.expect(16);

    this.a.pin.forEach(pin => {
      test.throws(() => {
        pin.analogWrite(1);
      }, RangeError);
    });

    this.b.pin.slice(0, -1).forEach(pin => {
      test.throws(() => {
        pin.analogWrite(1);
      }, RangeError);
    });

    test.doesNotThrow(() => {
      this.b.pin[7].analogWrite(1);
    });

    test.done();
  },

  analogWriteValueRangeError(test) {
    test.expect(6);

    test.doesNotThrow(() => {
      this.b.pin[7].analogWrite(0);
    }, RangeError);

    test.doesNotThrow(() => {
      this.b.pin[7].analogWrite(1.0);
    }, RangeError);

    test.throws(() => {
      this.b.pin[7].analogWrite(-1);
    }, RangeError);

    test.throws(() => {
      this.b.pin[7].analogWrite(255);
    }, RangeError);

    test.throws(() => {
      this.b.pin[7].analogWrite(3.4);
    }, RangeError);

    test.throws(() => {
      this.b.pin[7].analogWrite(1.1);
    }, RangeError);

    test.done();
  },

  analogReadPortAndPinRangeWarning(test) {
    test.expect(16);

    const cb = () => {};

    this.a.pin.forEach(pin => {
      if (pin.pin === 4 || pin.pin === 7) {
        test.doesNotThrow(() => {
          pin.analogRead(cb);
        }, RangeError);
      } else {
        test.throws(() => {
          pin.analogRead(cb);
        }, RangeError);
      }
    });

    this.b.pin.forEach(pin => {
      test.doesNotThrow(() => {
        pin.analogRead(cb);
      }, RangeError);
    });

    test.done();
  },

  analogReadAsyncWarning(test) {
    test.expect(10);

    test.throws(() => {
      this.a.pin[4].analogRead();
    });

    test.throws(() => {
      this.a.pin[7].analogRead();
    });

    this.b.pin.forEach(pin => {
      test.throws(() => {
        pin.analogRead();
      });
    });

    test.done();
  },

  analogReadReceivesCorrectValuesLower(test) {
    test.expect(1);

    const value = 0;

    this.a.pin[4].analogRead((error, value) => {
      test.equal(value, 0);
      test.done();
    });

    this.a.sock.read.returns(new Buffer([0x84, value & 0xFF, value >> 8]));
    this.a.sock.emit('readable');
  },

  analogReadReceivesCorrectValuesUpper(test) {
    test.expect(1);

    const value = 4096;

    this.a.pin[4].analogRead((error, value) => {

      test.equal(value, 1);
      test.done();
    });

    this.a.sock.read.returns(new Buffer([0x84, value & 0xFF, value >> 8]));
    this.a.sock.emit('readable');
  },

  rawWrite(test) {
    this.a.pin[4].rawWrite(1);
    this.a.pin[4].rawWrite(0);
    test.done();
  },

  toggle(test) {
    test.expect(2);
    const pin = 2;
    this.a.pin[pin].toggle();

    test.equal(this.command.callCount, 1);
    test.deepEqual(this.command.lastCall.args[0], [CMD.GPIO_TOGGLE, pin]);
    test.done();
  },

  output(test) {
    test.expect(2);

    const pin = 2;
    const callback = () => {};

    sandbox.stub(this.a.pin[pin], 'low');
    sandbox.stub(this.a.pin[pin], 'high');


    this.a.pin[pin].output(1, callback);
    test.equal(this.a.pin[pin].high.callCount, 1);

    this.a.pin[pin].output(0, callback);
    test.equal(this.a.pin[pin].low.callCount, 1);

    test.done();
  },

  write(test) {
    test.expect(6);

    const pin = 2;
    const callback = () => {};

    sandbox.stub(this.a.pin[pin], 'output');

    this.a.pin[pin].write(1, callback);
    test.equal(this.a.pin[pin].output.callCount, 1);
    test.equal(this.a.pin[pin].output.lastCall.args[0], 1);
    test.equal(this.a.pin[pin].output.lastCall.args[1], callback);

    this.a.pin[pin].write(0, callback);
    test.equal(this.a.pin[pin].output.callCount, 2);
    test.equal(this.a.pin[pin].output.lastCall.args[0], 0);
    test.equal(this.a.pin[pin].output.lastCall.args[1], callback);

    test.done();
  },

  rawDirection(test) {
    test.expect(1);
    test.throws(() => {
      this.a.pin[2].rawDirection();
    });
    test.done();
  },

  _readPin(test) {
    test.expect(8);
    const pin = 2;
    const callback = sandbox.spy((error, data) => {
      // MUST NOT receive the actual REPLY.HIGH byte.

      if (callback.callCount === 1) {
        test.equal(data, 1);
      }

      if (callback.callCount === 2) {
        test.equal(data, 0);
        test.done();
      }
    });

    sandbox.stub(this.a.pin[pin].port, 'enqueue');

    this.a.pin[pin]._readPin(CMD.GPIO_RAW_READ, callback);

    test.equal(this.a.pin[pin].port.sock.cork.callCount, 1);
    test.equal(this.a.pin[pin].port.sock.uncork.callCount, 1);
    test.equal(this.a.pin[pin].port.sock.write.callCount, 1);
    test.equal(this.a.pin[pin].port.enqueue.callCount, 1);

    test.equal(this.a.pin[pin].port.enqueue.lastCall.args[0].size, 0);
    // Our callback MUST be wrapped for REPLY.HIGH/REPLY.LOW handling

    const queued = this.a.pin[pin].port.enqueue.lastCall.args[0].callback;

    test.notEqual(queued, callback);

    queued(null, REPLY.HIGH);
    queued(null, REPLY.LOW);
  },

  rawRead(test) {
    test.expect(2);

    const pin = 2;
    const callback = () => {};

    sandbox.stub(this.a.pin[pin], '_readPin');

    this.a.pin[pin].rawRead(callback);

    test.equal(this.a.pin[pin]._readPin.lastCall.args[0], CMD.GPIO_RAW_READ);
    test.equal(this.a.pin[pin]._readPin.lastCall.args[1], callback);
    test.done();
  },

  input(test) {
    test.expect(2);

    const pin = 2;
    const callback = () => {};

    this.a.pin[pin].input(callback);

    test.deepEqual(this.command.lastCall.args[0], [CMD.GPIO_INPUT, pin]);
    test.equal(this.command.lastCall.args[1], callback);
    test.done();
  },

  read(test) {
    test.expect(2);
    const callback = () => {};

    sandbox.stub(this.a.pin[2], '_readPin');

    this.a.pin[2].read(callback);

    test.equal(this.a.pin[2]._readPin.lastCall.args[0], CMD.GPIO_IN);
    test.equal(this.a.pin[2]._readPin.lastCall.args[1], callback);
    test.done();
  },

  readIsAsync(test) {
    test.expect(1);
    test.throws(() => {
      this.a.pin[2].read();
    });
    test.done();
  },

  rawReadIsAsync(test) {
    test.expect(1);
    test.throws(() => {
      this.a.pin[2].rawRead();
    });
    test.done();
  },

  pullInvalid(test) {
    test.expect(1);
    test.throws(() => {
      this.a.pin[2].pull('bonkers');
    });
    test.done();
  },

  pullNotSupported(test) {
    test.expect(1);

    test.throws(() => {
      this.a.pin[0].pull();
    });

    test.done();
  },

  readPulse(test) {
    test.expect(1);

    test.throws(() => {
      this.a.pin[4].readPulse();
    });

    test.done();
  },


};

exports['Tessel.I2C'] = {
  setUp(done) {
    this.socket = new FakeSocket();

    this.createConnection = sandbox.stub(net, 'createConnection').callsFake(() => {
      this.socket.cork = sandbox.spy();
      this.socket.uncork = sandbox.spy();
      this.socket.write = sandbox.spy();
      return this.socket;
    });

    this.tessel = new Tessel();

    this.cork = sandbox.stub(Tessel.Port.prototype, 'cork');
    this.uncork = sandbox.stub(Tessel.Port.prototype, 'uncork');
    this.tx = sandbox.stub(Tessel.Port.prototype, 'tx');
    this.rx = sandbox.stub(Tessel.Port.prototype, 'rx');
    this.command = sandbox.stub(Tessel.Port.prototype, 'command');

    this.port = new Tessel.Port('foo', '/foo/bar/baz', this.tessel);

    done();
  },

  tearDown(done) {
    Tessel.instance = null;
    sandbox.restore();
    done();
  },

  shape(test) {
    test.expect(5);

    const device = new Tessel.I2C({
      address: 0x01,
      frequency: 1e5,
      port: this.port,
    });

    test.equal(typeof device.address !== 'undefined', true);
    test.equal(typeof device.addr !== 'undefined', true);
    test.equal(typeof device.baudrate !== 'undefined', true);
    test.equal(typeof device.frequency !== 'undefined', true);
    test.equal(typeof device.port !== 'undefined', true);

    test.done();
  },

  missingAddressArg(test) {
    test.expect(1);

    test.throws(() => {
      new Tessel.I2C({
        port: this.port
      });
    });

    test.done();
  },

  enableOnceOnly(test) {
    test.expect(4);

    test.equal(this.port.I2C.enabled, false);

    new Tessel.I2C({
      address: 0x01,
      port: this.port
    });

    new Tessel.I2C({
      address: 0x01,
      port: this.port
    });

    test.equal(this.port.I2C.enabled, true);
    test.equal(this.command.callCount, 1);
    test.deepEqual(this.command.lastCall.args[0], [CMD.ENABLE_I2C, 234]);

    test.done();
  },

  frequencyStandardMode(test) {
    test.expect(5);

    const device1 = new Tessel.I2C({
      address: 0x04,
      frequency: 1e5,
      port: this.port,
    });
    const device2 = new Tessel.I2C({
      address: 0x04,
      frequency: 1e5,
      port: this.port,
    });

    test.notEqual(device1, device2);

    test.equal(device1.baudrate, 234);
    test.equal(device1.frequency, 100000);

    test.equal(device2.baudrate, 234);
    test.equal(device2.frequency, 100000);
    test.done();
  },

  frequencyFastMode(test) {
    test.expect(5);

    const device1 = new Tessel.I2C({
      address: 0x04,
      frequency: 4e5,
      port: this.port,
    });
    const device2 = new Tessel.I2C({
      address: 0x04,
      frequency: 4e5,
      port: this.port,
    });

    test.notEqual(device1, device2);

    test.equal(device1.baudrate, 54);
    test.equal(device1.frequency, 400000);

    test.equal(device2.baudrate, 54);
    test.equal(device2.frequency, 400000);
    test.done();
  },

  frequencyInvalid(test) {
    test.expect(2);

    test.throws(() => {
      new Tessel.I2C({
        address: 0x04,
        frequency: 4e5 + 1,
        port: this.port,
      });
    }, RangeError);
    test.throws(() => {
      new Tessel.I2C({
        address: 0x04,
        frequency: 1e5 - 1,
        port: this.port,
      });
    }, RangeError);

    test.done();
  },
  explicitFreqChangesBaud(test) {
    test.expect(1);

    this.computeBaud = sandbox.stub(Tessel.I2C, 'computeBaud').callsFake(() => 255);

    new Tessel.I2C({
      address: 0x01,
      frequency: 400000, // 400khz
      mode: undefined,
      port: this.port
    });

    test.deepEqual(this.command.lastCall.args[0], [CMD.ENABLE_I2C, 255]);

    test.done();
  },

  read(test) {
    test.expect(9);

    const device = new Tessel.I2C({
      address: 0x01,
      port: this.port
    });

    const handler = () => {};

    // Avoid including the ENABLE_I2C command in
    // the tested calls below.
    this.command.reset();

    device.read(4, handler);

    test.equal(device.port.cork.callCount, 1);
    test.equal(device.port.command.callCount, 2);
    test.equal(device.port.rx.callCount, 1);
    test.equal(device.port.uncork.callCount, 1);

    test.deepEqual(device.port.rx.firstCall.args[0], 4);
    test.equal(device.port.rx.firstCall.args[1], handler);

    // See:
    // Tessel.I2C.prototype.read
    // this.port.command([CMD.START, this.addr << 1 | 1]);
    //
    test.deepEqual(device.port.command.firstCall.args[0], [CMD.START, device.addr << 1 | 1]);
    test.deepEqual(device.port.command.firstCall.args[0], [CMD.START, device.address << 1 | 1]);
    test.deepEqual(device.port.command.lastCall.args[0], [CMD.STOP]);

    test.done();
  },

  send(test) {
    test.expect(8);

    const device = new Tessel.I2C({
      address: 0x01,
      port: this.port
    });

    // Avoid including the ENABLE_I2C command in
    // the tested calls below.
    this.command.reset();

    device.send([0, 1, 2, 3], () => {});

    test.equal(device.port.cork.callCount, 1);
    test.equal(device.port.command.callCount, 2);
    test.equal(device.port.tx.callCount, 1);
    test.equal(device.port.uncork.callCount, 1);

    test.deepEqual(device.port.tx.firstCall.args[0], [0, 1, 2, 3]);

    // See:
    // Tessel.I2C.prototype.send
    // this.port.command([CMD.START, this.addr << 1]);
    //
    test.deepEqual(device.port.command.firstCall.args[0], [CMD.START, device.addr << 1]);
    test.deepEqual(device.port.command.firstCall.args[0], [CMD.START, device.address << 1]);
    test.deepEqual(device.port.command.lastCall.args[0], [CMD.STOP]);

    test.done();
  },

  transfer(test) {
    test.expect(11);

    const device = new Tessel.I2C({
      address: 0x01,
      port: this.port
    });

    const handler = () => {};

    // Avoid including the ENABLE_I2C command in
    // the tested calls below.
    this.command.reset();

    device.transfer([0, 1, 2, 3], 4, handler);

    test.equal(device.port.cork.callCount, 1);
    test.equal(device.port.command.callCount, 3);
    test.equal(device.port.tx.callCount, 1);
    test.equal(device.port.rx.callCount, 1);
    test.equal(device.port.uncork.callCount, 1);

    test.deepEqual(device.port.tx.firstCall.args[0], [0, 1, 2, 3]);
    test.deepEqual(device.port.rx.firstCall.args[0], 4);
    test.equal(device.port.rx.firstCall.args[1], handler);

    // See:
    // Tessel.I2C.prototype.transfer
    // this.port.command([CMD.START, this.addr << 1]);
    // this.port.command([CMD.START, this.addr << 1 | 1]);
    test.deepEqual(device.port.command.firstCall.args[0], [CMD.START, device.addr << 1]);
    test.deepEqual(device.port.command.secondCall.args[0], [CMD.START, device.addr << 1 | 1]);
    test.deepEqual(device.port.command.lastCall.args[0], [CMD.STOP]);

    test.done();
  },

};

exports['Tessel.I2C.computeBaud'] = {
  enforceBaudRateCalculationAlgorithm(test) {
    test.expect(4);

    test.equal(Tessel.I2C.computeBaud(4e5), 54);
    test.equal(Tessel.I2C.computeBaud(9e4), 255);

    // Max frequency of 400khz
    test.equal(Tessel.I2C.computeBaud(4e5 + 1), 54);

    // Min frequency of 90khz
    test.equal(Tessel.I2C.computeBaud(9e4 - 1), 255);

    test.done();
  },
};

exports['Tessel.UART'] = {
  setUp(done) {
    this.socket = new FakeSocket();

    this.createConnection = sandbox.stub(net, 'createConnection').callsFake(() => {
      this.socket.cork = sandbox.spy();
      this.socket.uncork = sandbox.spy();
      this.socket.write = sandbox.spy();
      return this.socket;
    });

    // Block creation of automatically generated ports
    this.tessel = new Tessel({
      ports: {
        A: false,
        B: false
      }
    });

    this.cork = sandbox.stub(Tessel.Port.prototype, 'cork');
    this.uncork = sandbox.stub(Tessel.Port.prototype, 'uncork');
    this.tx = sandbox.stub(Tessel.Port.prototype, 'tx');
    this.rx = sandbox.stub(Tessel.Port.prototype, 'rx');
    this.command = sandbox.stub(Tessel.Port.prototype, 'command');

    // Explicitly generate our own port
    this.port = new Tessel.Port('foo', '/foo/bar/baz', this.tessel);

    this.uartDisable = sandbox.spy(Tessel.UART.prototype, 'disable');

    done();
  },

  tearDown(done) {
    Tessel.instance = null;
    sandbox.restore();
    done();
  },

  _write(test) {
    test.expect(4);

    const uart = new this.port.UART();
    const data = new Buffer([0xFF]);
    const callback = () => {};
    uart._write(data, null, callback);

    test.equal(this.tx.lastCall.args[0], data);
    test.deepEqual(this.tx.lastCall.args[0], data);
    test.equal(this.tx.lastCall.args[1], callback);

    uart.disable();

    test.throws(() => uart._write(data, null, callback));
    test.done();
  },

  baudrateCmd(test) {
    test.expect(2);

    const b1 = 9600;

    new this.port.UART({
      baudrate: b1
    });

    test.equal(this.command.callCount, 1);
    test.deepEqual(this.command.lastCall.args[0], [14, 255, 46]);
    test.done();
  },

  baudrateSetterCmd(test) {
    test.expect(3);

    const b1 = 9600;

    const uart = new this.port.UART({
      baudrate: b1
    });

    uart.baudrate = 115200;

    test.equal(uart.baudrate, 115200);
    test.equal(this.command.callCount, 2);
    test.deepEqual(this.command.lastCall.args[0], [14, 246, 43]);
    test.done();
  },

  baudrateInvalidLow(test) {
    test.expect(2);

    const b1 = 9600;

    const uart = new this.port.UART({
      baudrate: b1
    });

    test.throws(() => uart.baudrate = 0);
    test.equal(uart.baudrate, b1);

    test.done();
  },

  baudrateInvalidHigh(test) {
    test.expect(2);

    const b1 = 9600;

    const uart = new this.port.UART({
      baudrate: b1
    });

    test.throws(() => uart.baudrate = 230401);
    test.equal(uart.baudrate, b1);

    test.done();
  },

  interfaceChange(test) {
    test.expect(3);

    const b1 = 9600;
    const b2 = 115200;

    let uart = new this.port.UART({
      baudrate: b1
    });

    test.equal(uart.baudrate, b1);

    uart = new this.port.UART({
      baudrate: b2
    });

    test.ok(this.uartDisable.calledOnce, true);

    test.equal(uart.baudrate, b2);

    test.done();
  },

  oneUARTAtATime(test) {
    test.expect(4);

    const u1 = new this.port.UART();

    const u2 = new this.port.UART();

    test.notStrictEqual(u1, u2);

    test.notStrictEqual(this.port.uart, u1);

    test.strictEqual(this.port.uart, u2);

    test.ok(this.uartDisable.calledOnce, true);

    test.done();
  },

  bufferOutput(test) {

    test.expect(2);

    // Create our Tessel port
    const u1 = new this.port.UART();

    // Buffers which we'll emit as mocked incoming UART data
    const payload = new Buffer([0x00, 0x0F, 0xF0, 0xFF]);
    const header = new Buffer([Tessel.REPLY.ASYNC_UART_RX, payload.length]);

    // Only return our test buffer on the first call, otherwise empty buff
    let called = false;
    this.socket.read = () => {
      if (called) {
        return new Buffer([]);
      }
      called = true;

      return Buffer.concat([header, payload]);
    };

    // When data is emitted on the uart peripheral
    u1.once('data', (shouldBeBuf) => {
      // Ensure it is a buffer (not a string)
      test.ok(Buffer.isBuffer(shouldBeBuf));
      // Ensure the payload is what is emitted
      test.deepEqual(shouldBeBuf, payload);
      test.done();
    });

    // Prod the socket to read our buffer
    u1.port.sock.emit('readable');
  },

  bufferOutputIncomplete(test) {
    test.expect(2);

    // Create our Tessel port
    const u1 = new this.port.UART();

    const payload = new Buffer([0x01, 0x02, 0x03, 0x04]);
    const header = new Buffer([Tessel.REPLY.ASYNC_UART_RX, payload.length]);
    let called = false;
    this.socket.read = () => {
      if (called) {
        return payload;
      }
      called = true;
      return header;
    };

    // When data is emitted on the uart peripheral
    u1.once('data', (shouldBeBuf) => {
      test.equal(shouldBeBuf.length, 4);
      test.deepEqual(shouldBeBuf, payload);
      test.done();
    });

    // Prod the socket to read our buffer
    u1.port.sock.emit('readable');
    u1.port.sock.emit('readable');
  },
};

exports['Tessel.SPI'] = {
  setUp(done) {
    this.socket = new FakeSocket();

    this.createConnection = sandbox.stub(net, 'createConnection').callsFake(() => {
      this.socket.cork = sandbox.spy();
      this.socket.uncork = sandbox.spy();
      this.socket.write = sandbox.spy();
      return this.socket;
    });

    this.tessel = new Tessel();

    this.cork = sandbox.stub(Tessel.Port.prototype, 'cork');
    this.uncork = sandbox.stub(Tessel.Port.prototype, 'uncork');
    this.tx = sandbox.stub(Tessel.Port.prototype, 'tx');
    this.rx = sandbox.stub(Tessel.Port.prototype, 'rx');
    this.txrx = sandbox.stub(Tessel.Port.prototype, 'txrx');
    this.command = sandbox.stub(Tessel.Port.prototype, 'command');

    this.port = new Tessel.Port('foo', '/foo/bar/baz', this.tessel);

    this.spiDisable = sandbox.spy(Tessel.SPI.prototype, 'disable');

    done();
  },

  tearDown(done) {
    Tessel.instance = null;
    sandbox.restore();
    done();
  },

  defaultOptionsWhenConstructedViaPort(test) {
    test.expect(6);

    const spi = new this.port.SPI();

    test.equal(spi.chipSelectActive, 0);
    test.equal(spi.clockSpeed, 2000000);
    test.equal(spi._clockReg, 11);
    test.equal(spi._clockDiv, 1);
    test.equal(spi.cpol, 0);
    test.equal(spi.cpha, 0);

    test.done();
  },

  defaultOptionsWhenConstructedDirectly(test) {
    test.expect(6);

    const spi = new Tessel.SPI(null, this.port);

    test.equal(spi.chipSelectActive, 0);
    test.equal(spi.clockSpeed, 2000000);
    test.equal(spi._clockReg, 11);
    test.equal(spi._clockDiv, 1);
    test.equal(spi.cpol, 0);
    test.equal(spi.cpha, 0);

    test.done();
  },

  chipSelectActiveHigh(test) {
    test.expect(6);

    const spi = new Tessel.SPI({
      chipSelectActive: 'high'
    }, this.port);

    test.equal(spi.chipSelectActive, 1);
    test.equal(spi.clockSpeed, 2000000);
    test.equal(spi._clockReg, 11);
    test.equal(spi._clockDiv, 1);
    test.equal(spi.cpol, 0);
    test.equal(spi.cpha, 0);

    test.done();
  },

  chipSelectActive1(test) {
    test.expect(6);

    const spi = new Tessel.SPI({
      chipSelectActive: 1
    }, this.port);

    test.equal(spi.chipSelectActive, 1);
    test.equal(spi.clockSpeed, 2000000);
    test.equal(spi._clockReg, 11);
    test.equal(spi._clockDiv, 1);
    test.equal(spi.cpol, 0);
    test.equal(spi.cpha, 0);

    test.done();
  },

  dataMode1(test) {
    test.expect(5);

    const spi = new Tessel.SPI({
      dataMode: 1
    }, this.port);

    test.equal(spi.clockSpeed, 2000000);
    test.equal(spi._clockReg, 11);
    test.equal(spi._clockDiv, 1);
    test.equal(spi.cpol, 1);
    test.equal(spi.cpha, 0);

    test.done();
  },

  dataMode0(test) {
    test.expect(5);

    const spi = new Tessel.SPI({
      dataMode: 0
    }, this.port);

    test.equal(spi.clockSpeed, 2000000);
    test.equal(spi._clockReg, 11);
    test.equal(spi._clockDiv, 1);
    test.equal(spi.cpol, 0);
    test.equal(spi.cpha, 0);

    test.done();
  },

  cpolHigh(test) {
    test.expect(5);

    const spi = new Tessel.SPI({
      cpol: 'high'
    }, this.port);

    test.equal(spi.clockSpeed, 2000000);
    test.equal(spi._clockReg, 11);
    test.equal(spi._clockDiv, 1);
    test.equal(spi.cpol, 1);
    test.equal(spi.cpha, 0);

    test.done();
  },

  cpol1(test) {
    test.expect(5);

    const spi = new Tessel.SPI({
      cpol: 1
    }, this.port);

    test.equal(spi.clockSpeed, 2000000);
    test.equal(spi._clockReg, 11);
    test.equal(spi._clockDiv, 1);
    test.equal(spi.cpol, 1);
    test.equal(spi.cpha, 0);

    test.done();
  },

  cphaSecond(test) {
    test.expect(5);

    const spi = new Tessel.SPI({
      cpha: 'second'
    }, this.port);

    test.equal(spi.clockSpeed, 2000000);
    test.equal(spi._clockReg, 11);
    test.equal(spi._clockDiv, 1);
    test.equal(spi.cpol, 0);
    test.equal(spi.cpha, 1);

    test.done();
  },

  cpha1(test) {
    test.expect(5);

    const spi = new Tessel.SPI({
      cpha: 1
    }, this.port);

    test.equal(spi.clockSpeed, 2000000);
    test.equal(spi._clockReg, 11);
    test.equal(spi._clockDiv, 1);
    test.equal(spi.cpol, 0);
    test.equal(spi.cpha, 1);

    test.done();
  },

  clockSpeed(test) {
    test.expect(3);

    const spi = new Tessel.SPI({
      clockSpeed: 1e6
    }, this.port);

    test.equal(spi.clockSpeed, 1e6);
    test.equal(spi._clockReg, 23);
    test.equal(spi._clockDiv, 1);
    test.done();
  },

  clockDivUpper(test) {
    test.expect(3);

    const spi = new Tessel.SPI({
      clockSpeed: 24e6
    }, this.port);

    test.equal(spi.clockSpeed, 24e6);
    test.equal(spi._clockReg, 0);
    test.equal(spi._clockDiv, 1);
    test.done();
  },

  clockDivLower(test) {
    test.expect(3);

    const spi = new Tessel.SPI({
      clockSpeed: 368
    }, this.port);

    test.equal(spi.clockSpeed, 368);
    test.equal(spi._clockReg, 255);
    test.equal(spi._clockDiv, 254);
    test.done();
  },

  clockDivFallback(test) {
    test.expect(3);

    const spi = new Tessel.SPI({
      clockSpeed: 92770
    }, this.port);

    test.equal(spi.clockSpeed, 92770);
    test.equal(spi._clockReg, 255);
    test.equal(spi._clockDiv, 1);
    test.done();
  },

  interfaceChange(test) {
    test.expect(3);

    const s1 = 1e6;
    const s2 = 1e4;

    let spi = new this.port.SPI({
      clockSpeed: s1
    });

    test.equal(spi.clockSpeed, s1);

    spi = new this.port.SPI({
      clockSpeed: s2
    });

    test.ok(this.spiDisable.calledOnce, true);

    test.equal(spi.clockSpeed, s2);

    test.done();
  },

  clockSpeedRangeError(test) {
    test.expect(2);

    test.throws(() => {
      new this.port.SPI({
        clockSpeed: 368 - 1
      });
    }, RangeError);

    test.throws(() => {
      new this.port.SPI({
        clockSpeed: 24e6 + 1
      });
    }, RangeError);

    test.done();
  },

  oneSPIAtATime(test) {
    test.expect(4);

    const s1 = new this.port.SPI();

    const s2 = new this.port.SPI();

    test.notStrictEqual(s1, s2);
    test.notStrictEqual(this.port.spi, s1);
    test.strictEqual(this.port.spi, s2);
    test.ok(this.spiDisable.calledOnce, true);
    test.done();
  },

  send(test) {
    test.expect(7);

    const spi = new this.port.SPI({
      chipSelect: {
        low: sandbox.spy(),
        high: sandbox.spy(),
      },
    });

    spi.chipSelect.low.reset();
    spi.chipSelect.high.reset();

    const data = new Buffer([0xFF]);
    const callback = () => {};

    spi.send(data, callback);

    test.equal(this.cork.callCount, 1);
    test.equal(this.uncork.callCount, 1);
    test.equal(this.tx.callCount, 1);
    test.equal(spi.chipSelect.low.callCount, 1);
    test.equal(spi.chipSelect.high.callCount, 1);

    test.equal(this.tx.lastCall.args[0], data);
    test.equal(this.tx.lastCall.args[1], callback);

    test.done();
  },

  receive(test) {
    test.expect(7);

    const spi = new this.port.SPI({
      chipSelect: {
        low: sandbox.spy(),
        high: sandbox.spy(),
      },
    });

    spi.chipSelect.low.reset();
    spi.chipSelect.high.reset();

    const length = 4;
    const callback = () => {};

    spi.receive(length, callback);

    test.equal(this.cork.callCount, 1);
    test.equal(this.uncork.callCount, 1);
    test.equal(this.rx.callCount, 1);
    test.equal(spi.chipSelect.low.callCount, 1);
    test.equal(spi.chipSelect.high.callCount, 1);

    test.equal(this.rx.lastCall.args[0], length);
    test.equal(this.rx.lastCall.args[1], callback);

    test.done();
  },

  transfer(test) {
    test.expect(7);

    const spi = new this.port.SPI({
      chipSelect: {
        low: sandbox.spy(),
        high: sandbox.spy(),
      },
    });

    spi.chipSelect.low.reset();
    spi.chipSelect.high.reset();

    const data = new Buffer([0xFF]);
    const callback = () => {};

    spi.transfer(data, callback);

    test.equal(this.cork.callCount, 1);
    test.equal(this.uncork.callCount, 1);
    test.equal(this.txrx.callCount, 1);
    test.equal(spi.chipSelect.low.callCount, 1);
    test.equal(spi.chipSelect.high.callCount, 1);

    test.equal(this.txrx.lastCall.args[0], data);
    test.equal(this.txrx.lastCall.args[1], callback);

    test.done();
  },
};

exports['Tessel.Wifi'] = {
  setUp(done) {
    this.Port = sandbox.stub(Tessel, 'Port');
    this.fsWrite = sandbox.stub(fs, 'writeFile');
    this.exec = sandbox.stub(cp, 'exec').callsFake((cmd, callback) => {
      callback();
    });
    this.tessel = new Tessel();
    done();
  },

  tearDown(done) {
    Tessel.instance = null;
    sandbox.restore();
    done();
  },

  initialized(test) {
    test.expect(1);

    test.deepEqual(this.tessel.network.wifi.settings, {}, 'no setings by default');

    test.done();
  },

  connect(test) {
    test.expect(4);

    const settings = {
      ssid: 'TestNetwork',
      password: 'TestPassword',
      security: 'wep'
    };
    const ipResult = `wlan0     Link encap:Ethernet  HWaddr 02:A3:AA:A9:FB:02
        inet addr:10.0.1.11  Bcast:192.168.1.101  Mask:255.255.255.0
        inet6 addr: fe80::a3:aaff:fea9:fb02/64 Scope:Link
        UP BROADCAST RUNNING MULTICAST  MTU:1500  Metric:1
        RX packets:2786 errors:0 dropped:0 overruns:0 frame:0
        TX packets:493 errors:0 dropped:0 overruns:0 carrier:0
        collisions:0 txqueuelen:1000
        RX bytes:833626 (814.0 KiB)  TX bytes:97959 (95.6 KiB)`;
    const ip = '10.0.1.11';
    const network = {
      ssid: 'TestNetwork',
      strength: '30/80',
      encryption: {
        enabled: true,
        wep: ['open']
      }
    };

    this.exec.restore();
    this.exec = sandbox.stub(cp, 'exec').callsFake((cmd, callback) => {
      if (cmd === 'ifconfig wlan0') {
        callback(null, ipResult);
      } else if (cmd === `ubus call iwinfo info '{"device":"wlan0"}'`) {
        callback(null, JSON.stringify(network));
      } else {
        callback();
      }
    });

    const results = Object.assign({
      ip
    }, settings, network);
    delete results.password;

    this.tessel.network.wifi.on('connect', (networkSettings) => {
      test.deepEqual(networkSettings, results, 'correct settings');
    });

    this.tessel.network.wifi.connect(settings, (error, networkSettings) => {
      if (error) {
        test.fail(error);
        test.done();
      }

      test.deepEqual(networkSettings, results, 'correct settings');
      test.deepEqual(this.tessel.network.wifi.settings, results, 'correct settings property');
      test.equal(this.exec.callCount, 6, 'exec called correctly');

      test.done();
    });
  },

  connectErrorNoSettings(test) {
    test.expect(1);

    test.throws(this.tessel.network.wifi.connect, 'throws without settings');
    test.done();
  },

  connectErrorNoSSID(test) {
    test.expect(1);

    test.throws(this.tessel.network.wifi.connect.bind({}), 'throws without ssid');
    test.done();
  },

  connectWithoutCallback(test) {
    test.expect(3);

    const settings = {
      ssid: 'TestNetwork',
      password: 'TestPassword',
      security: 'psk'
    };
    const ipResult = `wlan0     Link encap:Ethernet  HWaddr 02:A3:AA:A9:FB:02
        inet addr:10.0.1.11  Bcast:192.168.1.101  Mask:255.255.255.0
        inet6 addr: fe80::a3:aaff:fea9:fb02/64 Scope:Link
        UP BROADCAST RUNNING MULTICAST  MTU:1500  Metric:1
        RX packets:2786 errors:0 dropped:0 overruns:0 frame:0
        TX packets:493 errors:0 dropped:0 overruns:0 carrier:0
        collisions:0 txqueuelen:1000
        RX bytes:833626 (814.0 KiB)  TX bytes:97959 (95.6 KiB)`;
    const ip = '10.0.1.11';
    const network = {
      ssid: 'TestNetwork',
      strength: '30/80',
      encryption: {
        enabled: true,
        wpa: [1],
        authentication: ['psk']
      }
    };

    this.exec.restore();
    this.exec = sandbox.stub(cp, 'exec').callsFake((cmd, callback) => {
      if (cmd === 'ifconfig wlan0') {
        callback(null, ipResult);
      } else if (cmd === `ubus call iwinfo info '{"device":"wlan0"}'`) {
        callback(null, JSON.stringify(network));
      } else {
        callback();
      }
    });

    const results = Object.assign({
      ip
    }, settings, network);
    delete results.password;

    this.tessel.network.wifi.on('connect', (networkSettings) => {
      test.deepEqual(networkSettings, results, 'correct settings');
      test.deepEqual(this.tessel.network.wifi.settings, results, 'correct settings property');
      test.equal(this.exec.callCount, 6, 'exec called correctly');
      test.done();
    });

    this.tessel.network.wifi.on('error', error => {
      test.fail(error);
      test.done();
    });

    this.tessel.network.wifi.connect(settings);
  },

  connectWithoutSecurity(test) {
    test.expect(4);

    const settings = {
      ssid: 'TestNetwork',
      password: 'TestPassword'
    };
    const ipResult = `wlan0     Link encap:Ethernet  HWaddr 02:A3:AA:A9:FB:02
        inet addr:10.0.1.11  Bcast:192.168.1.101  Mask:255.255.255.0
        inet6 addr: fe80::a3:aaff:fea9:fb02/64 Scope:Link
        UP BROADCAST RUNNING MULTICAST  MTU:1500  Metric:1
        RX packets:2786 errors:0 dropped:0 overruns:0 frame:0
        TX packets:493 errors:0 dropped:0 overruns:0 carrier:0
        collisions:0 txqueuelen:1000
        RX bytes:833626 (814.0 KiB)  TX bytes:97959 (95.6 KiB)`;
    const ip = '10.0.1.11';
    const network = {
      ssid: 'TestNetwork',
      strength: '30/80',
      encryption: {
        enabled: true,
        wpa: [2],
        authentication: ['psk']
      }
    };

    this.exec.restore();
    this.exec = sandbox.stub(cp, 'exec').callsFake((cmd, callback) => {
      if (cmd === 'ifconfig wlan0') {
        callback(null, ipResult);
      } else if (cmd === `ubus call iwinfo info '{"device":"wlan0"}'`) {
        callback(null, JSON.stringify(network));
      } else {
        callback();
      }
    });

    const results = Object.assign({
      ip,
      security: 'psk2'
    }, settings, network);
    delete results.password;

    this.tessel.network.wifi.on('connect', (networkSettings) => {
      test.deepEqual(networkSettings, results, 'correct settings');
    });

    this.tessel.network.wifi.connect(settings, (error, networkSettings) => {
      if (error) {
        test.fail(error);
        test.done();
      }

      test.deepEqual(networkSettings, results, 'correct settings');
      test.deepEqual(this.tessel.network.wifi.settings, results, 'correct settings property');
      test.equal(this.exec.callCount, 6, 'exec called correctly');

      test.done();
    });
  },

  connectWithSecurityNone(test) {
    test.expect(4);

    const settings = {
      ssid: 'TestNetwork',
      security: 'none'
    };
    const ipResult = `wlan0     Link encap:Ethernet  HWaddr 02:A3:AA:A9:FB:02
        inet addr:10.0.1.11  Bcast:192.168.1.101  Mask:255.255.255.0
        inet6 addr: fe80::a3:aaff:fea9:fb02/64 Scope:Link
        UP BROADCAST RUNNING MULTICAST  MTU:1500  Metric:1
        RX packets:2786 errors:0 dropped:0 overruns:0 frame:0
        TX packets:493 errors:0 dropped:0 overruns:0 carrier:0
        collisions:0 txqueuelen:1000
        RX bytes:833626 (814.0 KiB)  TX bytes:97959 (95.6 KiB)`;
    const ip = '10.0.1.11';
    const network = {
      ssid: 'TestNetwork',
      strength: '30/80',
      encryption: {
        enabled: false
      }
    };

    this.exec.restore();
    this.exec = sandbox.stub(cp, 'exec').callsFake((cmd, callback) => {
      if (cmd === 'ifconfig wlan0') {
        callback(null, ipResult);
      } else if (cmd === `ubus call iwinfo info '{"device":"wlan0"}'`) {
        callback(null, JSON.stringify(network));
      } else {
        callback();
      }
    });

    const results = Object.assign({
      ip,
      security: 'psk2'
    }, settings, network);
    delete results.password;

    this.tessel.network.wifi.on('connect', (networkSettings) => {
      test.deepEqual(networkSettings, results, 'correct settings');
    });

    this.tessel.network.wifi.connect(settings, (error, networkSettings) => {
      if (error) {
        test.fail(error);
        test.done();
      }

      test.deepEqual(networkSettings, results, 'correct settings');
      test.deepEqual(this.tessel.network.wifi.settings, results, 'correct settings property');
      test.equal(this.exec.callCount, 6, 'exec called correctly');

      test.done();
    });
  },

  connectWithoutPassword(test) {
    test.expect(4);

    const settings = {
      ssid: 'TestNetwork'
    };
    const ipResult = `wlan0     Link encap:Ethernet  HWaddr 02:A3:AA:A9:FB:02
        inet addr:10.0.1.11  Bcast:192.168.1.101  Mask:255.255.255.0
        inet6 addr: fe80::a3:aaff:fea9:fb02/64 Scope:Link
        UP BROADCAST RUNNING MULTICAST  MTU:1500  Metric:1
        RX packets:2786 errors:0 dropped:0 overruns:0 frame:0
        TX packets:493 errors:0 dropped:0 overruns:0 carrier:0
        collisions:0 txqueuelen:1000
        RX bytes:833626 (814.0 KiB)  TX bytes:97959 (95.6 KiB)`;
    const ip = '10.0.1.11';
    const network = {
      ssid: 'TestNetwork',
      strength: '30/80',
      encryption: {
        enabled: false
      }
    };

    this.exec.restore();
    this.exec = sandbox.stub(cp, 'exec').callsFake((cmd, callback) => {
      if (cmd === 'ifconfig wlan0') {
        callback(null, ipResult);
      } else if (cmd === `ubus call iwinfo info '{"device":"wlan0"}'`) {
        callback(null, JSON.stringify(network));
      } else {
        callback();
      }
    });

    const results = Object.assign({
      ip,
      security: 'none'
    }, settings, network);

    this.tessel.network.wifi.on('connect', settings => {
      test.deepEqual(settings, results, 'correct settings');
    });

    this.tessel.network.wifi.connect(settings, (error, settings) => {
      if (error) {
        test.fail(error);
        test.done();
      }

      test.deepEqual(settings, results, 'correct settings');
      test.deepEqual(this.tessel.network.wifi.settings, results, 'correct settings property');
      test.equal(this.exec.callCount, 6, 'exec called correctly');

      test.done();
    });
  },

  connectWithoutPasswordNoEncryption(test) {
    test.expect(4);

    const settings = {
      ssid: 'TestNetwork'
    };
    const ipResult = `wlan0     Link encap:Ethernet  HWaddr 02:A3:AA:A9:FB:02
        inet addr:10.0.1.11  Bcast:192.168.1.101  Mask:255.255.255.0
        inet6 addr: fe80::a3:aaff:fea9:fb02/64 Scope:Link
        UP BROADCAST RUNNING MULTICAST  MTU:1500  Metric:1
        RX packets:2786 errors:0 dropped:0 overruns:0 frame:0
        TX packets:493 errors:0 dropped:0 overruns:0 carrier:0
        collisions:0 txqueuelen:1000
        RX bytes:833626 (814.0 KiB)  TX bytes:97959 (95.6 KiB)`;
    const ip = '10.0.1.11';
    const network = {
      ssid: 'TestNetwork',
      strength: '30/80'
    };

    this.exec.restore();
    this.exec = sandbox.stub(cp, 'exec').callsFake((cmd, callback) => {
      if (cmd === 'ifconfig wlan0') {
        callback(null, ipResult);
      } else if (cmd === `ubus call iwinfo info '{"device":"wlan0"}'`) {
        callback(null, JSON.stringify(network));
      } else {
        callback();
      }
    });

    const results = Object.assign({
      ip,
      security: 'none'
    }, settings, network);

    this.tessel.network.wifi.on('connect', settings => {
      test.deepEqual(settings, results, 'correct settings');
    });

    this.tessel.network.wifi.connect(settings, (error, settings) => {
      if (error) {
        test.fail(error);
        test.done();
      }

      test.deepEqual(settings, results, 'correct settings');
      test.deepEqual(this.tessel.network.wifi.settings, results, 'correct settings property');
      test.equal(this.exec.callCount, 6, 'exec called correctly');

      test.done();
    });
  },

  connectThrowsError(test) {
    test.expect(2);

    const settings = {
      ssid: 'TestNetwork'
    };
    const testError = 'This is a test';

    this.exec.restore();
    this.exec = sandbox.stub(cp, 'exec').callsFake((cmd, callback) => {
      callback(testError);
    });

    this.tessel.network.wifi.on('connect', () => {
      test.fail('should not connect');
      test.done();
    });

    this.tessel.network.wifi.on('error', error => {
      test.equal(error, testError, 'error event fires correctly');
    });

    this.tessel.network.wifi.connect(settings, error => {
      if (error) {
        test.equal(error, testError, 'error should be passed into callback');
        test.done();
      } else {
        test.fail('should not connect');
        test.done();
      }
    });
  },

  connection(test) {
    test.expect(2);

    const settings = {
      ssid: 'TestNetwork'
    };
    const ipResult = `wlan0     Link encap:Ethernet  HWaddr 02:A3:AA:A9:FB:02
        inet addr:10.0.1.11  Bcast:192.168.1.101  Mask:255.255.255.0
        inet6 addr: fe80::a3:aaff:fea9:fb02/64 Scope:Link
        UP BROADCAST RUNNING MULTICAST  MTU:1500  Metric:1
        RX packets:2786 errors:0 dropped:0 overruns:0 frame:0
        TX packets:493 errors:0 dropped:0 overruns:0 carrier:0
        collisions:0 txqueuelen:1000
        RX bytes:833626 (814.0 KiB)  TX bytes:97959 (95.6 KiB)`;
    const ip = '10.0.1.11';
    const network = {
      ssid: 'TestNetwork',
      strength: '30/80',
      encryption: {
        enabled: false
      }
    };
    let isFirstCheck = true;

    this.exec.restore();
    this.exec = sandbox.stub(cp, 'exec').callsFake((cmd, callback) => {
      if (cmd === 'ifconfig wlan0') {
        callback(null, ipResult);
      } else if (cmd === `ubus call iwinfo info '{"device":"wlan0"}'`) {
        callback(null, JSON.stringify(network));
      } else if (cmd === `uci get wireless.@wifi-iface[0].disabled`) {
        if (isFirstCheck) {
          isFirstCheck = false;
          callback(null, 1);
        } else {
          callback(null, 0);
        }
      } else {
        callback();
      }
    });

    const results = Object.assign({
      ip,
      security: 'none'
    }, settings, network);

    this.tessel.network.wifi.connection((error, network) => {
      if (error) {
        test.fail(error);
        test.done();
      }

      test.equal(network, null, 'no settings yet');

      this.tessel.network.wifi.connect(settings, error => {
        if (error) {
          test.fail(error);
          test.done();
        }

        this.tessel.network.wifi.connection((error, network) => {
          test.deepEqual(network, results, 'correct settings');
          test.done();
        });
      });
    });
  },

  connectionEnabledError(test) {
    test.expect(2);

    const testError = new Error('Testing errors');
    this.exec.restore();
    this.exec = sandbox.stub(cp, 'exec').callsFake((cmd, callback) => {
      callback(testError);
    });

    this.tessel.network.wifi.on('error', error => {
      test.equal(error.message, testError.message);
    });

    this.tessel.network.wifi.connection(error => {
      if (error) {
        test.equal(error.message, testError.message);
        test.done();
      } else {
        test.fail('Wifi.connection: Error should be thrown.');
        test.done();
      }
    });
  },

  reset(test) {
    test.expect(2);

    const ipResult = `wlan0     Link encap:Ethernet  HWaddr 02:A3:AA:A9:FB:02
        inet addr:10.0.1.11  Bcast:192.168.1.101  Mask:255.255.255.0
        inet6 addr: fe80::a3:aaff:fea9:fb02/64 Scope:Link
        UP BROADCAST RUNNING MULTICAST  MTU:1500  Metric:1
        RX packets:2786 errors:0 dropped:0 overruns:0 frame:0
        TX packets:493 errors:0 dropped:0 overruns:0 carrier:0
        collisions:0 txqueuelen:1000
        RX bytes:833626 (814.0 KiB)  TX bytes:97959 (95.6 KiB)`;
    const network = {
      ssid: 'TestNetwork',
      strength: '30/80',
      encryption: {
        enabled: false
      }
    };

    this.exec.restore();
    this.exec = sandbox.stub(cp, 'exec').callsFake((cmd, callback) => {
      if (cmd === 'ifconfig wlan0') {
        callback(null, ipResult);
      } else if (cmd === `ubus call iwinfo info '{"device":"wlan0"}'`) {
        callback(null, JSON.stringify(network));
      } else {
        callback();
      }
    });

    this.tessel.network.wifi.on('disconnect', () => test.ok(true, 'disconnect event is fired'));
    this.tessel.network.wifi.on('connect', () => test.ok(true, 'connect event is fired'));

    this.tessel.network.wifi.reset(error => {
      if (error) {
        test.fail(error);
        test.done();
      } else {
        test.done();
      }
    });
  },

  resetErrorCallback(test) {
    test.expect(3);

    const testError = new Error('Testing errors');
    this.exec.restore();
    this.exec = sandbox.stub(cp, 'exec').callsFake((cmd, callback) => {
      callback(testError);
    });

    this.tessel.network.wifi.on('disconnect', () => test.ok(true, 'disconnect event is fired'));

    this.tessel.network.wifi.on('error', error => {
      test.equal(error.message, testError.message);
    });

    this.tessel.network.wifi.reset(error => {
      if (error) {
        test.equal(error.message, testError.message);
        test.done();
      } else {
        test.fail('Wifi.reset: Error should be thrown.');
        test.done();
      }
    });
  },

  disable(test) {
    test.expect(1);

    this.tessel.network.wifi.on('disconnect', () => test.ok(true, 'disconnect event is fired'));

    this.tessel.network.wifi.disable(error => {
      if (error) {
        test.fail(error);
        test.done();
      } else {
        test.done();
      }
    });
  },

  disableErrorCallback(test) {
    test.expect(2);

    const testError = new Error('Testing errors');
    this.exec.restore();
    this.exec = sandbox.stub(cp, 'exec').callsFake((cmd, callback) => {
      callback(testError);
    });

    this.tessel.network.wifi.on('error', error => {
      test.equal(error.message, testError.message);
    });

    this.tessel.network.wifi.disable(error => {
      if (error) {
        test.equal(error.message, testError.message);
        test.done();
      } else {
        test.fail('Wifi.disable: Error should be thrown.');
        test.done();
      }
    });
  },

  disableCommitWirelessError(test) {
    test.expect(2);

    const testError = new Error('Testing errors');
    this.exec.restore();
    this.exec = sandbox.stub(cp, 'exec').callsFake((cmd, callback) => {
      if (cmd === 'uci commit wireless') {
        callback(testError);
      } else {
        callback();
      }
    });

    this.tessel.network.wifi.on('error', error => {
      test.equal(error.message, testError.message);
    });

    this.tessel.network.wifi.disable(error => {
      if (error) {
        test.equal(error.message, testError.message);
        test.done();
      } else {
        test.fail('Wifi.disable: Error should be thrown.');
        test.done();
      }
    });
  },

  enable(test) {
    test.expect(1);

    const ipResult = `wlan0     Link encap:Ethernet  HWaddr 02:A3:AA:A9:FB:02
        inet addr:10.0.1.11  Bcast:192.168.1.101  Mask:255.255.255.0
        inet6 addr: fe80::a3:aaff:fea9:fb02/64 Scope:Link
        UP BROADCAST RUNNING MULTICAST  MTU:1500  Metric:1
        RX packets:2786 errors:0 dropped:0 overruns:0 frame:0
        TX packets:493 errors:0 dropped:0 overruns:0 carrier:0
        collisions:0 txqueuelen:1000
        RX bytes:833626 (814.0 KiB)  TX bytes:97959 (95.6 KiB)`;
    const network = {
      ssid: 'TestNetwork',
      strength: '30/80',
      encryption: {
        enabled: false
      }
    };

    this.exec.restore();
    this.exec = sandbox.stub(cp, 'exec').callsFake((cmd, callback) => {
      if (cmd === 'ifconfig wlan0') {
        callback(null, ipResult);
      } else if (cmd === `ubus call iwinfo info '{"device":"wlan0"}'`) {
        callback(null, JSON.stringify(network));
      } else {
        callback();
      }
    });

    this.tessel.network.wifi.on('connect', () => test.ok(true, 'connect event is fired'));

    this.tessel.network.wifi.enable(error => {
      if (error) {
        test.fail(error);
        test.done();
      } else {
        test.done();
      }
    });
  },

  enableErrorCallback(test) {
    test.expect(2);

    const testError = new Error('Testing errors');
    this.exec.restore();
    this.exec = sandbox.stub(cp, 'exec').callsFake((cmd, callback) => {
      callback(testError);
    });

    this.tessel.network.wifi.on('error', error => {
      test.equal(error.message, testError.message);
    });

    this.tessel.network.wifi.enable(error => {
      if (error) {
        test.equal(error.message, testError.message);
        test.done();
      } else {
        test.fail('Error should be thrown.');
        test.done();
      }
    });
  },

  enableRejectGetWifiInfo(test) {
    test.expect(2);

    const network = {
      ssid: 'TestNetwork',
      strength: '30/80',
      encryption: {
        enabled: false
      }
    };

    this.exec.restore();
    this.exec = sandbox.stub(cp, 'exec').callsFake((cmd, callback) => {
      if (cmd === `ubus call iwinfo info '{"device":"wlan0"}'`) {
        callback(null, network);
      } else {
        callback();
      }
    });

    this.tessel.network.wifi.on('error', error => {
      test.ok(error);
    });

    this.tessel.network.wifi.enable(error => {
      if (error) {
        test.ok(error);
        test.done();
      } else {
        test.fail(error);
        test.done();
      }
    });
  },

  enableRecursiveGetWifiInfo(test) {
    test.expect(2);

    let recursiveCheckCount = 0;
    const ipResult = `wlan0     Link encap:Ethernet  HWaddr 02:A3:AA:A9:FB:02
        inet addr:10.0.1.11  Bcast:192.168.1.101  Mask:255.255.255.0
        inet6 addr: fe80::a3:aaff:fea9:fb02/64 Scope:Link
        UP BROADCAST RUNNING MULTICAST  MTU:1500  Metric:1
        RX packets:2786 errors:0 dropped:0 overruns:0 frame:0
        TX packets:493 errors:0 dropped:0 overruns:0 carrier:0
        collisions:0 txqueuelen:1000
        RX bytes:833626 (814.0 KiB)  TX bytes:97959 (95.6 KiB)`;
    const network = {
      ssid: 'TestNetwork',
      strength: '30/80',
      encryption: {
        enabled: false
      }
    };

    this.exec.restore();
    this.exec = sandbox.stub(cp, 'exec').callsFake((cmd, callback) => {
      if (cmd === 'ifconfig wlan0') {
        callback(null, ipResult);
      } else if (cmd === `ubus call iwinfo info '{"device":"wlan0"}'`) {
        switch (recursiveCheckCount) {
          case 0:
            recursiveCheckCount++;
            callback(new Error('Recursive check'));
            break;
          case 1:
            recursiveCheckCount++;
            callback(null, JSON.stringify({}));
            break;
          default:
            callback(null, JSON.stringify(network));
            break;
        }
      } else {
        callback();
      }
    });

    this.tessel.network.wifi.on('connect', () => test.ok(true, 'connect event is fired'));

    this.tessel.network.wifi.enable(error => {
      if (error) {
        test.fail(error);
        test.done();
      } else {
        test.equal(recursiveCheckCount, 2);
        test.done();
      }
    });
  },

  enableRecursiveGetWifiInfoError(test) {
    test.expect(3);

    let recursiveCheckCount = 0;

    this.exec.restore();
    this.exec = sandbox.stub(cp, 'exec').callsFake((cmd, callback) => {
      if (cmd === `ubus call iwinfo info '{"device":"wlan0"}'`) {
        recursiveCheckCount++;
        callback(null, JSON.stringify({}));
      } else {
        callback();
      }
    });

    this.tessel.network.wifi.on('error', error => {
      test.ok(error);
    });

    this.tessel.network.wifi.enable(error => {
      if (error) {
        test.equal(recursiveCheckCount, 7);
        test.ok(error);
        test.done();
      } else {
        test.fail(error);
        test.done();
      }
    });
  },

  enableRecursiveIP(test) {
    test.expect(2);

    let recursiveCheckCount = 0;
    const emptyResult = `wlan0     Link encap:Ethernet  HWaddr 02:A3:AA:A9:FB:02
        inet addr: Bcast:192.168.1.101  Mask:255.255.255.0`;
    const ipResult = `wlan0     Link encap:Ethernet  HWaddr 02:A3:AA:A9:FB:02
        inet addr:10.0.1.11  Bcast:192.168.1.101  Mask:255.255.255.0
        inet6 addr: fe80::a3:aaff:fea9:fb02/64 Scope:Link
        UP BROADCAST RUNNING MULTICAST  MTU:1500  Metric:1
        RX packets:2786 errors:0 dropped:0 overruns:0 frame:0
        TX packets:493 errors:0 dropped:0 overruns:0 carrier:0
        collisions:0 txqueuelen:1000
        RX bytes:833626 (814.0 KiB)  TX bytes:97959 (95.6 KiB)`;
    const network = {
      ssid: 'TestNetwork',
      strength: '30/80',
      encryption: {
        enabled: false
      }
    };

    this.exec.restore();
    this.exec = sandbox.stub(cp, 'exec').callsFake((cmd, callback) => {
      if (cmd === 'ifconfig wlan0') {
        switch (recursiveCheckCount) {
          case 0:
            recursiveCheckCount++;
            callback(null, '');
            break;
          case 1:
            recursiveCheckCount++;
            callback(null, emptyResult);
            break;
          default:
            callback(null, ipResult);
            break;
        }
      } else if (cmd === `ubus call iwinfo info '{"device":"wlan0"}'`) {
        callback(null, JSON.stringify(network));
      } else {
        callback();
      }
    });

    this.tessel.network.wifi.on('connect', () => test.ok(true, 'connect event is fired'));

    this.tessel.network.wifi.enable(error => {
      if (error) {
        test.fail(error);
        test.done();
      } else {
        test.equal(recursiveCheckCount, 2);
        test.done();
      }
    });
  },

  enableRejectRecursiveIP(test) {
    test.expect(2);

    const network = {
      ssid: 'TestNetwork',
      strength: '30/80',
      encryption: {
        enabled: false
      }
    };
    const testError = new Error('Testing the recursiveIP function.');

    this.exec.restore();
    this.exec = sandbox.stub(cp, 'exec').callsFake((cmd, callback) => {
      if (cmd === 'ifconfig wlan0') {
        callback(testError);
      } else if (cmd === `ubus call iwinfo info '{"device":"wlan0"}'`) {
        callback(null, JSON.stringify(network));
      } else {
        callback();
      }
    });

    this.tessel.network.wifi.on('error', error => {
      test.ok(error);
    });

    this.tessel.network.wifi.enable(error => {
      if (error) {
        test.ok(error);
        test.done();
      } else {
        test.fail(error);
        test.done();
      }
    });
  },

  findAvailableNetworks(test) {
    test.expect(3);

    const networks =
      `Cell 01 - Address: 14:35:8B:11:30:F0
              ESSID: "technicallyHome"
              Mode: Master  Channel: 11
              Signal: -55 dBm  Quality: 55/70
              Encryption: WPA PSK (TKIP, CCMP)

    Cell 02 - Address: 6C:70:9F:D9:7A:5C
              ESSID: "Fried Chicken Sandwich"
              Mode: Master  Channel: 2
              Signal: -51 dBm  Quality: 59/70
              Encryption: WPA2 PSK (CCMP)

    Cell 03 - Address: 6C:70:9F:D9:7A:5C
              ESSID: "Another SSID"
              Mode: Master  Channel: 2
              Signal: -49 dBm  Quality: 55/70
              Encryption: WEP (CCMP)

`;
    let firstCheck = true;

    this.exec.restore();
    this.exec = sandbox.stub(cp, 'exec').callsFake((cmd, callback) => {
      if (cmd === 'iwinfo wlan0 scan') {
        if (firstCheck) {
          firstCheck = false;
          callback(new Error('recursive error'));
        } else {
          callback(null, networks);
        }
      } else {
        callback();
      }
    });

    this.tessel.network.wifi.findAvailableNetworks((error, found) => {
      test.equal(found.length, 3);
      test.equal(found[0].ssid, 'Fried Chicken Sandwich');
      test.equal(found[0].security, 'psk2');
      test.done();
    });
  },

  findAvailableNetworksNotEnabled(test) {
    test.expect(3);

    const networks =
      `Cell 01 - Address: 14:35:8B:11:30:F0
              ESSID: "technicallyHome"
              Mode: Master  Channel: 11
              Signal: -55 dBm  Quality: 59/70
              Encryption: WPA PSK (TKIP, CCMP)

    Cell 02 - Address: 6C:70:9F:D9:7A:5C
              ESSID: "Fried Chicken Sandwich"
              Mode: Master  Channel: 2
              Signal: -51 dBm  Quality: 55/70
              Encryption: WPA2 PSK (CCMP)

`;

    this.exec.restore();
    this.exec = sandbox.stub(cp, 'exec').callsFake((cmd, callback) => {
      if (cmd === 'iwinfo wlan0 scan') {
        callback(null, networks);
      } else if (cmd === `uci get wireless.@wifi-iface[0].disabled`) {
        callback(null, 1);
      } else if (cmd === `uci get wireless.@wifi-iface[1].disabled`) {
        callback(null, 1);
      } else {
        callback();
      }
    });

    this.tessel.network.wifi.findAvailableNetworks((error, found) => {
      test.equal(found.length, 2);
      test.equal(found[0].ssid, 'technicallyHome');
      test.equal(found[0].security, 'psk');
      test.done();
    });
  },

  findAvailableNetworksErrorCallback(test) {
    test.expect(2);

    const testError = new Error('Testing errors');
    this.exec.restore();
    this.exec = sandbox.stub(cp, 'exec').callsFake((cmd, callback) => {
      callback(testError);
    });

    this.tessel.network.wifi.on('error', error => {
      test.equal(error.message, testError.message);
    });

    this.tessel.network.wifi.findAvailableNetworks(error => {
      if (error) {
        test.equal(error.message, testError.message);
        test.done();
      } else {
        test.fail('Error should be thrown.');
        test.done();
      }
    });
  },

  findNoNetworks(test) {
    test.expect(1);

    const networks = '';

    this.exec.restore();
    this.exec = sandbox.stub(cp, 'exec').callsFake((cmd, callback) => {
      if (cmd === 'iwinfo wlan0 scan') {
        callback(null, networks);
      } else {
        callback();
      }
    });

    this.tessel.network.wifi.findAvailableNetworks((error, found) => {
      test.equal(found.length, 0);
      test.done();
    });
  },

  findNetworksSafe(test) {
    test.expect(7);

    const networks = `Cell 01 - Address: 14:35:8B:11:30:F0
              ESSID: "worst"
              Mode: Master  Channel: 11
              Signal: -55 dBm  Quality: 30/
              Encryption: WPA PSK (TKIP, CCMP)

    Cell 02 - Address: 6C:70:9F:D9:7A:5C
              ESSID: "middle"
              Mode: Master  Channel: 2
              Signal: -57 dBm  Quality: 5/70
              Encryption: WPA2 PSK (CCMP)

    Cell 03 - Address: 6C:70:9F:D9:7A:5C
            ESSID: "best"
            Mode: Master  Channel: 2
            Signal: -57 dBm  Quality: 100
            Encryption: WPA2 PSK (CCMP)

`;
    // Do not remove the blank line at the end of preceding string!!

    this.exec.restore();
    this.exec = sandbox.stub(cp, 'exec').callsFake((cmd, callback) => {
      if (cmd === 'iwinfo wlan0 scan') {
        callback(null, networks);
      } else {
        callback();
      }
    });

    this.tessel.network.wifi.findAvailableNetworks((error, found) => {
      test.equal(found.length, 3);
      test.equal(found[0].ssid, 'best');
      test.equal(found[1].ssid, 'middle');
      test.equal(found[2].ssid, 'worst');

      test.equal(found[0].quality, '100');
      test.equal(found[1].quality, '5/70');
      test.equal(found[2].quality, '30/');
      test.done();
    });
  }
};

exports['Tessel.port.pwm'] = {
  setUp(done) {
    this.socket = new FakeSocket();

    this.createConnection = sandbox.stub(net, 'createConnection').callsFake(() => {
      this.socket.cork = sandbox.spy();
      this.socket.uncork = sandbox.spy();
      this.socket.write = sandbox.spy();
      return this.socket;
    });

    this.tessel = new Tessel();
    done();
  },

  tearDown(done) {
    Tessel.instance = null;
    sandbox.restore();
    done();
  },

  pwmArray(test) {
    test.expect(26);

    test.equal(this.tessel.port.A.pwm.length, 2);
    test.equal(this.tessel.port.A.pwm[0], this.tessel.port.A.digital[0]);
    test.ok(this.tessel.port.A.digital[0].supports.PWM);
    test.equal(this.tessel.port.A.pwm[1], this.tessel.port.A.digital[1]);
    test.ok(this.tessel.port.A.digital[1].supports.PWM);
    test.equal(this.tessel.port.B.pwm.length, 2);
    test.equal(this.tessel.port.B.pwm[0], this.tessel.port.B.digital[0]);
    test.ok(this.tessel.port.B.digital[0].supports.PWM);
    test.equal(this.tessel.port.B.pwm[1], this.tessel.port.B.digital[1]);
    test.ok(this.tessel.port.B.digital[1].supports.PWM);

    test.equal(this.tessel.port.A.pin[0].supports.PWM, false);
    test.equal(this.tessel.port.A.pin[1].supports.PWM, false);
    test.equal(this.tessel.port.A.pin[2].supports.PWM, false);
    test.equal(this.tessel.port.A.pin[3].supports.PWM, false);
    test.equal(this.tessel.port.A.pin[4].supports.PWM, false);
    test.equal(this.tessel.port.A.pin[5].supports.PWM, true);
    test.equal(this.tessel.port.A.pin[6].supports.PWM, true);
    test.equal(this.tessel.port.A.pin[7].supports.PWM, false);

    test.equal(this.tessel.port.B.pin[0].supports.PWM, false);
    test.equal(this.tessel.port.B.pin[1].supports.PWM, false);
    test.equal(this.tessel.port.B.pin[2].supports.PWM, false);
    test.equal(this.tessel.port.B.pin[3].supports.PWM, false);
    test.equal(this.tessel.port.B.pin[4].supports.PWM, false);
    test.equal(this.tessel.port.B.pin[5].supports.PWM, true);
    test.equal(this.tessel.port.B.pin[6].supports.PWM, true);
    test.equal(this.tessel.port.B.pin[7].supports.PWM, false);
    test.done();
  }
};

exports['determineDutyCycleAndPrescalar'] = {
  setUp(done) {
    done();
  },
  tearDown(done) {
    done();
  },
  onekHz(test) {
    test.expect(2);

    const frequency = 1000;
    const expectedPrescalar = 1;
    const results = Tessel.determineDutyCycleAndPrescalar(frequency);
    test.equal(results.period, 48000000 / frequency);
    test.equal(results.prescalarIndex, Tessel.pwmPrescalars.indexOf(expectedPrescalar));
    test.done();
  },
  oneHundredHz(test) {
    test.expect(2);

    const frequency = 100;
    const expectedPrescalar = 8;
    const results = Tessel.determineDutyCycleAndPrescalar(frequency);
    test.equal(results.period, 48000000 / frequency / expectedPrescalar);
    test.equal(results.prescalarIndex, Tessel.pwmPrescalars.indexOf(expectedPrescalar));
    test.done();
  },
  oneHz(test) {
    test.expect(2);

    const frequency = 1;
    const expectedPrescalar = 1024;
    const results = Tessel.determineDutyCycleAndPrescalar(frequency);
    test.equal(results.period, 48000000 / frequency / expectedPrescalar);
    test.equal(results.prescalarIndex, Tessel.pwmPrescalars.indexOf(expectedPrescalar));
    test.done();
  },
  frequencyTooLow(test) {
    test.expect(1);
    const frequency = 0.1;
    try {
      Tessel.determineDutyCycleAndPrescalar(frequency);
    } catch (err) {
      test.ok(err);
    }

    test.done();
  }
};

exports['tessel.pwmFrequency'] = {
  setUp(done) {
    this.socket = new FakeSocket();

    this.createConnection = sandbox.stub(net, 'createConnection').callsFake(() => {
      this.socket.cork = sandbox.spy();
      this.socket.uncork = sandbox.spy();
      this.socket.write = sandbox.spy();
      return this.socket;
    });

    this.tessel = new Tessel();

    this.cork = sandbox.stub(Tessel.Port.prototype, 'cork');
    this.uncork = sandbox.stub(Tessel.Port.prototype, 'uncork');
    this.tx = sandbox.stub(Tessel.Port.prototype, 'tx');
    this.rx = sandbox.stub(Tessel.Port.prototype, 'rx');
    this.command = sandbox.stub(Tessel.Port.prototype, 'command');

    this.port = new Tessel.Port('foo', '/foo/bar/baz', this.tessel);

    this.pwmFrequency = sandbox.spy(Tessel.prototype, 'pwmFrequency');

    done();
  },

  tearDown(done) {
    Tessel.instance = null;
    sandbox.restore();
    done();
  },
  // Should throw an error if the frequency is outside the specified range
  frequencyTooLow(test) {
    test.expect(2);
    const frequency = Tessel.pwmMinFrequency / 2;

    // test.throws is not handling the thrown error for whatever reason
    try {
      // Attempt to set the frequency
      this.tessel.pwmFrequency(frequency);
    } catch (err) {
      // Ensure an error was thrown
      test.ok(err);
      test.ok(err instanceof RangeError);
      test.done();
    }
  },
  // Should throw an error if the frequency is outside the specified range
  frequencyTooHigh(test) {
    test.expect(2);
    const frequency = Tessel.pwmMaxFrequency + 1;

    // test.throws is not handling the thrown error for whatever reason
    try {
      // Attempt to set the frequency
      this.tessel.pwmFrequency(frequency);
    } catch (err) {
      // Ensure an error was thrown
      test.ok(err);
      test.ok(err instanceof RangeError);
      test.done();
    }
  },

  testPacketStructure(test) {
    const frequency = 100;
    this.tessel.pwmFrequency(frequency, (err) => {
      // Ensure no error was thrown
      test.ifError(err);
      // Finish the test
      test.done();
    });

    const results = Tessel.determineDutyCycleAndPrescalar(frequency);

    test.equal(this.socket.write.callCount, 1);
    const packet = this.socket.write.lastCall.args[0];
    const cb = this.socket.write.lastCall.args[1];
    // Ensure the callback was provided
    test.ok(typeof cb === 'function');
    // Ensure four bytes were passed
    test.ok(packet.length === 4);
    // Ensure the first packet is the PWM period
    test.ok(packet[0] === CMD.PWM_PERIOD);
    // Next four bits are TCC ID (always zero)
    test.ok((packet[1] & 0x7) === 0);
    // Next four bits are prescalar
    test.ok((packet[1] >> 4) === results.prescalarIndex);
    // Final two bits are period
    test.ok((packet[2] << 8) + packet[3] === results.period);
    // Call our callback
    cb();
  }
};

exports['pin.pwmDutyCycle'] = {
  setUp(done) {
    this.socket = new FakeSocket();

    this.createConnection = sandbox.stub(net, 'createConnection').callsFake(() => {
      this.socket.cork = sandbox.spy();
      this.socket.uncork = sandbox.spy();
      this.socket.write = sandbox.spy();
      return this.socket;
    });

    this.tessel = new Tessel();

    this.cork = sandbox.stub(Tessel.Port.prototype, 'cork');
    this.uncork = sandbox.stub(Tessel.Port.prototype, 'uncork');
    this.tx = sandbox.stub(Tessel.Port.prototype, 'tx');
    this.rx = sandbox.stub(Tessel.Port.prototype, 'rx');
    this.command = sandbox.stub(Tessel.Port.prototype, 'command');

    this.port = new Tessel.Port('foo', '/foo/bar/baz', this.tessel);

    this.pwmFrequency = sandbox.spy(Tessel.prototype, 'pwmFrequency');

    done();
  },

  tearDown(done) {
    Tessel.instance = null;
    sandbox.restore();
    done();
  },

  throwsWhenNotSupportedPin(test) {
    test.expect(2);

    // test.throws is not handling the thrown error for whatever reason
    try {
      // Attempt to set the duty cycle
      this.tessel.port.A.digital[2].pwmDutyCycle(1);
    } catch (error) {
      // Ensure an error was thrown
      test.ok(error);
      test.ok(error instanceof RangeError);
      test.done();
    }
  },
  throwsWhenDutyCycleNotNumber(test) {
    test.expect(2);

    // test.throws is not handling the thrown error for whatever reason
    try {
      // Attempt to set the duty cycle
      this.tessel.port.A.pwm[0].pwmDutyCycle('five');
    } catch (error) {
      // Ensure an error was thrown
      test.ok(error);
      test.ok(error instanceof RangeError);
      test.done();
    }
  },
  throwsWhenDutyCycleTooHigh(test) {
    test.expect(2);

    // test.throws is not handling the thrown error for whatever reason
    try {
      // Attempt to set the duty cycle
      this.tessel.port.A.pwm[0].pwmDutyCycle(1.5);
    } catch (error) {
      // Ensure an error was thrown
      test.ok(error);
      test.ok(error instanceof RangeError);
      test.done();
    }
  },
  throwsWhenDutyCycleTooLow(test) {
    test.expect(2);

    // test.throws is not handling the thrown error for whatever reason
    try {
      // Attempt to set the duty cycle
      this.tessel.port.A.pwm[0].pwmDutyCycle(-0.5);
    } catch (error) {
      // Ensure an error was thrown
      test.ok(error);
      test.ok(error instanceof RangeError);
      test.done();
    }
  },
  throwsWhenPeriodNotSet(test) {
    test.expect(2);

    // test.throws is not handling the thrown error for whatever reason
    try {
      // Reset the pwmPeriod
      Tessel.pwmBankSettings.period = 0;
      // Attempt to set the duty cycle
      this.tessel.port.A.pwm[0].pwmDutyCycle(0.5);
    } catch (error) {
      // Ensure an error was thrown
      test.ok(error);
      test.ok(error.toString().includes('Frequency is not configured'));
      test.done();
    }
  },
  standardUsageSucceeds(test) {
    // Set some arbitrary non-zero period
    Tessel.pwmBankSettings.period = 10000;
    // Set some valid duty cycle value
    const dutyCycle = 0.5;
    const pin = this.tessel.port.A.pwm[0];
    pin.pwmDutyCycle(dutyCycle, error => {
      // Ensure no error was thrown
      test.ifError(error);
      // Finish the test
      test.done();
    });

    test.equal(this.socket.write.callCount, 1);
    const packet = this.socket.write.lastCall.args[0];
    const cb = this.socket.write.lastCall.args[1];
    // Ensure the callback was provided
    test.ok(typeof cb === 'function');
    // Ensure four bytes were passed
    test.ok(packet.length === 4);
    // Ensure the first packet is the PWM duty cycle command
    test.ok(packet[0] === CMD.PWM_DUTY_CYCLE);
    // Next byte is the pin ID
    test.ok(packet[1] === pin.pin);
    // Next two bytes are the duty cycle converted to ticks
    test.ok((packet[2] << 8) + packet[3] === dutyCycle * Tessel.pwmBankSettings.period);
    // Call our callback
    cb();
  }
};

exports['Tessel.AP'] = {
  setUp(done) {
    this.Port = sandbox.stub(Tessel, 'Port');
    this.fsWrite = sandbox.stub(fs, 'writeFile');
    this.exec = sandbox.stub(cp, 'exec').callsFake((cmd, callback) => {
      callback();
    });
    this.tessel = new Tessel();
    done();
  },

  tearDown(done) {
    Tessel.instance = null;
    sandbox.restore();
    done();
  },

  initialized(test) {
    test.expect(1);
    test.deepEqual(this.tessel.network.ap.settings, {}, 'no setings by default');
    test.done();
  },

  assignSettingsDirectly(test) {
    test.expect(1);

    this.tessel.network.ap.settings = {
      foo: 1
    };

    test.deepEqual(this.tessel.network.ap.settings, {
      foo: 1
    });
    test.done();
  },

  create(test) {
    test.expect(4);

    const settings = {
      ssid: 'TestNetwork',
      password: 'TestPassword',
      security: 'psk2'
    };
    const ip = '192.168.1.101';

    this.exec.restore();
    this.exec = sandbox.stub(cp, 'exec').callsFake((cmd, callback) => {
      if (cmd === 'uci get network.lan.ipaddr') {
        callback(null, ip);
      } else {
        callback();
      }
    });

    const results = Object.assign({
      ip
    }, settings);

    this.tessel.network.ap.on('create', (networkSettings) => {
      test.deepEqual(networkSettings, results, 'correct settings');
    });

    this.tessel.network.ap.create(settings, (error, apSettings) => {
      if (error) {
        test.fail(error);
        test.done();
      }

      test.deepEqual(apSettings, results, 'correct settings');
      test.deepEqual(this.tessel.network.ap.settings, results, 'correct settings property');
      test.equal(this.exec.callCount, 5, 'exec called correctly');

      test.done();
    });
  },

  createErrorNoSettings(test) {
    test.expect(1);
    test.throws(this.tessel.network.ap.create, 'throws without settings');
    test.done();
  },

  createErrorNoSSID(test) {
    test.expect(1);
    test.throws(this.tessel.network.ap.create.bind({}), 'throws without ssid');
    test.done();
  },

  createWithoutCallback(test) {
    test.expect(3);

    const settings = {
      ssid: 'TestNetwork',
      password: 'TestPassword',
      security: 'psk2'
    };
    const ip = '192.168.1.101';

    this.exec.restore();
    this.exec = sandbox.stub(cp, 'exec').callsFake((cmd, callback) => {
      if (cmd === 'uci get network.lan.ipaddr') {
        callback(null, ip);
      } else {
        callback();
      }
    });

    const results = Object.assign({
      ip
    }, settings);

    this.tessel.network.ap.on('create', (networkSettings) => {
      test.deepEqual(networkSettings, results, 'correct settings');
      test.deepEqual(this.tessel.network.ap.settings, results, 'correct settings property');
      test.equal(this.exec.callCount, 5, 'exec called correctly');
      test.done();
    });

    this.tessel.network.ap.on('error', error => {
      test.fail(error);
      test.done();
    });

    this.tessel.network.ap.create(settings);
  },

  createWithoutSecurity(test) {
    test.expect(4);

    const settings = {
      ssid: 'TestNetwork',
      password: 'TestPassword'
    };
    const ip = '192.168.1.101';
    const security = 'psk2';

    this.exec.restore();
    this.exec = sandbox.stub(cp, 'exec').callsFake((cmd, callback) => {
      if (cmd === 'uci get network.lan.ipaddr') {
        callback(null, ip);
      } else {
        callback();
      }
    });

    const results = Object.assign({
      ip,
      security,
    }, settings);

    this.tessel.network.ap.on('create', (networkSettings) => {
      test.deepEqual(networkSettings, results, 'correct settings');
    });

    this.tessel.network.ap.create(settings, (error, networkSettings) => {
      if (error) {
        test.fail(error);
        test.done();
      }

      test.deepEqual(networkSettings, results, 'correct settings');
      test.deepEqual(this.tessel.network.ap.settings, results, 'correct settings property');
      test.equal(this.exec.callCount, 5, 'exec called correctly');

      test.done();
    });
  },

  createWithoutPassword(test) {
    test.expect(4);

    const ip = '192.168.1.101';
    const ssid = 'TestNetwork';
    const password = '';
    const security = 'none';
    const settings = {
      ssid,
      security,
    };

    this.exec.restore();
    this.exec = sandbox.stub(cp, 'exec').callsFake((cmd, callback) => {
      if (cmd === 'uci get network.lan.ipaddr') {
        callback(null, ip);
      } else {
        callback();
      }
    });

    const results = Object.assign({
      ip,
      password,
      security,
    }, settings);

    this.tessel.network.ap.on('create', (networkSettings) => {
      test.deepEqual(networkSettings, results, 'correct settings');
    });

    this.tessel.network.ap.create(settings, (error, networkSettings) => {
      if (error) {
        test.fail(error);
        test.done();
      }

      test.deepEqual(networkSettings, results, 'correct settings');
      test.deepEqual(this.tessel.network.ap.settings, results, 'correct settings property');
      test.equal(this.exec.callCount, 5, 'exec called correctly');

      test.done();
    });
  },

  createThrowsError(test) {
    test.expect(2);

    const settings = {
      ssid: 'TestNetwork'
    };
    const testError = 'This is a test';

    this.exec.restore();
    this.exec = sandbox.stub(cp, 'exec').callsFake((cmd, callback) => {
      callback(testError);
    });

    this.tessel.network.ap.on('create', () => {
      test.fail('should not connect');
      test.done();
    });

    this.tessel.network.ap.on('error', error => {
      test.equal(error, testError, 'error event fires correctly');
    });

    this.tessel.network.ap.create(settings, error => {
      if (error) {
        test.equal(error, testError, 'error should be passed into callback');
        test.done();
      } else {
        test.fail('should not connect');
        test.done();
      }
    });
  },

  createGetAccessPointIPThrowsError(test) {
    test.expect(2);

    const settings = {
      ssid: 'TestNetwork'
    };
    const testError = 'This is a test';

    this.exec.restore();
    this.exec = sandbox.stub(cp, 'exec').callsFake((cmd, callback) => {
      if (cmd === 'uci get network.lan.ipaddr') {
        callback(testError);
      } else {
        callback();
      }
    });

    this.tessel.network.ap.on('create', () => {
      test.fail('should not connect');
      test.done();
    });

    this.tessel.network.ap.on('error', error => {
      test.equal(error, testError, 'error event fires correctly');
    });

    this.tessel.network.ap.create(settings, error => {
      if (error) {
        test.equal(error, testError, 'error should be passed into callback');
        test.done();
      } else {
        test.fail('should not connect');
        test.done();
      }
    });
  },

  reset(test) {
    test.expect(5);

    this.tessel.network.ap.on('reset', () => test.ok(true, 'reset event is fired'));
    this.tessel.network.ap.on('off', () => test.ok(true, 'off event is fired'));
    this.tessel.network.ap.on('on', () => test.ok(true, 'on event is fired'));
    this.tessel.network.ap.on('disable', () => test.ok(true, 'disable event is fired'));
    this.tessel.network.ap.on('enable', () => test.ok(true, 'enable event is fired'));

    this.tessel.network.ap.reset(error => {
      if (error) {
        test.fail(error);
        test.done();
      } else {
        test.done();
      }
    });
  },

  resetErrorCallback(test) {
    test.expect(5);

    const testError = new Error('Testing error');
    this.exec.restore();
    this.exec = sandbox.stub(cp, 'exec').callsFake((cmd, callback) => {
      callback(testError);
    });

    this.tessel.network.ap.on('reset', () => test.ok(true, 'reset event is fired'));
    this.tessel.network.ap.on('off', () => test.ok(true, 'off event is fired'));
    this.tessel.network.ap.on('disable', () => test.ok(true, 'disable event is fired'));
    this.tessel.network.ap.on('error', error => test.ok(error));
    this.tessel.network.ap.reset(error => {
      if (error) {
        test.ok(error);
        test.done();
      } else {
        test.fail(error);
        test.done();
      }
    });
  },

  disable(test) {
    test.expect(2);

    this.tessel.network.ap.on('off', () => test.ok(true, 'off event is fired'));
    this.tessel.network.ap.on('disable', () => test.ok(true, 'disable event is fired'));
    this.tessel.network.ap.disable(error => {
      if (error) {
        test.fail(error);
        test.done();
      } else {
        test.done();
      }
    });
  },

  disableErrorCallback(test) {
    test.expect(2);

    const testError = new Error('Testing error');
    this.exec.restore();
    this.exec = sandbox.stub(cp, 'exec').callsFake((cmd, callback) => {
      callback(testError);
    });

    this.tessel.network.ap.on('error', error => {
      test.ok(error);
    });

    this.tessel.network.ap.disable(error => {
      if (error) {
        test.ok(error);
        test.done();
      } else {
        test.fail(error);
        test.done();
      }
    });
  },

  enable(test) {
    test.expect(2);

    this.tessel.network.ap.on('on', () => {
      test.ok(true, 'on event is fired');
    });

    this.tessel.network.ap.on('enable', () => {
      test.ok(true, 'enable event is fired');
    });

    this.tessel.network.ap.enable(error => {
      if (error) {
        test.fail(error);
        test.done();
      } else {
        test.done();
      }
    });
  },

  enableErrorCallback(test) {
    test.expect(2);

    const testError = new Error('Testing error');
    this.exec.restore();
    this.exec = sandbox.stub(cp, 'exec').callsFake((cmd, callback) => {
      callback(testError);
    });

    this.tessel.network.ap.on('error', error => {
      test.ok(error);
    });

    this.tessel.network.ap.enable(error => {
      if (error) {
        test.ok(error);
        test.done();
      } else {
        test.fail(error);
        test.done();
      }
    });
  }
};

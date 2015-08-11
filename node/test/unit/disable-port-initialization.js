process.env.IS_TEST_MODE = true;

var sinon = require('sinon');
var Tessel = require('../../tessel-export');

// Shared sinon sandbox
var sandbox = sinon.sandbox.create();

var net = require('net');
var EventEmitter = require('events').EventEmitter;

exports['Disabled Port Initialization: new Tessel(options)'] = {
  setUp: function(done) {
    this.createConnection = sandbox.stub(net, 'createConnection', function() {
      return new EventEmitter();
    });

    this.LED = sandbox.stub(Tessel, 'LED');
    this.Port = sandbox.stub(Tessel, 'Port');

    done();
  },

  tearDown: function(done) {
    Tessel.instance = null;
    sandbox.restore();
    done();
  },

  allPortsInitializedImplicit: function(test) {
    test.expect(3);

    this.tessel = new Tessel();

    test.equal(this.tessel.ports.A instanceof Tessel.Port, true);
    test.equal(this.tessel.ports.B instanceof Tessel.Port, true);
    test.equal(this.Port.callCount, 2);
    test.done();
  },

  noPortsInitializedExplicitFalse: function(test) {
    test.expect(3);

    this.tessel = new Tessel({
      ports: {
        A: false,
        B: false
      }
    });

    test.equal(this.tessel.ports.A instanceof Tessel.Port, false);
    test.equal(this.tessel.ports.B instanceof Tessel.Port, false);
    test.equal(this.Port.callCount, 0);
    test.done();
  },

  allPortsInitializedExplicitInvalid: function(test) {
    test.expect(3);

    this.tessel = new Tessel({
      ports: {
        // These are not valid for disabling the
        // auto-initialization of a port.
        A: null,
        B: undefined
      }
    });

    test.equal(this.tessel.ports.A instanceof Tessel.Port, true);
    test.equal(this.tessel.ports.B instanceof Tessel.Port, true);
    test.equal(this.Port.callCount, 2);
    test.done();
  },

  portAInitializedBExplicitFalse: function(test) {
    test.expect(3);

    this.tessel = new Tessel({
      ports: {
        B: false
      }
    });

    test.equal(this.tessel.ports.A instanceof Tessel.Port, true);
    test.equal(this.tessel.ports.B instanceof Tessel.Port, false);
    test.equal(this.Port.callCount, 1);
    test.done();
  },

  portBInitializedAExplicitFalse: function(test) {
    test.expect(3);

    this.tessel = new Tessel({
      ports: {
        A: false
      }
    });

    test.equal(this.tessel.ports.A instanceof Tessel.Port, false);
    test.equal(this.tessel.ports.B instanceof Tessel.Port, true);
    test.equal(this.Port.callCount, 1);
    test.done();
  },

  portsPropertyNullDefaultInitializeBoth: function(test) {
    test.expect(3);

    this.tessel = new Tessel({
      ports: null
    });

    test.equal(this.tessel.ports.A instanceof Tessel.Port, true);
    test.equal(this.tessel.ports.B instanceof Tessel.Port, true);
    test.equal(this.Port.callCount, 2);
    test.done();
  },

  portsPropertyUndefinedDefaultInitializeBoth: function(test) {
    test.expect(3);

    this.tessel = new Tessel({
      ports: undefined
    });

    test.equal(this.tessel.ports.A instanceof Tessel.Port, true);
    test.equal(this.tessel.ports.B instanceof Tessel.Port, true);
    test.equal(this.Port.callCount, 2);
    test.done();
  },

  portsPropertyMissingDefaultInitializeBoth: function(test) {
    test.expect(3);

    this.tessel = new Tessel({});

    test.equal(this.tessel.ports.A instanceof Tessel.Port, true);
    test.equal(this.tessel.ports.B instanceof Tessel.Port, true);
    test.equal(this.Port.callCount, 2);
    test.done();
  },
};

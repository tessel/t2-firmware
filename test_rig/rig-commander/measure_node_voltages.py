from rig_commander import *
import sys

tolerance = 0.05

expected_volatges = [
    'X',    # 'CURRENT_UUT', 
    'X',    # 'CURRENT_USB0', 
    'X',    # 'CURRENT_USB1', 
    'X',    # 'CURRENT_PORTA33', 
    'X',    # 'CURRENT_PORTB33', 
    2.5,    # 'VOLTAGE_VREF', 
    5.0,    # 'VOLTAGE_5VUSB1', 
    5.0,    # 'VOLTAGE_5VUUT', 
    3.3,    # 'VOLTAGE_PORTA33', 
    1.2,    # 'VOLTAGE_12', 
    3.3,    # 'VOLTAGE_33CP', 
    3.3,    # 'VOLTAGE_PORTB33', 
    1.8,    # 'VOLTAGE_18', 
    3.3,    # 'VOLTAGE_33MT', 
    5.0,    # 'VOLTAGE_5VUSB0', 
]

def measure_node_voltages(testy, ev = expected_volatges):
    log_test_start('measure_node_voltages')
    print 'Running test with tolerance of ' + str(tolerance)
    voltages = []
    passed = []
    for pin in analog_pins:
        v = testy.measure_voltage(pin)
        voltages.append(v)
    for (v, e) in zip(voltages, ev):
        if type(ev) != type(1.0) or abs(1.0 - (1.0 * v) / e) < tolerance:
            passed.append(True)
        else:
            passed.append(False)
    print (False not in passed, zip(analog_pins, passed, voltages, ev))
    print 'Results:'
    print '\tPin\t\tMeasured\tExpected\tPassed?'
    for (pin, pas, vol, exp) in zip(analog_pins, passed, voltages, ev):
        print '\t' + pin + '\t' + str(vol) + '\t' + str(exp) + '\t' + ('Passed' if pas else 'FAILED')
    log_test_end('measure_node_voltages', False not in passed)
    if False in passed:
        raise test_fail_exception('Failed test measure_node_voltages')

if __name__ == '__main__':
    testy = testalator(sys.argv[1])
    measure_node_voltages(testy)
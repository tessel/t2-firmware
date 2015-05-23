from rig_commander import *
import sys
import time
import json

iterations = 1000

def mean(l):
    return sum(l) * 1.0 / len(l)
    
def reset_adc_cal(testy):
    # if we need it
    pass

def calibrate(testy):
    print 'Calibrating Testalator:\n', testy.serial
    calibration = {'serial' : testy.serial}

    for p in analog_pins:
        calibration[p] = {}

    raw_input('\nClamp in the grounding plate and press ENTER.')
    print '\nReading initial values at 0V, 0A'
    for p in analog_pins:
        offset = measure_analog_pin(p)
        calibration[p]['0'] = offset

    raw_input('\nConnect each voltage measurement pin to 2.5V, leave the current pins floating, and press ENTER.')
    print '\nReading initial values at 2.5V'
    for p in analog_pins:
        offset = measure_analog_pin(p)
        calibration[p]['2.5'] = offset

    print json.dumps(calibration)

    print 'Done!'

def measure_analog_pin(pin):
    print 'Measuring pin', pin
    measured = []
    for i in xrange(iterations):
        measured.append(testy.analog(pin) * 1.0)
    val = mean(measured)
    print 'Measured an average of', val, 'counts'
    return val

if __name__ == '__main__':
    testy = testalator(sys.argv[1])
    reset_adc_cal(testy)
    calibrate(testy)

# {'VOLTAGE_VREF': {'0': 3124.24, '2.5': 3123.5}, 'VOLTAGE_12': {'0': 40.85, '2.5': 43.3}, 'VOLTAGE_5VUSB0': {'0': 40.99, '2.5': 1567.69}, 'VOLTAGE_5VUSB1': {'0': 40.85, '2.5': 1567.15}, 'VOLTAGE_33CP': {'0': 40.07, '2.5': 1565.71}, 'VOLTAGE_18': {'0': 40.89, '2.5': 43.12}, 'CURRENT_PORTA33': {'0': 21.98, '2.5': 21.96}, 'VOLTAGE_PORTB33': {'0': 40.93, '2.5': 3123.27}, 'CURRENT_USB0': {'0': 22.16, '2.5': 21.98}, 'CURRENT_USB1': {'0': 21.96, '2.5': 24.02}, 'CURRENT_UUT': {'0': 26.44, '2.5': 26.29}, 'VOLTAGE_PORTA33': {'0': 41.38, '2.5': 1568.2}, 'serial': 'KDYXL8WFQ98SJP9HD0K493YPYS', 'VOLTAGE_5VUUT': {'0': 41.39, '2.5': 1567.55}, 'VOLTAGE_33MT': {'0': 41.06, '2.5': 41.2}, 'CURRENT_PORTB33': {'0': 21.8, '2.5': 27.92}}

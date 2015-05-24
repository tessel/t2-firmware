from rig_commander import *
import sys
import time
import json

iterations = 1000

divided_pins = [
    'VOLTAGE_5VUSB1', 
    'VOLTAGE_5VUUT', 
    'VOLTAGE_PORTA33', 
    'VOLTAGE_33CP', 
    'VOLTAGE_PORTB33', 
    'VOLTAGE_33MT', 
    'VOLTAGE_5VUSB0', 
]

def mean(l):
    return sum(l) * 1.0 / len(l)
    
def reset_adc_cal(testy):
    # if we need it
    pass

def calibrate(testy):
    print 'Calibrating Testalator:\n', #testy.serial
    # calibration = {'serial' : testy.serial}

    # for p in analog_pins:
    #     calibration[p] = {}

    # raw_input('\nClamp in the grounding plate and press ENTER.')
    # print '\nReading initial values at 0V, 0A'
    # for p in analog_pins:
    #     offset = measure_analog_pin(p)
    #     calibration[p]['0'] = offset

    # raw_input('\nConnect each voltage measurement pin to 2.5V, leave the current pins floating, and press ENTER.')
    # print '\nReading initial values at 2.5V'
    # for p in analog_pins:
    #     offset = measure_analog_pin(p)
    #     calibration[p]['2.5'] = offset

    # print json.dumps(calibration)

    calibration = {"VOLTAGE_VREF": {"0": 4092.608, "2.5": 4092.626}, "VOLTAGE_12": {"0": 40.712, "2.5": 43.633}, "VOLTAGE_5VUSB0": {"0": 40.62, "2.5": 2046.812}, "VOLTAGE_5VUSB1": {"0": 40.495, "2.5": 2045.701}, "VOLTAGE_33CP": {"0": 40.122, "2.5": 2045.072}, "VOLTAGE_18": {"0": 40.644, "2.5": 43.738}, "CURRENT_PORTA33": {"0": 15.081, "2.5": 14.997}, "VOLTAGE_PORTB33": {"0": 40.537, "2.5": 2046.906}, "CURRENT_USB0": {"0": 15.485, "2.5": 15.239}, "CURRENT_USB1": {"0": 15.315, "2.5": 18.036}, "CURRENT_UUT": {"0": 21.458, "2.5": 21.335}, "VOLTAGE_PORTA33": {"0": 41.344, "2.5": 2047.37}, "serial": "KDYXL8WFQ98SJP9HD0K493YPYS", "VOLTAGE_5VUUT": {"0": 40.907, "2.5": 2046.387}, "VOLTAGE_33MT": {"0": 40.761, "2.5": 2046.685}, "CURRENT_PORTB33": {"0": 15.507, "2.5": 23.523}}

    for p in analog_pins:
        c = calibration[p]
        c['b'] = -c['0']
        if 'VOLTAGE' in p:
            c['m'] = (c['2.5'] - c['0']) * 1.0 / ADC_MAX_VALUE * (2.0 if p in divided_pins else 1.0)
        else:   
            c['m'] = 1.0
        print p, c['b'], c['m']#counts_to_volts(testy.analog(p) * c['m'] + c['b'])
    
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
    testy = None#testalator(sys.argv[1])
    reset_adc_cal(testy)
    calibrate(testy)

# {'VOLTAGE_VREF': {'0': 3124.24, '2.5': 3123.5}, 'VOLTAGE_12': {'0': 40.85, '2.5': 43.3}, 'VOLTAGE_5VUSB0': {'0': 40.99, '2.5': 1567.69}, 'VOLTAGE_5VUSB1': {'0': 40.85, '2.5': 1567.15}, 'VOLTAGE_33CP': {'0': 40.07, '2.5': 1565.71}, 'VOLTAGE_18': {'0': 40.89, '2.5': 43.12}, 'CURRENT_PORTA33': {'0': 21.98, '2.5': 21.96}, 'VOLTAGE_PORTB33': {'0': 40.93, '2.5': 3123.27}, 'CURRENT_USB0': {'0': 22.16, '2.5': 21.98}, 'CURRENT_USB1': {'0': 21.96, '2.5': 24.02}, 'CURRENT_UUT': {'0': 26.44, '2.5': 26.29}, 'VOLTAGE_PORTA33': {'0': 41.38, '2.5': 1568.2}, 'serial': 'KDYXL8WFQ98SJP9HD0K493YPYS', 'VOLTAGE_5VUUT': {'0': 41.39, '2.5': 1567.55}, 'VOLTAGE_33MT': {'0': 41.06, '2.5': 41.2}, 'CURRENT_PORTB33': {'0': 21.8, '2.5': 27.92}}

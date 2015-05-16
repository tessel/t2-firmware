from rig_commander import *

threshold = 0.05

# 'CURRENT_UUT', 
# 'CURRENT_USB0', 
# 'CURRENT_USB1', 
# 'CURRENT_PORTA33', 
# 'CURRENT_PORTB33', 
# 'VOLTAGE_VREF', 
# 'VOLTAGE_5VUSB1', 
# 'VOLTAGE_5VUUT', 
# 'VOLTAGE_PORTA33', 
# 'VOLTAGE_12', 
# 'VOLTAGE_33CP', 
# 'VOLTAGE_PORTB33', 
# 'VOLTAGE_18', 
# 'VOLTAGE_33MT', 
# 'VOLTAGE_5VUSB0', 

expected = [
    'X', 
    'X', 
    'X', 
    'X', 
    'X', 
    2.5, 
    5.0, 
    5.0, 
    3.3, 
    1.2, 
    3.3, 
    3.3, 
    1.8, 
    3.3, 
    5.0, 
]

if __name__ == '__main__':
    testy = testalator('0PXZ34P8PLXWLX42QM8C73N70X')
    voltages = []
    passed = []
    for pin in analog_pins:
        v = testy.measure_voltage(pin)
        # print v
        voltages.append(v)
    for (v, e) in zip(voltages, expected):
        if type(expected) != type(1.0) or abs(1.0 - (1.0 * v) / e) < threshold:
            passed.append(True)
        else:
            passed.append(False)
    print passed
    print (False in passed, zip(analog_pins, passed, voltages, expected))

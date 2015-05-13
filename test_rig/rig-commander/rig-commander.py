import sys
import usb.core
import time

REQ_DIGITAL         = 1
REQ_ANALOG          = 2
REQ_READALLDIGITAL  = 3

digital_pins = [
    'SHORT_USBO',
    'SHORT_USB1',
    'SHORT_PORTA33',
    'SHORT_PORTB33',
    'LED_READY',
    'LED_TESTING',
    'LED_PASS',
    'LED_FAIL',
    'UUTPOWER_USB',
    'UUTPOWER_VIN',
    'PORTA_MOSI',
    'PORTA_MISO',
    'PORTA_SCK',
    'PORTA_G3',
    'PORTA_SDA',
    'PORTA_SCL',
    'PORTA_G1',
    'PORTA_G2',
    'PORTB_G3',
    'PORTB_MOSI',
    'PORTB_SCK',
    'PORTB_MISO',
    'PORTB_SDA',
    'PORTB_SCL',
    'PORTB_G1',
    'PORTB_G2',
];

dev = usb.core.find(idVendor = 0x59E3, idProduct = 0xCDA6)
if dev is None:
    raise ValueError('device is not connected')

def pin_id (pin):
    return digital_pins.index(pin.upper())

def digital (pin, state):
    return dev.ctrl_transfer(0xC0, REQ_DIGITAL, state, pin_id(pin), 64)

def read_all_digital ():
    states = dev.ctrl_transfer(0xC0, REQ_READALLDIGITAL, 0, 0, 64)    
    return zip(digital_pins, states)

# wrappers

def power_helper (usb, vin):
    return (digital('UUTPOWER_USB', usb)[0], digital('UUTPOWER_VIN', vin)[0])

def power (source = 'USB'):
    if str(source).upper() == 'VIN':
        return power_helper(False, True)
    elif (str(source).upper() in ('USB', 'ON', '1', 'TRUE')):
        return power_helper(True, False)
    else:
        return power_helper(False, False)

def test_pass ():
    digital('LED_TESTING', 0)
    digital('LED_FAIL', 0)
    digital('LED_PASS', 1)

def test_fail ():
    digital('LED_TESTING', 0)
    digital('LED_PASS', 0)
    digital('LED_FAIL', 1)

if __name__ == '__main__':
    val = True
    pwr = ['usb', 'vin', 'off']
    c = 0
    while True:
        print digital('LED_PASS', val)
        val = not val
        for pin in read_all_digital():
            print str(pin[0]) + '\t:  ' + str(pin[1])
        power(pwr[c % 3])
        print ''
        time.sleep(0.5)
        c += 1

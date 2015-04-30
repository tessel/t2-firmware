import sys
import usb.core

REQ_PWR  = 0x10

pins = {
    'a': 0x10,
    'b': 0x11,
    'r': 0x12,
    'lr': 0x20,
    'lg': 0x21,
    'lb': 0x22,
    'dac': 0xd0,
}

dev = usb.core.find(idVendor=0x59e3, idProduct=0x5555)
if dev is None:
    raise ValueError('device is not connected')

dev.ctrl_transfer(0x40, 0x10, int(sys.argv[2]), pins[sys.argv[1]], '')

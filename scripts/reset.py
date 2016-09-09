import sys
import usb.core

REQ_RESET  = 0xBD

dev = usb.core.find(idVendor=0x1209, idProduct=0x7551)
if dev is None:
    raise ValueError('device is not connected')

dev.ctrl_transfer(0x40, REQ_RESET, 0, 0, '')

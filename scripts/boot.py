import sys
import usb.core

REQ_BOOT  = 0xbb

dev = usb.core.find(idVendor=0x1209, idProduct=0x7551)
if dev is None:
    raise ValueError('device is not connected')

dev.ctrl_transfer(0x40, REQ_BOOT, 0, 0, '')

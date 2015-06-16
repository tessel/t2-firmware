import sys
import usb.core

REQ_BOOT  = 0xbb

dev = usb.core.find(idVendor=0x9999, idProduct=0xffff)
if dev is None:
    raise ValueError('device is not connected')

dev.ctrl_transfer(0x40, REQ_BOOT, 0, 0, '')

"""
Utilities to manipulate the Spansion SPI flash on Tessel 2 via USB on the coprocessor
"""

from __future__ import print_function
import usb.core
import random
import sys
import os
import time

def chunks(l, n):
    for i in xrange(0, len(l), n):
        yield l[i:i+n]

def address(addr):
    return [(addr>>24) & 0xFF, (addr>>16) & 0xFF, (addr>>8) & 0xFF, addr & 0xFF]

def showhex(buf):
    print(''.join('{:02x}'.format(x) for x in buf))

def factory(mac1, mac2):
    """Generate a mediatek factory partition"""
    header = [0x20, 0x76, 0x03, 0x01]
    return ''.join(map(chr, header + mac1 + [0xff] * 30 + mac2))

PAGE = 256

class Flash(object):
    def __init__(self, device):
        self.interface = device.get_active_configuration()[(0, 1)]
        self.interface.set_altsetting()
        self.ep_in = self.interface[0]
        self.ep_out = self.interface[1]

    def transaction(self, write, read=0, status_poll=False, wren=False):
        if len(write) > 500 or read >= 2**24:
            raise ValueError("Transaction too large")

        flags = int(status_poll) | (int(wren) << 1)
        hdr = [(read >> 0) & 0xff, (read >> 8) & 0xff, (read >> 16) & 0xff, flags]
        self.ep_out.write(hdr + write)

        if read > 0:
            return bytearray(self.ep_in.read(max(read, 512)))
        else:
            return bytearray()

    def rdid(self):
        """Read chip ID"""
        return self.transaction([0x9f], 3)

    def check_id(self):
        chip_id = self.rdid()
        print("Chip id", str(chip_id).encode('hex'))

        if chip_id != bytearray([0x01, 0x02, 0x19]):
            raise AssertionError("Invalid chip ID (flash communication error)")

    def read(self, addr, length):
        """Read from flash"""
        return self.transaction([0x13]+address(addr), length)

    def wren(self):
        """Set the write enable flag"""
        self.transaction([0x06])

    def status(self):
        """Read the status register"""
        return self.transaction([0x05], 1)[0]

    def wait_complete(self):
        """Poll for the WIP bit in the status register to go low"""
        count = 0
        while True:
            count += 1
            s = self.status()
            if s & 1 == 0:
                break
            if count > 50:
                time.sleep(0.1)

    def erase_sector(self, addr):
        """Erase a sector"""
        self.wren()
        print("Erase {:x}".format(addr))
        self.transaction([0xDC]+address(addr))
        self.wait_complete()

    def chip_erase(self):
        """Erase the entire chip"""
        self.wren()
        print("Chip erase...")
        t = time.time()
        self.transaction([0x60])
        self.wait_complete()
        print("Chip erase complete ({:.2f}s)".format(time.time()-t))

    def write_page(self, addr, data):
        """Write a page to flash"""
        self.transaction([0x12]+address(addr)+data, status_poll = True, wren = True)

    def write(self, addr, data):
        """Write a binary to flash"""
        t = time.time()
        write_addr = addr
        for i, p in enumerate(chunks(data, PAGE)):
            if i % 32 == 0:
                print("Write 0x{:08x} ({:3.0f}%)\r".format(addr, i*PAGE*100.0/ len(data)), end='')
            self.write_page(write_addr, map(ord, p))
            write_addr += PAGE
        self.wait_complete()
        print("\rWrite 0x{:08x} (100%, {:.2f}s)".format(addr, time.time() - t))

    def write_tessel_flash(self, path, mac1, mac2):
        self.check_id()
        self.chip_erase()
        self.write(0,       open(os.path.join(path, 'openwrt-ramips-mt7620-Default-u-boot.bin')).read())
        self.write(0x40000, factory(mac1, mac2))
        self.write(0x50000, open(os.path.join(path, 'openwrt-ramips-mt7620-tessel-squashfs-sysupgrade.bin')).read())

def randbyte():
    return random.randint(0, 255)

def reset_openwrt(device):
    # Reset the USB interface
    device.reset();
    # Control transfer to put RST line low
    device.ctrl_transfer(0x40, 0x10, 0, 0, '')
    # Control transfer to put RST line high
    device.ctrl_transfer(0x40, 0x10, 1, 0, '')

if __name__ == '__main__':
    dev = usb.core.find(idVendor=0x1209, idProduct=0x7551)
    if dev is None:
        raise ValueError('Our device is not connected')

    flash = Flash(dev)

    basepath = sys.argv[1]
    assert(basepath)

    uid = [randbyte(), randbyte(), randbyte(), randbyte()]
    mac1 = [0x02, 0xa3] + uid
    mac2 = [0x02, 0xa4] + uid
    print("Generated MAC addr ", ':'.join("{:02x}".format(x) for x in mac1))

    flash.write_tessel_flash(basepath, mac1, mac2)

    print("Rebooting device...")
    reset_openwrt(dev)

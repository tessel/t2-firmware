from __future__ import print_function
import usb.core
import random
import sys
import os
import time

dev = usb.core.find(idVendor=0x9999, idProduct=0xffff)
if dev is None:
    raise ValueError('Our device is not connected')

def chunks(l, n):
    for i in xrange(0, len(l), n):
        yield l[i:i+n]

dev.set_interface_altsetting(interface = 0, alternate_setting = 1)

def address(addr):
    return [(addr>>24) & 0xFF, (addr>>16) & 0xFF, (addr>>8) & 0xFF, addr & 0xFF]

def transaction(write, read=0, status_poll=False, wren=False):
    if len(write) > 500 or read >= 2**24:
        raise ValueError("Transaction too large")

    flags = int(status_poll) | (int(wren) << 1)
    dev.write(0x02, [(read >> 0) & 0xff, (read >> 8) & 0xff, (read >> 16) & 0xff, flags] + write)

    if read > 0:
        return bytearray(dev.read(0x81, max(read, 512)))
    else:
        return bytearray()


def showhex(buf):
    print(''.join('{:02x}'.format(x) for x in buf))

def rdid():
    return transaction([0x9f], 3)

def read(addr, length):
    return transaction([0x13]+address(addr), length)

def wren():
    transaction([0x06])

def status():
    return transaction([0x05], 1)[0]

def wait_complete():
    count = 0
    while True:
        count += 1
        s = status()
        if s & 1 == 0:
            break
        if count > 50:
            time.sleep(0.1)

def erase_sector(addr):
    wren()
    print("Erase {:x}".format(addr))
    transaction([0xDC]+address(addr))
    wait_complete()

def chip_erase():
    wren()
    print("Chip erase...")
    t = time.time()
    transaction([0x60])
    wait_complete()
    print("Chip erase complete ({:.2f}s)".format(time.time()-t))

def write_page(addr, data):
    transaction([0x12]+address(addr)+data, status_poll = True, wren = True)

PAGE = 256

def write(addr, data):
    t = time.time()
    write_addr = addr
    for i, p in enumerate(chunks(data, PAGE)):
        if i % 32 == 0:
            print("Write 0x{:08x} ({:3.0f}%)\r".format(addr, i*PAGE*100.0/ len(data)), end='')
        write_page(write_addr, map(ord, p))
        write_addr += PAGE
    wait_complete()
    print("\rWrite 0x{:08x} (100%, {:.2f}s)".format(addr, time.time() - t))

def randbyte():
    return random.randint(0, 255)

def factory():
    header = [0x20, 0x76, 0x03, 0x01]
    uid = [randbyte(), randbyte(), randbyte(), randbyte()]
    mac1 = [0x02, 0xa3] + uid
    mac2 = [0x02, 0xa4] + uid

    print("Generated MAC addr ", ':'.join("{:02x}".format(x) for x in mac1))
    return ''.join(map(chr, header + mac1 + [0xff] * 30 + mac2))

basepath = sys.argv[1]
assert(basepath)

chip_id = rdid()
print("Chip id", str(chip_id).encode('hex'))

if chip_id != bytearray([0x01, 0x02, 0x19]):
    print("Invalid chip ID (flash communication error)")
    exit(1)

t = transaction([0x05] + [0]*100, 1000)
assert(len(t) == 1000)

chip_erase()

write(0,       open(os.path.join(basepath, 'openwrt-ramips-mt7620-Default-u-boot.bin')).read())
write(0x40000, factory())
write(0x50000, open(os.path.join(basepath, 'openwrt-ramips-mt7620-tessel-squashfs-sysupgrade.bin')).read())

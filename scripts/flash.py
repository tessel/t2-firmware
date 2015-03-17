import usb.core
import random
import sys
import os

dev = usb.core.find(idVendor=0x9999, idProduct=0xffff)
if dev is None:
    raise ValueError('Our device is not connected')

def chunks(l, n):
    for i in xrange(0, len(l), n):
        yield l[i:i+n]

PKT = 64

dev.set_interface_altsetting(interface = 0, alternate_setting = 1)

def address(addr):
    return [(addr>>24) & 0xFF, (addr>>16) & 0xFF, (addr>>8) & 0xFF, addr & 0xFF]

def transaction(write, read=0):
    buf_out = write + [0]*read
    buf_in = bytearray()
    for b in chunks(buf_out, 64):
        dev.write(0x02, b)
        buf_in += bytearray(dev.read(0x81, PKT))

    if len(buf_out) % PKT == 0:
        dev.write(0x02, [])
        dev.read(0x81, PKT)

    return buf_in[len(write):]

def showhex(buf):
    print(''.join('{:02x}'.format(x) for x in buf))

def rdid():
    return transaction([0x9f], 3)

def read(addr, length):
    return transaction([0x13]+address(addr), length)

def wren():
    return transaction([0x06])

def status():
    return transaction([0x05], 1)[0]

def wait_complete():
    count = 0
    while True:
        count += 1
        s = status()
        if s & 1 == 0:
            break
    print("Status {:x} after polling {} times".format(s, count))

def erase_sector(addr):
    wren()
    print("Erase {:x}".format(addr))
    transaction([0xDC]+address(addr))
    wait_complete()

def chip_erase():
    wren()
    print("Chip erase")
    transaction([0x60])
    wait_complete()

def write_page(addr, data):
    wren()
    print("Write {:x}".format(addr))
    transaction([0x12]+address(addr)+data)
    wait_complete()

PAGE = 256

def write(addr, data):
    for p in chunks(data, PAGE):
        write_page(addr, map(ord, p))
        addr += PAGE

def randbyte():
    return random.randint(0, 256)

def factory():
    header = [0x20, 0x76, 0x03, 0x01]
    uid = [randbyte(), randbyte(), randbyte(), randbyte()]
    mac1 = [0x02, 0xa3] + uid
    mac2 = [0x02, 0xa4] + uid

    print "Generated MAC addr ", ':'.join("{:02x}".format(x) for x in mac1)
    return ''.join(map(chr, header + mac1 + [0xff] * 30 + mac2))

basepath = sys.argv[1]
assert(basepath)

chip_id = rdid()
print "Chip id", str(chip_id).encode('hex')

if chip_id != bytearray([0x01, 0x02, 0x19]):
    print "Invalid chip ID (flash communication error)"
    exit(1)

chip_erase()

write(0,       open(os.path.join(basepath, 'openwrt-ramips-mt7620-Default-u-boot.bin')).read())
write(0x40000, factory())
write(0x50000, open(os.path.join(basepath, 'openwrt-ramips-mt7620-tessel-squashfs-sysupgrade.bin')).read())

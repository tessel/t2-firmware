#/bin/sh
mkdir -p /var/run/tessel
ln -sf /var/run/tessel/0 /var/run/tessel/usb
ln -sf /var/run/tessel/1 /var/run/tessel/port_a
ln -sf /var/run/tessel/2 /var/run/tessel/port_b
exec spid /dev/spidev32766.1 1 2 /var/run/tessel

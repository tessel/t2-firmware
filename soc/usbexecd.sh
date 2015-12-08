#/bin/sh
ln -sf /var/run/tessel/0 /var/run/tessel/usb
exec usbexecd /var/run/tessel/usb
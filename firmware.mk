TARGET := firmware

include common.mk
include usb.mk

$(TARGET)_SRC += \
  firmware/main.c \
  firmware/usb.c \
  firmware/flash.c \
  firmware/bridge.c \
  firmware/port.c \
  firmware/usbpipe.c \
  firmware/usbserial.c \

$(TARGET)_LDSCRIPT = deps/sam0/linker_scripts/samd21/gcc/samd21g15a_flash.ld

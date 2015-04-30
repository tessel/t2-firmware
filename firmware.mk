TARGET := firmware

include common.mk
include usb.mk

$(TARGET)_SRC += \
  firmware/main.c \
  firmware/usb.c \
  firmware/port.c \

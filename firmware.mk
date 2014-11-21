TARGET := firmware

include common.mk
include usb.mk

$(TARGET)_SRC += \
  firmware/main.c \
  firmware/usb.c \
  $(USB_PATH)/class/dfu/dfu.c

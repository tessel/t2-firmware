TARGET := boot

include common.mk
include usb.mk

$(TARGET)_INCLUDE += \
  -I boot \

$(TARGET)_SRC += \
  boot/main.c \
  boot/usb.c \
  $(USB_PATH)/class/dfu/dfu.c

$(TARGET)_LDSCRIPT = boot/samr21g18a_boot.ld

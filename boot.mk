TARGET := boot

include common.mk
include usb.mk

$(TARGET)_INCLUDE += \
  -I boot \

$(TARGET)_SRC += \
  boot/main.c \
  boot/usb.c \
  $(USB_PATH)/class/dfu/dfu.c

$(TARGET)_LDSCRIPT = common/samd21x18a_boot_partition.ld
$(TARGET)_DEFINE += -D __SAMD21G18A__

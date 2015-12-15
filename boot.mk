TARGET := boot

include common.mk
include usb.mk

$(TARGET)_INCLUDE += \
  -I boot \

$(TARGET)_SRC += \
  boot/main.c \
  boot/usb.c \
  $(USB_PATH)/class/dfu/dfu.c

$(TARGET)_LDSCRIPT = deps/sam0/linker_scripts/samd21/gcc/samd21g18a_flash.ld
$(TARGET)_DEFINE += -D __SAMD21G18A__

TARGET := test_rig

include common.mk
include usb.mk

$(TARGET)_SRC += \
  test_rig/main.c \
  test_rig/usb.c \

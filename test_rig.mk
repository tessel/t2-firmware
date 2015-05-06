TARGET := test_rig

include common.mk
include usb.mk

$(TARGET)_SRC += \
  test_rig/main.c \
  test_rig/usb.c \
  test_rig/DAP.c \
  test_rig/SW_DP.c \
  test_rig/dap_hid.c \

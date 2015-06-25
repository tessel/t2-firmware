TARGET := test_rig

include common.mk
include usb.mk

$(TARGET)_SRC += \
  test_rig/main.c \
  test_rig/usb.c \
  test_rig/DAP.c \
  test_rig/SW_DP.c \
  test_rig/dap_hid.c \
  test_rig/pins.c \
  test_rig/button.c \

$(TARGET)_DEFINE += -D __SAMD21J18A__
$(TARGET)_LDSCRIPT = common/samd21g15a_firmware_partition.ld

TARGET := firmware

include common.mk
include usb.mk

$(TARGET)_SRC += \
  firmware/main.c \
  firmware/usb.c \
  firmware/port.c \
  firmware/dap/DAP.c \
  firmware/dap/SW_DP.c \
  firmware/dap/dap_hid.c \

$(TARGET)_LDSCRIPT = common/samd21g15a_firmware_partition.ld
$(TARGET)_DEFINE += -D __SAMD21G15A__

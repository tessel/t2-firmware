TARGET := test_rig

include common.mk
include usb.mk

$(TARGET)_SRC += \
  test_rig/main.c \
  test_rig/usb.c \
  test_rig/DAP.c \
  test_rig/SW_DP.c \
  test_rig/dap_hid.c \
  test_rig/digital.c \

$(TARGET)_DEFINE += -D __SAMD21J18A__
$(TARGET)_LDSCRIPT = deps/sam0/linker_scripts/samd21/gcc/samd21j18a_flash.ld

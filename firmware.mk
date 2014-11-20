TARGET := firmware

include common.mk
include usb.mk

$(TARGET)_INCLUDE += \
  -I$(DRIVERS_PATH)/interrupt \
  -I$(DRIVERS_PATH)/port \
  -I$(DRIVERS_PATH)/system \
  -I$(DRIVERS_PATH)/system/clock \
  -I$(DRIVERS_PATH)/system/clock/clock_samd21_r21 \
  -I$(DRIVERS_PATH)/system/clock/clock_samd21_r21/module_config \
  -I$(DRIVERS_PATH)/system/interrupt \
  -I$(DRIVERS_PATH)/system/interrupt/system_interrupt_samr21 \
  -I$(DRIVERS_PATH)/system/pinmux \

$(TARGET)_SRC += \
  firmware/main.c \
  firmware/usb.c \
  $(DRIVERS_PATH)/system/interrupt/interrupt_sam_nvic.c \
  $(DRIVERS_PATH)/system/clock/clock_samd21_r21/clock.c \
  $(DRIVERS_PATH)/system/clock/clock_samd21_r21/gclk.c  \
  $(DRIVERS_PATH)/system/pinmux/pinmux.c                \
  $(DRIVERS_PATH)/system/interrupt/system_interrupt.c   \
  $(DRIVERS_PATH)/system/system.c                       \
  $(USB_PATH)/class/dfu/dfu.c

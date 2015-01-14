$(TARGET)_INCLUDE += \
  -I . \
  -I$(CMSIS_PATH)/.. \
  -I$(CMSIS_PATH)/include \
  -I$(CMSIS_PATH)/source \
  -I$(ATMEL_PATH)/include \

$(TARGET)_SRC += \
  $(CMSIS_PATH)/source/gcc/startup_samd21.c \
  common/clock.c \
  common/dma.c \
  common/sercom.c \

$(TARGET)_CFLAGS += -Wall --std=gnu99 -Os -g3
$(TARGET)_CFLAGS += -fdata-sections -ffunction-sections
$(TARGET)_CFLAGS += -funsigned-char -funsigned-bitfields
$(TARGET)_CFLAGS += -mcpu=cortex-m0plus -mthumb

$(TARGET)_LDFLAGS += -mcpu=cortex-m0plus -mthumb
$(TARGET)_LDFLAGS += -Wl,--gc-sections --specs=nano.specs

$(TARGET)_LDSCRIPT = common/samr21g18a_firmware.ld

$(TARGET)_DEFINE += \
  -DF_CPU=8000000 \
  -D __SAMD21G15A__

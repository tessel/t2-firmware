$(TARGET)_INCLUDE += \
  -I . \
  -I$(CMSIS_PATH)/.. \
  -I$(CMSIS_PATH)/include \
  -I$(CMSIS_PATH)/source \
  -I$(ATMEL_PATH)/include \

$(TARGET)_SRC += \
  common/startup_samd21.c \
  common/clock.c \
  common/dma.c \
  common/sercom.c \
  common/timer.c \
  common/analog.c \
  common/pwm.c \
  build/version.c

$(TARGET)_CFLAGS += -Wall --std=gnu99 -Os -g3 -flto
$(TARGET)_CFLAGS += -fdata-sections -ffunction-sections
$(TARGET)_CFLAGS += -funsigned-char -funsigned-bitfields
$(TARGET)_CFLAGS += -mcpu=cortex-m0plus -mthumb

$(TARGET)_LDFLAGS += -mcpu=cortex-m0plus -mthumb -flto
$(TARGET)_LDFLAGS += -Wl,--gc-sections --specs=nano.specs

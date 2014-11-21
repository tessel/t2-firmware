$(TARGET)_INCLUDE += \
  -I . \
  -I$(CMSIS_PATH)/.. \
  -I$(CMSIS_PATH)/include \
  -I$(CMSIS_PATH)/source \
  -I$(ATMEL_PATH)/include \

$(TARGET)_SRC += \
  $(CMSIS_PATH)/source/gcc/startup_samr21.c \
  common/clock.c \

$(TARGET)_CFLAGS += -Wall --std=gnu99 -Os -g3
$(TARGET)_CFLAGS += -fdata-sections -ffunction-sections
$(TARGET)_CFLAGS += -funsigned-char -funsigned-bitfields
$(TARGET)_CFLAGS += -mcpu=cortex-m0plus -mthumb

$(TARGET)_LDFLAGS += -mcpu=cortex-m0plus -mthumb
$(TARGET)_LDFLAGS += -Wl,--gc-sections --specs=nano.specs
$(TARGET)_LDFLAGS += -Wl,--script=deps/sam0/linker_scripts/samr21/gcc/samr21g18a_flash.ld

$(TARGET)_DEFINE += \
  -DPHY_AT86RF233 \
  -DHAL_ATSAMD21J18 \
  -DPLATFORM_XPLAINED_PRO_SAMR21 \
  -DF_CPU=8000000 \
  -BOARD=SAMR21_XPLAINED_PRO \
  -D __SAMR21G18A__

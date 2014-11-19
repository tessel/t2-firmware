##############################################################################
CONFIG = Debug
#CONFIG = Release

##############################################################################
.PHONY: all directory clean size

AT_PATH = sam0/
CMSIS_PATH = sam0/cmsis/samr21
DRIVERS_PATH = sam0/drivers
SRC_PATH = src

USB_PATH=usb
include usb/samd/makefile

CC = arm-none-eabi-gcc
OBJCOPY = arm-none-eabi-objcopy
SIZE = arm-none-eabi-size
LD = arm-none-eabi-gcc

CFLAGS += -W -Wall --std=gnu99 -Os
CFLAGS += -fdata-sections -ffunction-sections
CFLAGS += -funsigned-char -funsigned-bitfields
CFLAGS += -mcpu=cortex-m0plus -mthumb
CFLAGS += -MD -MP -MT $(CONFIG)/$(*F).o -MF $(CONFIG)/$(@F).d

ifeq ($(CONFIG), Debug)
  CFLAGS += -g
endif

LDFLAGS += -mcpu=cortex-m0plus -mthumb
LDFLAGS += -Wl,--gc-sections --specs=nano.specs
LDFLAGS += -Wl,--script=sam0/linker_scripts/samr21/gcc/samr21g18a_flash.ld

INCLUDES += \
  -I$(SRC_PATH) \
  -I$(CMSIS_PATH)/.. \
  -I$(CMSIS_PATH)/include \
  -I$(CMSIS_PATH)/source \
  -I$(DRIVERS_PATH)/interrupt \
  -I$(DRIVERS_PATH)/port \
  -I$(DRIVERS_PATH)/sercom \
  -I$(DRIVERS_PATH)/sercom/usart \
  -I$(DRIVERS_PATH)/sercom/i2c \
  -I$(DRIVERS_PATH)/sercom/spi \
  -I$(DRIVERS_PATH)/sercom/spi/module_config \
  -I$(DRIVERS_PATH)/system \
  -I$(DRIVERS_PATH)/system/clock \
  -I$(DRIVERS_PATH)/system/clock/clock_samd21_r21 \
  -I$(DRIVERS_PATH)/system/clock/clock_samd21_r21/module_config \
  -I$(DRIVERS_PATH)/system/interrupt \
  -I$(DRIVERS_PATH)/system/interrupt/system_interrupt_samr21 \
  -I$(DRIVERS_PATH)/system/pinmux \
  -I$(AT_PATH)/include \
  -I$(SRC_PATH)/radio \
  $(USB_OPTS)

SRCS += \
  $(CMSIS_PATH)/source/gcc/startup_samr21.c \
  $(CMSIS_PATH)/source/system_samr21.c \
  $(DRIVERS_PATH)/system/interrupt/interrupt_sam_nvic.c \
  $(DRIVERS_PATH)/system/clock/clock_samd21_r21/clock.c \
  $(DRIVERS_PATH)/system/clock/clock_samd21_r21/gclk.c  \
  $(DRIVERS_PATH)/system/pinmux/pinmux.c                \
  $(DRIVERS_PATH)/system/interrupt/system_interrupt.c   \
  $(DRIVERS_PATH)/system/system.c                       \
  $(SRC_USB) \
  $(SRC_PATH)/main.c \
  $(SRC_PATH)/usb.c

DEFINES += \
  -DPHY_AT86RF233 \
  -DHAL_ATSAMD21J18 \
  -DPLATFORM_XPLAINED_PRO_SAMR21 \
  -DF_CPU=8000000 \
  -BOARD=SAMR21_XPLAINED_PRO \
  -D __SAMR21G18A__

CFLAGS += $(INCLUDES) $(DEFINES)

OBJS = $(addprefix $(CONFIG)/, $(notdir %/$(subst .c,.o, $(SRCS))))

all: directory $(CONFIG)/firmware.elf $(CONFIG)/firmware.hex $(CONFIG)/firmware.bin size

$(CONFIG)/firmware.elf:
	$(Q)$(LD) $(LDFLAGS) $(CFLAGS) $(obj-y) $(libflags-gnu-y) $(SRCS) -o $@
	@echo $(MSG_SIZE)
	$(Q)$(SIZE) -Ax $@
	$(Q)$(SIZE) -Bx $@


$(CONFIG)/firmware.hex: $(CONFIG)/firmware.elf
	@echo OBJCOPY $@
	@$(OBJCOPY) -O ihex -R .eeprom $^ $@

$(CONFIG)/firmware.bin: $(CONFIG)/firmware.elf
	@echo OBJCOPY $@
	@$(OBJCOPY) -O binary -R .eeprom $^ $@

directory:
	@mkdir -p $(CONFIG)

size: $(CONFIG)/firmware.elf
	@echo size:
	@$(SIZE) -t $^

clean:
	@echo clean
	@-rm -rf $(CONFIG)

-include $(wildcard $(CONFIG)/*.d)

TARGETS = firmware boot test_rig
BUILD = build

all: $(TARGETS)
.PHONY: all clean update

ATMEL_PATH = deps/sam0
CMSIS_PATH = $(ATMEL_PATH)/cmsis/samd21
DRIVERS_PATH = $(ATMEL_PATH)/drivers

CC = arm-none-eabi-gcc
OBJCOPY = arm-none-eabi-objcopy
SIZE = arm-none-eabi-size

include $(addsuffix .mk,$(TARGETS))

define each_target
$(1): $(BUILD)/$(1).elf $(BUILD)/$(1).bin
.PHONY: $(1)

$(1)_OBJS := $$(addprefix $(BUILD)/$(1)/, $$(subst .c,.o, $$($(1)_SRC)))
-include $$($(1)_OBJS:.o=.d)

$$($(1)_OBJS): $(BUILD)/$(1)/%.o: %.c
	@mkdir -p $$(shell dirname $$@)
	$(Q)$(CC) $$($(1)_CFLAGS) $$($(1)_INCLUDE) $$($(1)_DEFINE) -c $$< -o $$@ -MMD -MP -MF $$(patsubst %.o,%.d,$$@)

$(BUILD)/$(1).bin $(BUILD)/$(1).elf: $$($(1)_OBJS)
	$(Q)$(CC) $$($(1)_CFLAGS) $$($(1)_LDFLAGS) $$($(1)_OBJS) -Wl,-T$$($(1)_LDSCRIPT) -o $(BUILD)/$(1).elf
	$(Q)$(OBJCOPY) -O binary -R .eeprom $(BUILD)/$(1).elf $(BUILD)/$(1).bin
endef

$(foreach t,$(TARGETS),$(eval $(call each_target,$(t))))

clean:
	@-rm -rf $(BUILD)

update:
	git submodule update --init --recursive

print-%	: ; @echo $* = $($*)

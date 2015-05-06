#pragma once
#include <samd21j17a.h>

#include "common/util.h"
#include "common/hw.h"

// Memory Layout
#define FLASH_BOOT_SIZE 4096
#define FLASH_CONFIG_SIZE 1024
#define FLASH_FW_SIZE (256*1024 - FLASH_BOOT_SIZE - FLASH_CONFIG_SIZE)

#define FLASH_BOOT_START 0
#define FLASH_FW_START 4096

#define FLASH_BOOT_ADDR FLASH_BOOT_START
#define FLASH_FW_ADDR FLASH_FW_START

#define BOOT_MAGIC 0

// USB

const static Pin PIN_USB_DM = {.group = 0, .pin = 24, .mux = MUX_PA24G_USB_DM };
const static Pin PIN_USB_DP = {.group = 0, .pin = 25, .mux = MUX_PA25G_USB_DP };

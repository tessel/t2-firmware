#pragma once
#include <parts.h>
#include <io.h>

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

// UUT SWD

const static Pin PIN_RESET = {.group = 0, .pin = 14};
const static Pin PIN_SWDIO = {.group = 1, .pin = 10};
const static Pin PIN_SWCLK = {.group = 1, .pin = 11};

// CURRENT MEASUREMENT

const static Pin PIN_CURRENT_UUT = {.group = 0, .pin = 6, .adc = 6};
const static Pin PIN_CURRENT_USB0 = {.group = 1, .pin = 7, .adc = 15};
const static Pin PIN_CURRENT_USB1 = {.group = 1, .pin = 2, .adc = 10};
const static Pin PIN_CURRENT_PORTA33 = {.group = 1, .pin = 9, .adc = 3};
const static Pin PIN_CURRENT_PORTB33 = {.group = 0, .pin = 7, .adc = 7};

// VOLTAGE MEASUREMENT

const static Pin PIN_VOLTAGE_VREF = {.group = 0, .pin = 3, .adc = 1};
const static Pin PIN_VOLTAGE_5VUSB1 = {.group = 1, .pin = 4, .adc = 12};
const static Pin PIN_VOLTAGE_5VUUT = {.group = 1, .pin = 5, .adc = 13};
const static Pin PIN_VOLTAGE_PORTA33 = {.group = 1, .pin = 6, .adc = 14};
const static Pin PIN_VOLTAGE_12 = {.group = 1, .pin = 8, .adc = 2};
const static Pin PIN_VOLTAGE_33CP = {.group = 0, .pin = 4, .adc = 4};
const static Pin PIN_VOLTAGE_PORTB33 = {.group = 0, .pin = 5, .adc = 5};
const static Pin PIN_VOLTAGE_18 = {.group = 1, .pin = 0, .adc = 8};
const static Pin PIN_VOLTAGE_33MT = {.group = 1, .pin = 1, .adc = 9};
const static Pin PIN_VOLTAGE_5VUSB0 = {.group = 1, .pin = 3, .adc = 11};

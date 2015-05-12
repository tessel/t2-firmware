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


const static Pin ANALOG_PINS[] = {
    // CURRENT MEASUREMENT
    {.group = 0, .pin = 6, .mux = MUX_PA06B_ADC_AIN6,  .chan = 6},  // PIN_CURRENT_UUT
    {.group = 1, .pin = 7, .mux = MUX_PB07B_ADC_AIN15, .chan = 15}, // PIN_CURRENT_USB0
    {.group = 1, .pin = 2, .mux = MUX_PB02B_ADC_AIN10, .chan = 10}, // PIN_CURRENT_USB1
    {.group = 1, .pin = 9, .mux = MUX_PB09B_ADC_AIN3,  .chan = 3},  // PIN_CURRENT_PORTA33
    {.group = 0, .pin = 7, .mux = MUX_PA07B_ADC_AIN7,  .chan = 7},  // PIN_CURRENT_PORTB33

    // VOLTAGE MEASUREMENT
    {.group = 0, .pin = 3, .mux = MUX_PA03B_ADC_AIN1,  .chan = 1},  // PIN_VOLTAGE_VREF
    {.group = 1, .pin = 4, .mux = MUX_PB04B_ADC_AIN12, .chan = 12}, // PIN_VOLTAGE_5VUSB1
    {.group = 1, .pin = 5, .mux = MUX_PB05B_ADC_AIN13, .chan = 13}, // PIN_VOLTAGE_5VUUT
    {.group = 1, .pin = 6, .mux = MUX_PB06B_ADC_AIN14, .chan = 14}, // PIN_VOLTAGE_PORTA33
    {.group = 1, .pin = 8, .mux = MUX_PB08B_ADC_AIN2,  .chan = 2},  // PIN_VOLTAGE_12
    {.group = 0, .pin = 4, .mux = MUX_PA04B_ADC_AIN4,  .chan = 4},  // PIN_VOLTAGE_33CP
    {.group = 0, .pin = 5, .mux = MUX_PA05B_ADC_AIN5,  .chan = 5},  // PIN_VOLTAGE_PORTB33
    {.group = 1, .pin = 0, .mux = MUX_PB00B_ADC_AIN8,  .chan = 8},  // PIN_VOLTAGE_18
    {.group = 1, .pin = 1, .mux = MUX_PB01B_ADC_AIN9,  .chan = 9},  // PIN_VOLTAGE_33MT
    {.group = 1, .pin = 3, .mux = MUX_PB03B_ADC_AIN11, .chan = 11}, // PIN_VOLTAGE_5VUSB0
};

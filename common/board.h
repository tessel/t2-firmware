#pragma once
#include <samd21g15a.h>

#include "common/util.h"
#include "common/hw.h"

// Pinout

// Peripherals

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

// Power

const static Pin PIN_SOC_RST = {.group = 0, .pin = 2};
const static Pin PIN_SOC_PWR = {.group = 0, .pin = 27};

// Bridge - SPI to SoC and Flash

#define SERCOM_BRIDGE 1

const static Pin PIN_BRIDGE_MOSI = {.group = 0, .pin = 16, .mux = MUX_PA16C_SERCOM1_PAD0 };
const static Pin PIN_BRIDGE_SCK = {.group = 0, .pin = 17, .mux = MUX_PA17C_SERCOM1_PAD1 };
const static Pin PIN_BRIDGE_CS = {.group = 0, .pin = 18, .mux = MUX_PA18C_SERCOM1_PAD2 };
const static Pin PIN_BRIDGE_MISO = {.group = 0, .pin = 19, .mux = MUX_PA19C_SERCOM1_PAD3 };

const static Pin PIN_FLASH_CS = { .group = 0, .pin = 28 };

const static Pin PIN_IRQ = { .group = 0, .pin = 22 };
const static Pin PIN_IRQ2 = { .group = 0, .pin = 23 };

#define BRIDGE_DIPO 0
#define BRIDGE_DOPO 0

#define FLASH_DIPO 0
#define FLASH_DOPO 0

// Terminal - UART to SoC

#define SERCOM_TERMINAL 3

const static Pin PIN_SERIAL_TX = {.group = 0, .pin = 20, .mux = MUX_PA20D_SERCOM3_PAD2 };
const static Pin PIN_SERIAL_RX = {.group = 0, .pin = 21, .mux = MUX_PA21D_SERCOM3_PAD3 };

#define TERMINAL_DOPO 0
#define TERMINAL_DIPO 0

// Port A

#define SERCOM_PORT_A_SPI 5
#define SERCOM_PORT_A_UART_I2C 4

// Port B

#define SERCOM_PORT_B_SPI 0
#define SERCOM_PORT_B_UART_I2C 1

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

const static Pin PIN_SOC_RST = {.group = 0, .pin = 3};
const static Pin PIN_SOC_PWR = {.group = 0, .pin = 27};

const static Pin PIN_LED = {.group = 0, .pin = 6};
const static Pin PIN_BTN = {.group = 1, .pin = 9};

// Bridge - SPI to SoC and Flash

#define SERCOM_BRIDGE 1

const static Pin PIN_BRIDGE_MOSI = {.group = 0, .pin = 16, .mux = MUX_PA16C_SERCOM1_PAD0 };
const static Pin PIN_BRIDGE_SCK = {.group = 0, .pin = 17, .mux = MUX_PA17C_SERCOM1_PAD1 };
const static Pin PIN_BRIDGE_CS = {.group = 0, .pin = 18, .mux = MUX_PA18C_SERCOM1_PAD2 };
const static Pin PIN_BRIDGE_MISO = {.group = 0, .pin = 19, .mux = MUX_PA19C_SERCOM1_PAD3 };

const static Pin PIN_FLASH_CS = { .group = 0, .pin = 28 };

const static Pin PIN_BRIDGE_SYNC = { .group = 0, .pin = 22 };
const static Pin PIN_BRIDGE_IRQ = { .group = 0, .pin = 23 };

#define BRIDGE_DIPO 0
#define BRIDGE_DOPO 2

#define FLASH_DIPO 3
#define FLASH_DOPO 0

// Terminal - UART to SoC

#define SERCOM_TERMINAL 3

const static Pin PIN_SERIAL_TX = {.group = 0, .pin = 20, .mux = MUX_PA20D_SERCOM3_PAD2 };
const static Pin PIN_SERIAL_RX = {.group = 0, .pin = 21, .mux = MUX_PA21D_SERCOM3_PAD3 };

#define TERMINAL_TXPO 1
#define TERMINAL_RXPO 3

typedef struct TesselPort {
    union {
        struct {
            Pin scl;
            Pin sda;
            Pin sck;
            Pin miso;
            Pin mosi;
            Pin tx;
            Pin rx;
            Pin g3;
        };
        Pin gpio[8];
    };
    Pin power;
    SercomId spi;
    SercomId uart_i2c;
    u16 pin_interrupts;
    u32 spi_dopo;
    u32 spi_dipo;
    u32 uart_dopo;
    u32 uart_dipo;
} TesselPort;

#define SERCOM_PORT_A_SPI 5
#define SERCOM_PORT_A_UART_I2C 4
#define SERCOM_PORT_B_SPI 0
#define SERCOM_PORT_B_UART_I2C 2

const static TesselPort PORT_A = {
    .scl =  {.group = 0, .pin = 13, .mux = MUX_PA13D_SERCOM4_PAD1 },
    .sda =  {.group = 0, .pin = 12, .mux = MUX_PA12D_SERCOM4_PAD0 },
    .sck =  {.group = 1, .pin = 23, .mux = MUX_PB23D_SERCOM5_PAD3 },
    .miso = {.group = 1, .pin = 22, .mux = MUX_PB22D_SERCOM5_PAD2 },
    .mosi = {.group = 1, .pin = 2,  .mux = MUX_PB02D_SERCOM5_PAD0 },
    .tx =   {.group = 0, .pin = 14, .mux = MUX_PA14D_SERCOM4_PAD2 },
    .rx =   {.group = 0, .pin = 15, .mux = MUX_PA15D_SERCOM4_PAD3 },
    .g3 =   {.group = 1, .pin = 8 },
    .pin_interrupts
        = (1 << (23 & 0xf)) // GPIO 2
        | (1 << (14 & 0xf)) // GPIO 5
        | (1 << (15 & 0xf)) // GPIO 6
        | (1 << (8  & 0xf)), // GPIO 7
    .power = {.group = 1, .pin = 10},
    .spi = SERCOM_PORT_A_SPI,
    .uart_i2c = SERCOM_PORT_A_UART_I2C,
    .spi_dipo = 2,
    .spi_dopo = 3,
    .uart_dipo = 3,
    .uart_dopo = 1,
};

const static TesselPort PORT_B = {
    .scl =  {.group = 0, .pin = 9,  .mux = MUX_PA09D_SERCOM2_PAD1 },
    .sda =  {.group = 0, .pin = 8,  .mux = MUX_PA08D_SERCOM2_PAD0 },
    .sck =  {.group = 0, .pin = 5,  .mux = MUX_PA05D_SERCOM0_PAD1 },
    .miso = {.group = 0, .pin = 7,  .mux = MUX_PA07D_SERCOM0_PAD3 },
    .mosi = {.group = 0, .pin = 4,  .mux = MUX_PA04D_SERCOM0_PAD0 },
    .tx =   {.group = 0, .pin = 10, .mux = MUX_PA10D_SERCOM2_PAD2 },
    .rx =   {.group = 0, .pin = 11, .mux = MUX_PA11D_SERCOM2_PAD3 },
    .g3 =   {.group = 0, .pin = 2 },
    .pin_interrupts
        = (1 << (5  & 0xf)) // GPIO 2
        | (1 << (10 & 0xf)) // GPIO 5
        | (1 << (11 & 0xf)) // GPIO 6
        | (1 << (2  & 0xf)), // GPIO 7
    .power = {.group = 1, .pin = 11},
    .spi = SERCOM_PORT_B_SPI,
    .uart_i2c = SERCOM_PORT_B_UART_I2C,
    .spi_dipo = 3,
    .spi_dopo = 0,
    .uart_dipo = 3,
    .uart_dopo = 1,
};

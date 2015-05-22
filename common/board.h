#pragma once
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

const static Pin PIN_USB_DM = {.group = 0, .pin = 24, .mux = MUX_PA24G_USB_DM };
const static Pin PIN_USB_DP = {.group = 0, .pin = 25, .mux = MUX_PA25G_USB_DP };

const static Pin PIN_LED[] = {
    {.group = 0, .pin = 19},
    {.group = 0, .pin = 22},
    {.group = 0, .pin = 23},
};

const static Pin PIN_DAC = {.group = 0, .pin = 2, .mux = MUX_PA02B_DAC_VOUT };
const static Pin PIN_ADC_P = {.group = 0, .pin = 3, .mux = MUX_PA03B_ADC_AIN1, .chan = 1 };
const static Pin PIN_ADC_U = {.group = 0, .pin = 4, .mux = MUX_PA04B_ADC_AIN4, .chan = 4 };

const static Pin PIN_EN_A = {.group = 0, .pin = 27};
const static Pin PIN_EN_B = {.group = 0, .pin = 18};
const static Pin PIN_EN_REG = {.group = 0, .pin = 28};


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

#define SERCOM_PORT_A_SPI 0
#define SERCOM_PORT_A_I2C 1
#define SERCOM_PORT_A_UART 2

const static TesselPort PORT_A = {
    .scl =  {.group = 0, .pin = 17, .mux = MUX_PA17C_SERCOM1_PAD1 },
    .sda =  {.group = 0, .pin = 16, .mux = MUX_PA16C_SERCOM1_PAD0 },
    .sck =  {.group = 0, .pin = 11, .mux = MUX_PA11C_SERCOM0_PAD3 },
    .miso = {.group = 0, .pin = 10, .mux = MUX_PA10C_SERCOM0_PAD2 },
    .mosi = {.group = 0, .pin = 8,  .mux = MUX_PA08C_SERCOM0_PAD0 },
    .tx =   {.group = 0, .pin = 14, .mux = MUX_PA14C_SERCOM2_PAD2 },
    .rx =   {.group = 0, .pin = 15, .mux = MUX_PA15C_SERCOM2_PAD3 },
    .g3 =   {.group = 0, .pin = 9 },
    .pin_interrupts
        = (1 << (17 & 0xf))
        | (1 << (16 & 0xf))
        | (1 << (11 & 0xf))
        | (1 << (10  & 0xf))
        | (1 << (14  & 0xf))
        | (1 << (15  & 0xf))
        | (1 << (9  & 0xf)),
    .power = {.group = 0, .pin = 28},
    .spi = SERCOM_PORT_A_SPI,
    .uart_i2c = SERCOM_PORT_A_I2C,
    .spi_dipo = 2,
    .spi_dopo = 3,
    .uart_dipo = 3,
    .uart_dopo = 1,
};

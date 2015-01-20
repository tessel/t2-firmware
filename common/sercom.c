#include "board.h"

inline static void sercom_reset(SercomId id) {
    PM->APBCMASK.reg |= 1 << (PM_APBCMASK_SERCOM0_Pos + id);

    GCLK->CLKCTRL.reg = GCLK_CLKCTRL_CLKEN |
        GCLK_CLKCTRL_GEN(0) |
        GCLK_CLKCTRL_ID(SERCOM0_GCLK_ID_CORE + id);

    sercom(id)->SPI.CTRLA.reg = SERCOM_SPI_CTRLA_SWRST;
    while(sercom(id)->SPI.CTRLA.reg & SERCOM_SPI_CTRLA_SWRST);
}

void sercom_spi_slave_init(SercomId id, u32 dipo, u32 dopo, bool cpol, bool cpha) {
    sercom_reset(id);
    sercom(id)->SPI.CTRLA.reg = SERCOM_SPI_CTRLA_MODE_SPI_SLAVE;

    sercom(id)->SPI.CTRLB.reg
      = SERCOM_SPI_CTRLB_RXEN
      | SERCOM_SPI_CTRLB_SSDE
      | SERCOM_SPI_CTRLB_PLOADEN;

    sercom(id)->SPI.CTRLA.reg
      = SERCOM_SPI_CTRLA_ENABLE
      | SERCOM_SPI_CTRLA_MODE_SPI_SLAVE
      | SERCOM_SPI_CTRLA_DIPO(dipo)
      | SERCOM_SPI_CTRLA_DOPO(dopo)
      | (cpol ? SERCOM_SPI_CTRLA_CPOL : 0)
      | (cpha ? SERCOM_SPI_CTRLA_CPHA : 0);
}

void sercom_spi_master_init(SercomId id, u32 dipo, u32 dopo, bool cpol, bool cpha) {
    sercom_reset(id);
    sercom(id)->SPI.CTRLA.reg = SERCOM_SPI_CTRLA_MODE_SPI_MASTER;

    sercom(id)->SPI.CTRLB.reg
      = SERCOM_SPI_CTRLB_RXEN
      | SERCOM_SPI_CTRLB_SSDE;

    sercom(id)->SPI.BAUD.reg = 2; // 9.6MHz -- TODO: adjustable

    sercom(id)->SPI.CTRLA.reg
      = SERCOM_SPI_CTRLA_ENABLE
      | SERCOM_SPI_CTRLA_MODE_SPI_MASTER
      | SERCOM_SPI_CTRLA_DIPO(dipo)
      | SERCOM_SPI_CTRLA_DOPO(dopo)
      | (cpol ? SERCOM_SPI_CTRLA_CPOL : 0)
      | (cpha ? SERCOM_SPI_CTRLA_CPHA : 0);

}

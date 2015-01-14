#include "firmware.h"

USB_ENDPOINTS(3);

int main(void) {
    clock_init();

    pin_mux(PIN_USB_DM);
    pin_mux(PIN_USB_DP);
    usb_init();
    usb_attach();

    pin_high(PIN_SOC_RST);
    pin_out(PIN_SOC_RST);

    dma_init();
    NVIC_EnableIRQ(DMAC_IRQn);

    __enable_irq();
    SCB->SCR |= SCB_SCR_SLEEPONEXIT_Msk;
    while (1) { __WFI(); }
}

void DMAC_Handler() {
    u32 intpend = DMAC->INTPEND.reg;
    if (intpend & DMAC_INTPEND_TCMPL) {
        u32 id = intpend & DMAC_INTPEND_ID_Msk;

        if (id == DMA_FLASH_RX) {
            flash_dma_rx_completion();
        }
    }

    if (intpend & (DMAC_INTPEND_TERR | DMAC_INTPEND_SUSP)) {
        invalid();
    }

    DMAC->INTPEND.reg = intpend;
}

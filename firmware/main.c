#include "firmware.h"

u8 test_buf[256];

int main(void) {
    clock_init();

    pin_mux(PIN_USB_DM);
    pin_mux(PIN_USB_DP);
    usb_init();
    usb_attach();
    NVIC_SetPriority(USB_IRQn, 0xff);

    pin_high(PIN_SOC_RST);
    pin_out(PIN_SOC_RST);

    pin_high(PIN_SOC_PWR);
    pin_out(PIN_SOC_PWR);

    pin_high(PIN_PORT_A_PWR);
    pin_out(PIN_PORT_A_PWR);

    pin_high(PIN_PORT_B_PWR);
    pin_out(PIN_PORT_B_PWR);

    pin_pull_up(PIN_BRIDGE_CS);
    pin_pull_up(PIN_FLASH_CS);

    dma_init();
    NVIC_EnableIRQ(DMAC_IRQn);
    NVIC_SetPriority(DMAC_IRQn, 0xff);

    eic_init();
    NVIC_EnableIRQ(EIC_IRQn);
    NVIC_SetPriority(EIC_IRQn, 0xff);

    evsys_init();
    NVIC_EnableIRQ(EVSYS_IRQn);
    NVIC_SetPriority(EVSYS_IRQn, 0);

    bridge_init();
    bridge_start_out(0, &test_buf[0]);

    ports_init();

    __enable_irq();
    SCB->SCR |= SCB_SCR_SLEEPONEXIT_Msk;
    while (1) { __WFI(); }
}

void DMAC_Handler() {
    u32 intpend = DMAC->INTPEND.reg;
    if (intpend & DMAC_INTPEND_TCMPL) {
        u32 id = intpend & DMAC_INTPEND_ID_Msk;

        if (id == DMA_FLASH_RX) {
            bridge_dma_rx_completion();
            flash_dma_rx_completion();
        }
    }

    if (intpend & (DMAC_INTPEND_TERR | DMAC_INTPEND_SUSP)) {
        invalid();
    }

    DMAC->INTPEND.reg = intpend;
}

void EIC_Handler() {
    invalid();
}

void EVSYS_Handler() {
    if (EVSYS->INTFLAG.reg & EVSYS_EVD(EVSYS_BRIDGE_SYNC)) {
        EVSYS->INTFLAG.reg = EVSYS_EVD(EVSYS_BRIDGE_SYNC);
        bridge_handle_sync();
    } else {
        invalid();
    }
}

void bridge_completion_out_0(u8 count) {
    bridge_start_in(0, &test_buf[0], count);
}


void bridge_completion_in_0() {
    bridge_start_out(0, &test_buf[0]);
}

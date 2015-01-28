#include "firmware.h"

USB_ENDPOINTS(3);

u8 test_buf0[256];
u8 test_buf1[256];

int main(void) {
    clock_init();

    pin_mux(PIN_USB_DM);
    pin_mux(PIN_USB_DP);
    usb_init();
    usb_attach();

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

    port_init(&PORT_A);
    port_init(&PORT_B);

    dma_init();
    NVIC_EnableIRQ(DMAC_IRQn);

    eic_init();
    NVIC_EnableIRQ(EIC_IRQn);

    evsys_init();
    NVIC_EnableIRQ(EVSYS_IRQn);

    bridge_init();
    bridge_start_out(0, &test_buf0[0]);
    bridge_start_out(1, &test_buf1[0]);

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

void bridge_completion_out_0(u8 _) {
    bridge_start_out(0, &test_buf0[0]);
}
void bridge_completion_out_1(u8 count) {
    bridge_start_in(1, &test_buf1[0], count);
}
void bridge_completion_out_2(u8 _) {}

void bridge_completion_in_0() {}
void bridge_completion_in_1() {
    bridge_start_out(1, &test_buf1[0]);
}
void bridge_completion_in_2() {}

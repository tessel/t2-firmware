#include "test_rig.h"

int main(void) {
    clock_init_usb();

    pin_mux(PIN_USB_DM);
    pin_mux(PIN_USB_DP);
    usb_init();
    usb_attach();
    NVIC_SetPriority(USB_IRQn, 0xff);

    dma_init();
    NVIC_EnableIRQ(DMAC_IRQn);
    NVIC_SetPriority(DMAC_IRQn, 0xff);

    eic_init();
    NVIC_EnableIRQ(EIC_IRQn);
    NVIC_SetPriority(EIC_IRQn, 0xff);

    evsys_init();
    NVIC_EnableIRQ(EVSYS_IRQn);
    NVIC_SetPriority(EVSYS_IRQn, 0);

    __enable_irq();
    SCB->SCR |= SCB_SCR_SLEEPONEXIT_Msk;
    while (1) { __WFI(); }
}

void DMAC_Handler() {
    u32 intpend = DMAC->INTPEND.reg;
    if (intpend & DMAC_INTPEND_TCMPL) {
        u32 id = intpend & DMAC_INTPEND_ID_Msk;
        (void) id;
    }

    if (intpend & (DMAC_INTPEND_TERR | DMAC_INTPEND_SUSP)) {
        invalid();
    }

    DMAC->INTPEND.reg = intpend;
}

void EIC_Handler() {
    u32 flags = EIC->INTFLAG.reg;
    (void) flags;
}

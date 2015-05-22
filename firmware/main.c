#include "firmware.h"

PortData port_a;

int main(void) {
    clock_init_usb(GCLK_SYSTEM);

    pin_mux(PIN_USB_DM);
    pin_mux(PIN_USB_DP);
    usb_init();
    usb_attach();
    NVIC_SetPriority(USB_IRQn, 0xff);

    for (int i = 0; i<3; i++) {
        pin_high(PIN_LED[i]);
        pin_out(PIN_LED[i]);
    }

    pin_high(PIN_EN_A);
    pin_high(PIN_EN_B);
    pin_low(PIN_EN_REG);
    pin_out(PIN_EN_A);
    pin_out(PIN_EN_B);
    pin_out(PIN_EN_REG);

    pin_mux(PIN_ADC_P);
    pin_mux(PIN_ADC_U);
    pin_mux(PIN_DAC);

    dma_init();
    NVIC_EnableIRQ(DMAC_IRQn);
    NVIC_SetPriority(DMAC_IRQn, 0xff);

    eic_init();
    NVIC_EnableIRQ(EIC_IRQn);
    NVIC_SetPriority(EIC_IRQn, 0xff);

    evsys_init();
    NVIC_EnableIRQ(EVSYS_IRQn);
    NVIC_SetPriority(EVSYS_IRQn, 0);

    adc_init(GCLK_SYSTEM);
    dac_init(GCLK_32K);

    DAC->CTRLB.reg = DAC_CTRLB_EOEN | DAC_CTRLB_REFSEL_AVCC;
    DAC->DATA.reg = 380; // 3.3V
    DAC->CTRLA.reg = DAC_CTRLA_ENABLE;

    port_init(&port_a, 1, &PORT_A, GCLK_PORT_A,
        TCC_PORT_A, DMA_PORT_A_TX, DMA_PORT_A_RX);

    __enable_irq();
    SCB->SCR |= SCB_SCR_SLEEPONEXIT_Msk;
    while (1) { __WFI(); }
}

void DMAC_Handler() {
    u32 intpend = DMAC->INTPEND.reg;
    if (intpend & DMAC_INTPEND_TCMPL) {
        u32 id = intpend & DMAC_INTPEND_ID_Msk;

        if (id == DMA_PORT_A_TX) {
            port_dma_tx_completion(&port_a);
        } else if (id == DMA_PORT_A_RX) {
            port_dma_rx_completion(&port_a);
        }
    }

    if (intpend & (DMAC_INTPEND_TERR | DMAC_INTPEND_SUSP)) {
        invalid();
    }

    DMAC->INTPEND.reg = intpend;
}

void EIC_Handler() {
    u32 flags = EIC->INTFLAG.reg;
    if (flags & PORT_A.pin_interrupts) {
        port_handle_extint(&port_a, flags);
    }
}

void SERCOM_HANDLER(SERCOM_PORT_A_I2C) {
    bridge_handle_sercom_uart_i2c(&port_a);
}

void TCC_HANDLER(TCC_PORT_A) {
    uart_send_data(&port_a);

    // clear irq
    tcc(TCC_PORT_A)->INTFLAG.reg = TCC_INTENSET_OVF;
}

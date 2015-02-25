#include "firmware.h"

u8 test_buf[256];

PortData port_a;
PortData port_b;

int main(void) {
    clock_init_crystal();

    pin_mux(PIN_USB_DM);
    pin_mux(PIN_USB_DP);
    usb_init();
    usb_attach();
    NVIC_SetPriority(USB_IRQn, 0xff);

    pin_high(PIN_LED);
    pin_out(PIN_LED);

    pin_high(PIN_SOC_RST);
    pin_out(PIN_SOC_RST);

    pin_high(PIN_SOC_PWR);
    pin_out(PIN_SOC_PWR);

    pin_low(PORT_A.power);
    pin_out(PORT_A.power);

    pin_low(PORT_B.power);
    pin_out(PORT_B.power);

    pin_pull_up(PIN_BRIDGE_CS);
    pin_pull_up(PIN_FLASH_CS);

    pin_pull_up(PIN_SERIAL_TX);
    pin_pull_up(PIN_SERIAL_RX);

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

    port_init(&port_a, 1, &PORT_A, DMA_PORT_A_TX, DMA_PORT_A_RX);
    port_init(&port_b, 2, &PORT_B, DMA_PORT_B_TX, DMA_PORT_B_RX);

    __enable_irq();
    SCB->SCR |= SCB_SCR_SLEEPONEXIT_Msk;
    while (1) { __WFI(); }
}

void DMAC_Handler() {
    u32 intpend = DMAC->INTPEND.reg;
    if (intpend & DMAC_INTPEND_TCMPL) {
        u32 id = intpend & DMAC_INTPEND_ID_Msk;

        if (id == DMA_BRIDGE_RX) {
            bridge_dma_rx_completion();
            flash_dma_rx_completion();
        } else if (id == DMA_PORT_A_RX) {
            port_dma_rx_completion(&port_a);
        } else if (id == DMA_PORT_B_RX) {
            port_dma_rx_completion(&port_b);
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

void SERCOM_HANDLER(SERCOM_PORT_A_UART_I2C) {
    bridge_handle_sercom_uart_i2c(&port_a);
}

void SERCOM_HANDLER(SERCOM_PORT_B_UART_I2C) {
    bridge_handle_sercom_uart_i2c(&port_b);
}

void bridge_completion_out_0(u8 count) {
    bridge_start_in(0, &test_buf[0], count);
}
void bridge_completion_in_0() {
    bridge_start_out(0, &test_buf[0]);
}
void bridge_completion_out_1(u8 count) {
    port_bridge_out_completion(&port_a, count);
}
void bridge_completion_in_1() {
    port_bridge_in_completion(&port_a);
}
void bridge_completion_out_2(u8 count) {
    port_bridge_out_completion(&port_b, count);
}
void bridge_completion_in_2() {
    port_bridge_in_completion(&port_b);
}

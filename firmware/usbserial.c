#include "firmware.h"

#define BUF_SIZE 64

u8 usbserial_active_rx_buf = 0;
u8 usbserial_sending_in = 0;
USB_ALIGN u8 usbserial_buf_in[2][64];
USB_ALIGN u8 usbserial_buf_out[64];

void usbserial_init() {
    sercom_clock_enable(SERCOM_TERMINAL, GCLK_SYSTEM, 1);
    pin_mux(PIN_SERIAL_TX);
    pin_mux(PIN_SERIAL_RX);
    sercom_uart_init(SERCOM_TERMINAL, TERMINAL_RXPO, TERMINAL_TXPO, 63019);

    dma_sercom_configure_tx(DMA_TERMINAL_TX, SERCOM_TERMINAL);
    DMAC->CHINTENSET.reg = DMAC_CHINTENSET_TCMPL | DMAC_CHINTENSET_TERR; // ID depends on prev call

    dma_sercom_configure_rx(DMA_TERMINAL_RX, SERCOM_TERMINAL);
    DMAC->CHINTENSET.reg = DMAC_CHINTENSET_TCMPL | DMAC_CHINTENSET_TERR; // ID depends on prev call
    DMAC->CHCTRLB.bit.EVOE = 1;

    // Set up timer to (re)start counting when a character is received. When it times out, the
    // interrupt flushes the receive buffer.
    timer_clock_enable(TC_TERMINAL_TIMEOUT);
    tc(TC_TERMINAL_TIMEOUT)->COUNT16.CTRLA.reg
        = TC_CTRLA_WAVEGEN_MPWM
        | TC_CTRLA_PRESCALER_DIV1024;

    tc(TC_TERMINAL_TIMEOUT)->COUNT16.CTRLBSET.reg
        = TC_CTRLBSET_ONESHOT
        | TC_CTRLBSET_DIR;

    tc(TC_TERMINAL_TIMEOUT)->COUNT16.EVCTRL.reg
        = TC_EVCTRL_EVACT_RETRIGGER
        | TC_EVCTRL_TCEI;

    tc(TC_TERMINAL_TIMEOUT)->COUNT16.DBGCTRL.reg = TC_DBGCTRL_DBGRUN;
    tc(TC_TERMINAL_TIMEOUT)->COUNT16.CC[0].reg = 48 * 10;

    while (tc(TC_TERMINAL_TIMEOUT)->COUNT16.STATUS.bit.SYNCBUSY);

    tc(TC_TERMINAL_TIMEOUT)->COUNT16.CTRLA.bit.ENABLE = 1;
    tc(TC_TERMINAL_TIMEOUT)->COUNT16.INTENSET.reg = TC_INTENSET_OVF;
    NVIC_EnableIRQ(TC3_IRQn + TC_TERMINAL_TIMEOUT - 3);
    NVIC_SetPriority(TC3_IRQn + TC_TERMINAL_TIMEOUT - 3, 0xff);

    evsys_config(EVSYS_TERMINAL_TIMEOUT,
        EVSYS_ID_GEN_DMAC_CH_0 + DMA_TERMINAL_RX,
        EVSYS_ID_USER_TC3_EVU + TC_TERMINAL_TIMEOUT - 3);

    usbserial_active_rx_buf = 0;
    usbserial_sending_in = false;
    dma_sercom_start_rx(DMA_TERMINAL_RX, SERCOM_TERMINAL, usbserial_buf_in[0], BUF_SIZE);

    usb_enable_ep(USB_EP_CDC_NOTIFICATION, USB_EP_TYPE_INTERRUPT, 8);
    usb_enable_ep(USB_EP_CDC_OUT, USB_EP_TYPE_BULK, 64);
    usb_enable_ep(USB_EP_CDC_IN, USB_EP_TYPE_BULK, 64);

    usb_ep_start_out(USB_EP_CDC_OUT, usbserial_buf_out, BUF_SIZE);
}

void usbserial_out_completion() {
    u32 len = usb_ep_out_length(USB_EP_CDC_OUT);
    dma_sercom_start_tx(DMA_TERMINAL_TX, SERCOM_TERMINAL, usbserial_buf_out, len);
}

void usbserial_dma_tx_completion() {
    usb_ep_start_out(USB_EP_CDC_OUT, usbserial_buf_out, BUF_SIZE);
}

void usbserial_rx_flush() {
    dma_abort(DMA_TERMINAL_RX);

    tc(TC_TERMINAL_TIMEOUT)->COUNT16.INTENCLR.reg = TC_INTENSET_OVF;
    tc(TC_TERMINAL_TIMEOUT)->COUNT16.INTFLAG.reg = TC_INTFLAG_OVF;

    if (!usbserial_sending_in) {
        u32 size = BUF_SIZE - dma_remaining(DMA_TERMINAL_RX);
        usb_ep_start_in(USB_EP_CDC_IN, usbserial_buf_in[usbserial_active_rx_buf], size, false);
        usbserial_sending_in = true;
        usbserial_active_rx_buf ^= 1;
    }

    dma_sercom_start_rx(DMA_TERMINAL_RX, SERCOM_TERMINAL, usbserial_buf_in[usbserial_active_rx_buf], BUF_SIZE);
}

void usbserial_dma_rx_completion() {
    usbserial_rx_flush();
}

void usbserial_handle_tc() {
    if (tc(TC_TERMINAL_TIMEOUT)->COUNT16.INTFLAG.bit.OVF) {
        usbserial_rx_flush();
    }
}

void usbserial_in_completion() {
    usbserial_sending_in = false;
    tc(TC_TERMINAL_TIMEOUT)->COUNT16.INTENSET.reg = TC_INTENSET_OVF;
}

void usbserial_disable() {
    usb_disable_ep(USB_EP_CDC_NOTIFICATION);
    usb_disable_ep(USB_EP_CDC_OUT);
    usb_disable_ep(USB_EP_CDC_IN);
}

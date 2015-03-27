#include "firmware.h"

#define FLASH_BUFFER_SIZE 64

USB_ALIGN u8 flash_buffer_out[FLASH_BUFFER_SIZE];
USB_ALIGN u8 flash_buffer_in[FLASH_BUFFER_SIZE];
u8 flash_buffer_count;

typedef enum FlashState {
    FLASH_STATE_DISABLE,

    FLASH_STATE_IDLE,   // Waiting for a USB packet OUT
    FLASH_STATE_ACTIVE, // DMA to and from SPI
    FLASH_STATE_REPLY,  // Waiting to send reply IN
} FlashState;

FlashState flash_state = FLASH_STATE_DISABLE;

void flash_init() {
    usb_enable_ep(USB_EP_FLASH_OUT, USB_EP_TYPE_BULK, 64);
    usb_enable_ep(USB_EP_FLASH_IN, USB_EP_TYPE_BULK, 64);

    sercom_spi_master_init(SERCOM_BRIDGE, FLASH_DIPO, FLASH_DOPO, 0, 0, 2);
    dma_sercom_configure_tx(DMA_FLASH_TX, SERCOM_BRIDGE);
    dma_sercom_configure_rx(DMA_FLASH_RX, SERCOM_BRIDGE);
    DMAC->CHINTENSET.reg = DMAC_CHINTENSET_TCMPL | DMAC_CHINTENSET_TERR; // ID depends on prev call

    pin_low(PIN_SOC_RST);
    pin_out(PIN_SOC_RST);

    pin_mux(PIN_BRIDGE_MOSI);
    pin_mux(PIN_BRIDGE_MISO);
    pin_mux(PIN_BRIDGE_SCK);
    pin_high(PIN_FLASH_CS);
    pin_out(PIN_FLASH_CS);

    flash_state = FLASH_STATE_IDLE;
    usb_ep_start_out(USB_EP_FLASH_OUT, flash_buffer_out, FLASH_BUFFER_SIZE);
}

void flash_disable() {
    dma_abort(DMA_FLASH_TX);
    dma_abort(DMA_FLASH_RX);

    pin_in(PIN_BRIDGE_MOSI);
    pin_in(PIN_BRIDGE_MISO);
    pin_in(PIN_BRIDGE_SCK);
    pin_in(PIN_FLASH_CS);

    usb_disable_ep(USB_EP_FLASH_IN);
    usb_disable_ep(USB_EP_FLASH_OUT);

    // Leave RST low until manually enabled

    flash_state = FLASH_STATE_DISABLE;
}

void flash_usb_out_completion() {
    if (flash_state == FLASH_STATE_IDLE) {
        flash_buffer_count = usb_ep_out_length(USB_EP_FLASH_OUT);

        if (flash_buffer_count > 0) {
            pin_low(PIN_FLASH_CS);

            flash_state = FLASH_STATE_ACTIVE;
            dma_sercom_start_rx(DMA_FLASH_RX, SERCOM_BRIDGE, flash_buffer_in, flash_buffer_count);
            dma_sercom_start_tx(DMA_FLASH_TX, SERCOM_BRIDGE, flash_buffer_out, flash_buffer_count);
        } else {
            pin_high(PIN_FLASH_CS);

            flash_state = FLASH_STATE_IDLE;
            usb_ep_start_in(USB_EP_FLASH_IN, flash_buffer_in, flash_buffer_count, false);
        }
    } else {
        invalid();
    }

}

void flash_dma_rx_completion() {
    if (flash_state == FLASH_STATE_DISABLE) {
        return;
    } else if (flash_state == FLASH_STATE_ACTIVE) {
        usb_ep_start_in(USB_EP_FLASH_IN, flash_buffer_in, flash_buffer_count, false);
        if (flash_buffer_count < FLASH_BUFFER_SIZE) {
            pin_high(PIN_FLASH_CS);
        }
        flash_state = FLASH_STATE_REPLY;
    } else {
        invalid();
    }
}

void flash_usb_in_completion() {
    if (flash_state == FLASH_STATE_REPLY) {
        usb_ep_start_out(USB_EP_FLASH_OUT, flash_buffer_out, FLASH_BUFFER_SIZE);
        flash_state = FLASH_STATE_IDLE;
    } else {
        invalid();
    }
}

#include "firmware.h"

// # Access to SPI flash over USB.
// ## Protocol details
// The flash protocol exists as an alternate setting of the interface (see usb.c). This
// altsetting contains one IN endpoint and one OUT endpoint.
//
// The host begins by sending a transfer of up to 511 bytes on the OUT endpoint. The first 4 bytes
// of the transfer form a header consisting of a 24-bit little-endian integer and a flags byte.
//
// Byte 0: in_count[7..0]
// Byte 1: in_count[15..8]
// Byte 2: in_count[23..16]
// Byte 3, bit 0: SR_POLL flag
// Byte 3, bit 1: WREN flag
//
// 1. If the SR_POLL flag is set, the firmware issues a READSR (0x05) command to the flash, and
//    reads bytes until bit 1 ("write in progress") is not set.
// 2. If the WREN flag is set, the firmware issues a WREN (0x06) command to the flash.
// 3. The remainder (after the 4-byte header) of the OUT transfer after the header is sent on
//    the SPI bus.
// 4. `in_count` bytes are read from SPI and sent to the IN endpoint

u32 flash_in_count;
u32 flash_out_count;
bool flash_flag_sr_poll;
bool flash_flag_wren;
u8 flash_byte;


typedef enum FlashState {
    FLASH_STATE_DISABLE,

    //                                   +---+
    //                                   v   |
    // +> IDLE ---> SR_POLL_OUT ----> SR_POLL_IN
    // |   |                              |
    // |   +------- WREN_OUT  <-----------+
    // |   v
    // |  OUT --> IN_SPI --> IN_USB +
    // |            ^               |
    // +------------+---------------+
    // (diagram assumes SR_POLL == WREN_OUT)
    FLASH_STATE_IDLE,   // Waiting for a USB packet OUT
    FLASH_STATE_OUT, // Waiting on DMA write to SPI
    FLASH_STATE_IN_SPI,  // Waiting on DMA read from SPI
    FLASH_STATE_IN_USB,  // Waiting on USB IN transfer
    FLASH_STATE_SR_POLL_OUT, // Waiting to write READSR command
    FLASH_STATE_SR_POLL_IN, // Waiting to read status register
    FLASH_STATE_WREN_OUT, // Waiting to write WREN command
} FlashState;

FlashState flash_state = FLASH_STATE_DISABLE;

void flash_init() {
    usb_enable_ep(USB_EP_FLASH_OUT, USB_EP_TYPE_BULK, 64);
    usb_enable_ep(USB_EP_FLASH_IN, USB_EP_TYPE_BULK, 64);

    sercom_spi_master_init(SERCOM_BRIDGE, FLASH_DIPO, FLASH_DOPO, 0, 0, SERCOM_SPI_BAUD_12MHZ);
    dma_sercom_configure_tx(DMA_FLASH_TX, SERCOM_BRIDGE);
    dma_sercom_configure_rx(DMA_FLASH_RX, SERCOM_BRIDGE);
    dma_enable_interrupt(DMA_FLASH_RX);

    pin_low(PIN_SOC_RST);
    pin_out(PIN_SOC_RST);

    pin_mux(PIN_BRIDGE_MOSI);
    pin_mux(PIN_BRIDGE_MISO);
    pin_mux(PIN_BRIDGE_SCK);
    pin_high(PIN_FLASH_CS);
    pin_out(PIN_FLASH_CS);

    flash_state = FLASH_STATE_IDLE;
    usb_ep_start_out(USB_EP_FLASH_OUT, flash_buffer, FLASH_BUFFER_SIZE);
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

    flash_state = FLASH_STATE_DISABLE;
    // Leaves RST low until manually enabled
}

u32 flash_in_packet_len() {
    return (flash_in_count > FLASH_BUFFER_SIZE) ? FLASH_BUFFER_SIZE : flash_in_count;
}
void flash_start_read();
void flash_start_write();
void flash_start_sr_poll();
void flash_start_wren();

void flash_usb_out_completion() {
    if (flash_state == FLASH_STATE_IDLE) {
        u32 flash_buffer_count = usb_ep_out_length(USB_EP_FLASH_OUT);

        if (flash_buffer_count < 4) {
            // Invalid packet has no header
            return;
        }

        flash_out_count = flash_buffer_count - 4;
        flash_in_count = flash_buffer[0] << 0 | flash_buffer[1] << 8 | flash_buffer[2] << 16;
        flash_flag_sr_poll = flash_buffer[3] & 0x1;
        flash_flag_wren = flash_buffer[3] & 0x2;

        flash_start_sr_poll();
    } else {
        invalid();
    }

}

void flash_start_sr_poll() {
    if (flash_flag_sr_poll) {
        pin_low(PIN_FLASH_CS);
        flash_byte = 0x05;
        dma_sercom_start_rx(DMA_FLASH_RX, SERCOM_BRIDGE, NULL, 1);
        dma_sercom_start_tx(DMA_FLASH_TX, SERCOM_BRIDGE, &flash_byte, 1);
        flash_state = FLASH_STATE_SR_POLL_OUT;
    } else {
        flash_start_wren();
    }
}

void flash_read_sr_poll() {
    dma_sercom_start_rx(DMA_FLASH_RX, SERCOM_BRIDGE, &flash_byte, 1);
    dma_sercom_start_tx(DMA_FLASH_TX, SERCOM_BRIDGE, NULL, 1);
    flash_state = FLASH_STATE_SR_POLL_IN;
}

void flash_start_wren() {
    if (flash_flag_wren) {
        pin_low(PIN_FLASH_CS);
        flash_byte = 0x06;
        dma_sercom_start_rx(DMA_FLASH_RX, SERCOM_BRIDGE, NULL, 1);
        dma_sercom_start_tx(DMA_FLASH_TX, SERCOM_BRIDGE, &flash_byte, 1);
        flash_state = FLASH_STATE_WREN_OUT;
    } else {
        flash_start_write();
    }
}

void flash_start_write() {
    pin_low(PIN_FLASH_CS);
    if (flash_out_count > 0) {
        dma_sercom_start_rx(DMA_FLASH_RX, SERCOM_BRIDGE, NULL, flash_out_count);
        dma_sercom_start_tx(DMA_FLASH_TX, SERCOM_BRIDGE, flash_buffer+4, flash_out_count);
        flash_state = FLASH_STATE_OUT;
    } else {
        flash_start_read();
    }
}

void flash_start_read() {
    if (flash_in_count > 0) {
        u32 len = flash_in_packet_len();
        dma_sercom_start_rx(DMA_FLASH_RX, SERCOM_BRIDGE, flash_buffer, len);
        dma_sercom_start_tx(DMA_FLASH_TX, SERCOM_BRIDGE, NULL, len);
        flash_state = FLASH_STATE_IN_SPI;
    } else {
        pin_high(PIN_FLASH_CS);
        usb_ep_start_out(USB_EP_FLASH_OUT, flash_buffer, FLASH_BUFFER_SIZE);
        flash_state = FLASH_STATE_IDLE;
    }
}

void flash_dma_rx_completion() {
    if (flash_state == FLASH_STATE_DISABLE) {
        return;
    } else if (flash_state == FLASH_STATE_SR_POLL_OUT) {
        flash_read_sr_poll();
    } else if (flash_state == FLASH_STATE_SR_POLL_IN) {
        if ((flash_byte & 1) == 0) {
            pin_high(PIN_FLASH_CS);
            flash_start_wren();
        } else {
            flash_read_sr_poll();
        }
    } else if (flash_state == FLASH_STATE_WREN_OUT) {
        pin_high(PIN_FLASH_CS);
        flash_start_write();
    } else if (flash_state == FLASH_STATE_OUT) {
        flash_start_read();
    } else if (flash_state == FLASH_STATE_IN_SPI) {
        usb_ep_start_in(USB_EP_FLASH_IN, flash_buffer, flash_in_packet_len(), false);
        flash_state = FLASH_STATE_IN_USB;
    } else {
        invalid();
    }
}

void flash_usb_in_completion() {
    if (flash_state == FLASH_STATE_IN_USB) {
        flash_in_count -= flash_in_packet_len();
        flash_start_read();
    } else {
        invalid();
    }
}

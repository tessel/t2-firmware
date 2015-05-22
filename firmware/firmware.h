#pragma once
#include "common/board.h"
#include "common/hw.h"
#include "samd/usb_samd.h"

/// DMA allocation. Channels 0-3 support EVSYS and are reserved for
/// functions that need it
#define DMA_PORT_A_TX 6
#define DMA_PORT_A_RX 7

/// EVSYS allocation

/// USB Endpoint allocation

#define INTERFACE_VENDOR 0
	#define ALTSETTING_PORT 1
        #define USB_EP_PORT_OUT 0x02
        #define USB_EP_PORT_IN 0x81

    #define ALTSETTING_DAP 2
        #define USB_EP_DAP_HID_OUT 0x02
        #define USB_EP_DAP_HID_IN 0x81
/// Timer allocation

// TCC allocation
#define TCC_PORT_A 0 // PA12, PA13

// GCLK channel allocation
#define GCLK_SYSTEM 0
#define GCLK_32K    2
#define GCLK_PORT_A 3

// port.c

#define BRIDGE_BUF_SIZE 256
#define BRIDGE_ARG_SIZE 5

#define UART_MS_TIMEOUT 10 // send uart data after ms timeout even if buffer is not full
#define UART_RX_SIZE 32

typedef struct UartBuf {
    u8 head;
    u8 tail;
    u8 buf_len;
    u8 rx[UART_RX_SIZE];
} UartBuf;

typedef struct PortData {
    u8 chan;
    const TesselPort* port;
    DmaChan dma_tx;
    DmaChan dma_rx;

    u8 state;
    u8 mode;
    u8 cmd_buf[BRIDGE_BUF_SIZE];
    u8 cmd_len;
    u8 cmd_pos;
    u8 reply_buf[BRIDGE_BUF_SIZE];
    u8 reply_len;
    u8 cmd;
    u8 arg[BRIDGE_ARG_SIZE];
    u8 arg_len;
    u8 arg_pos;
    u8 len;
    u8 clock_channel;
    u8 tcc_channel;
    bool pending_out;
    bool pending_in;
    UartBuf uart_buf;
} PortData;

extern PortData port_a;

void port_init(PortData* p, u8 chan, const TesselPort* port,
    u8 clock_channel, u8 tcc_channel, DmaChan dma_tx, DmaChan dma_rx);
void port_enable(PortData *p);
void port_bridge_out_completion(PortData* p, u8 len);
void port_bridge_in_completion(PortData* p);
void port_dma_rx_completion(PortData* p);
void port_dma_tx_completion(PortData* p);
void bridge_handle_sercom_uart_i2c(PortData* p);
void port_handle_extint(PortData *p, u32 flags);
void port_disable(PortData *p);
void uart_send_data(PortData *p);

// dap_hid.c
void dap_enable();
void dap_disable();
void dap_handle_usb_in_completion();
void dap_handle_usb_out_completion();

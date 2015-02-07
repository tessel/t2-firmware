#pragma once
#include "common/board.h"
#include "common/hw.h"
#include "samd/usb_samd.h"

/// DMA allocation
#define DMA_BRIDGE_TX 0
#define DMA_BRIDGE_RX 1
#define DMA_PORT_A_TX 2
#define DMA_PORT_A_RX 3
#define DMA_PORT_B_TX 4
#define DMA_PORT_B_RX 5

// overlaps with flash because they cannot be active at the same time
#define DMA_FLASH_TX DMA_BRIDGE_TX
#define DMA_FLASH_RX DMA_BRIDGE_RX

/// EVSYS allocation
#define EVSYS_BRIDGE_SYNC 0

/// USB Endpoint allocation
#define USB_EP_FLASH_OUT 0x02
#define USB_EP_FLASH_IN 0x81


// flash.c

void flash_init();
void flash_dma_rx_completion();
void flash_usb_in_completion();
void flash_usb_out_completion();
void flash_disable();

// bridge.c

#define BRIDGE_NUM_CHAN 3
#define BRIDGE_USB 0
#define BRIDGE_PORT_A 1
#define BRIDGE_PORT_B 2

void bridge_init();
void bridge_disable();
void bridge_handle_sync();
void bridge_dma_rx_completion();

void bridge_start_in(u8 channel, u8* data, u8 length);
void bridge_start_out(u8 channel, u8* data);

void bridge_completion_in_0();
void bridge_completion_in_1();
void bridge_completion_in_2();
void bridge_completion_in_3();

void bridge_completion_out_0(u8 size);
void bridge_completion_out_1(u8 size);
void bridge_completion_out_2(u8 size);
void bridge_completion_out_3(u8 size);

// port.c

#define BUF_SIZE 256

typedef struct PortData {
    u8 chan;
    const TesselPort* port;
    DmaChan dma_tx;
    DmaChan dma_rx;

    u8 state;
    u8 mode;
    u8 cmd_buf[BUF_SIZE];
    u8 cmd_len;
    u8 cmd_pos;
    u8 reply_buf[BUF_SIZE];
    u8 reply_len;
    u8 cmd;
    u8 arg;
    u8 len;
    bool pending_out;
    bool pending_in;
} PortData;

void port_init(PortData* p, u8 chan, const TesselPort* port, DmaChan dma_tx, DmaChan dma_rx);
void port_bridge_out_completion(PortData* p, u8 len);
void port_bridge_in_completion(PortData* p);
void port_dma_rx_completion(PortData* p);

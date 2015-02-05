#pragma once
#include "common/board.h"
#include "common/hw.h"
#include "samd/usb_samd.h"

/// DMA allocation
#define DMA_FLASH_TX 0
#define DMA_FLASH_RX 1

// overlaps with flash because they cannot be active at the same time
#define DMA_BRIDGE_TX 0
#define DMA_BRIDGE_RX 1

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

void ports_init();

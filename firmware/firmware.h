#pragma once
#include "common/board.h"
#include "common/hw.h"
#include "samd/usb_samd.h"

#define DMA_FLASH_TX 0
#define DMA_FLASH_RX 1

#define USB_EP_FLASH_OUT 0x02
#define USB_EP_FLASH_IN 0x81

// flash.c

void flash_init();
void flash_dma_rx_completion();
void flash_usb_in_completion();
void flash_usb_out_completion();

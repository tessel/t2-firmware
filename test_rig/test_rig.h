#pragma once
#include "test_rig_board.h"
#include "common/hw.h"
#include "samd/usb_samd.h"

/// DMA allocation. Channels 0-3 support EVSYS and are reserved for
/// functions that need it


/// EVSYS allocation

/// USB Endpoint allocation
#define USB_EP_DAP_HID_OUT 0x01
#define USB_EP_DAP_HID_IN 0x82
#define USB_EP_REPORT_IN 0x83

/// Timer allocation
#define TC_BUTTON_POLL 3

// TCC allocation

// GCLK channel allocation
#define GCLK_SYSTEM 0
#define GCLK_32K    2

// dap_hid.c
void dap_enable();
void dap_disable();
void dap_handle_usb_in_completion();
void dap_handle_usb_out_completion();

// pins.c
void usb_control_req_digital(uint16_t wIndex, uint16_t wValue);
void usb_control_req_digital_read_all();
void init_all_digital_pins();
void usb_control_req_analog_read(uint16_t wIndex, uint16_t wValue);

// button.c
void button_init();
void button_poll();

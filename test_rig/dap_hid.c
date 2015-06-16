#include "test_rig.h"
#include "DAP_config.h"
#include "DAP.h"

USB_ALIGN u8 dap_buf_in[DAP_PACKET_SIZE];
USB_ALIGN u8 dap_buf_out[DAP_PACKET_SIZE];

void dap_enable() {
    DAP_Setup();
    usb_enable_ep(USB_EP_DAP_HID_OUT, USB_EP_TYPE_BULK, 64);
    usb_enable_ep(USB_EP_DAP_HID_IN, USB_EP_TYPE_BULK, 64);
    usb_ep_start_out(USB_EP_DAP_HID_OUT, dap_buf_out, DAP_PACKET_SIZE);
}

void dap_disable() {
    pin_in(PIN_SWCLK);
    pin_in(PIN_SWDIO);
    pin_in(PIN_RESET);
    usb_disable_ep(USB_EP_DAP_HID_OUT);
    usb_disable_ep(USB_EP_DAP_HID_IN);
}

void dap_handle_usb_in_completion() {
    usb_ep_start_out(USB_EP_DAP_HID_OUT, dap_buf_out, DAP_PACKET_SIZE);
}

void dap_handle_usb_out_completion() {
    DAP_ProcessCommand(dap_buf_out, dap_buf_in);
    usb_ep_start_in(USB_EP_DAP_HID_IN, dap_buf_in, DAP_PACKET_SIZE, false);
}

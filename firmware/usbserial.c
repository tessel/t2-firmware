#include "firmware.h"

#define BUF_SIZE 64
USB_ALIGN u8 usbserial_buf_in[64];
USB_ALIGN u8 usbserial_buf_out[64];

void usbserial_init() {
    usb_enable_ep(USB_EP_CDC_NOTIFICATION, USB_EP_TYPE_INTERRUPT, 8);
    usb_enable_ep(USB_EP_CDC_OUT, USB_EP_TYPE_BULK, 64);
    usb_enable_ep(USB_EP_CDC_IN, USB_EP_TYPE_BULK, 64);

    usb_ep_start_out(USB_EP_CDC_OUT, usbserial_buf_out, BUF_SIZE);
}

void usbserial_out_completion() {
    u32 len = usb_ep_out_length(USB_EP_CDC_OUT);
    usb_ep_start_in(USB_EP_CDC_IN, usbserial_buf_out, len, false);
}

void usbserial_in_completion() {
    usb_ep_start_out(USB_EP_CDC_OUT, usbserial_buf_out, BUF_SIZE);
}

void usbserial_disable() {
    usb_disable_ep(USB_EP_CDC_NOTIFICATION);
    usb_disable_ep(USB_EP_CDC_OUT);
    usb_disable_ep(USB_EP_CDC_IN);
}

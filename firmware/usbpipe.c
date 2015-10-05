#include "firmware.h"

#define FLASH_BUFFER_SIZE 64

typedef enum {
    PIPE_DISABLE,
    PIPE_WAIT_FOR_USB,
    PIPE_WAIT_FOR_BRIDGE,
} PipeState;

PipeState pipe_state_pc_to_soc;
PipeState pipe_state_soc_to_pc;
USB_ALIGN u8 pipe_buffer_pc_to_soc[BRIDGE_BUF_SIZE];
USB_ALIGN u8 pipe_buffer_soc_to_pc[BRIDGE_BUF_SIZE];

void usbpipe_init() {
    usb_enable_ep(USB_EP_PIPE_OUT, USB_EP_TYPE_BULK, 64);
    usb_enable_ep(USB_EP_PIPE_IN, USB_EP_TYPE_BULK, 64);

    usb_ep_start_out(USB_EP_PIPE_OUT, pipe_buffer_pc_to_soc, FLASH_BUFFER_SIZE);
    pipe_state_pc_to_soc = PIPE_WAIT_FOR_USB;

    bridge_start_out(BRIDGE_USB, pipe_buffer_soc_to_pc);
    pipe_state_soc_to_pc  = PIPE_WAIT_FOR_BRIDGE;

    bridge_enable_chan(BRIDGE_USB); // Tells SPI Daemon to start USB Daemon
}

void usbpipe_disable() {
    usb_disable_ep(USB_EP_PIPE_IN);
    usb_disable_ep(USB_EP_PIPE_OUT);
    pipe_state_pc_to_soc = PIPE_DISABLE;
    pipe_state_soc_to_pc = PIPE_DISABLE;
    bridge_disable_chan(BRIDGE_USB); // Tells SPI Daemon to close USB Daemon
}

// Received from USB, send to bridge
void pipe_usb_out_completion() {
    if (pipe_state_pc_to_soc == PIPE_WAIT_FOR_USB) {
        u32 len = usb_ep_out_length(USB_EP_PIPE_OUT);
        bridge_start_in(BRIDGE_USB, pipe_buffer_pc_to_soc, len);
        pipe_state_pc_to_soc = PIPE_WAIT_FOR_BRIDGE;
    } else {
        invalid();
    }

}

// Finished sending on bridge, start receive from USB
void pipe_bridge_in_completion() {
    if (pipe_state_pc_to_soc == PIPE_WAIT_FOR_BRIDGE) {
        usb_ep_start_out(USB_EP_PIPE_OUT, pipe_buffer_pc_to_soc, FLASH_BUFFER_SIZE);
        pipe_state_pc_to_soc = PIPE_WAIT_FOR_USB;
    } else {
        invalid();
    }
}

// Received from bridge, send to USB
void pipe_bridge_out_completion(u8 count) {
    if (pipe_state_soc_to_pc == PIPE_WAIT_FOR_BRIDGE) {
        usb_ep_start_in(USB_EP_PIPE_IN, pipe_buffer_soc_to_pc, count, false);
        pipe_state_soc_to_pc = PIPE_WAIT_FOR_USB;
    } else {
        invalid();
    }
}

// Finished sending on USB, start receive from bridge
void pipe_usb_in_completion() {
    if (pipe_state_soc_to_pc == PIPE_WAIT_FOR_USB) {
        bridge_start_out(BRIDGE_USB, pipe_buffer_soc_to_pc);
        pipe_state_soc_to_pc = PIPE_WAIT_FOR_BRIDGE;
    } else {
        invalid();
    }
}

#include "firmware.h"
#define OUT_RING_SIZE 10
#define PACKET_SIZE 64
USB_ALIGN u8 out_ring_buf[OUT_RING_SIZE][PACKET_SIZE];
volatile u8 out_ring_count = 0; // Number of packets in the ring buffer
volatile u8 out_ring_write_pos = 0; // Packet index in which we're currently receiving a packet, or will once it's free
volatile u8 out_ring_read_pos = 0; // Packet index from which we're currently sending a packet, or will once it's filled.
volatile u8 out_ring_short_packet = 0; // If nonzero, the ring ends with a short packet of this size
volatile bool out_usb_pending = false;
volatile bool out_bridge_pending = false;

typedef enum {
    PIPE_DISABLE,
    PIPE_WAIT_FOR_USB,
    PIPE_WAIT_FOR_BRIDGE,
} PipeState;

PipeState pipe_state_soc_to_pc;
USB_ALIGN u8 pipe_buffer_soc_to_pc[BRIDGE_BUF_SIZE];

void usbpipe_init() {
    usb_enable_ep(USB_EP_PIPE_OUT, USB_EP_TYPE_BULK, 64);
    usb_enable_ep(USB_EP_PIPE_IN, USB_EP_TYPE_BULK, 64);

    usb_ep_start_out(USB_EP_PIPE_OUT, out_ring_buf[out_ring_write_pos], PACKET_SIZE);
    out_usb_pending = true;
    out_bridge_pending = false;

    bridge_start_out(BRIDGE_USB, pipe_buffer_soc_to_pc);
    pipe_state_soc_to_pc = PIPE_WAIT_FOR_BRIDGE;

    bridge_enable_chan(BRIDGE_USB); // Tells SPI Daemon to start connection to USB Daemon
}

void usbpipe_disable() {
    usb_disable_ep(USB_EP_PIPE_IN);
    usb_disable_ep(USB_EP_PIPE_OUT);
    out_ring_count = 0;
    out_ring_write_pos = 0;
    out_ring_read_pos = 0;
    out_ring_short_packet = 0;
    pipe_state_soc_to_pc = PIPE_DISABLE;
    bridge_disable_chan(BRIDGE_USB); // Tells SPI Daemon to close connection to USB Daemon
}

void out_ring_step() {
    // If we are not currently receiving
    // And there is an empty buffer to receive data into
    // And there isn't an unprocessed short packet
    if (!out_usb_pending && out_ring_count < OUT_RING_SIZE && out_ring_short_packet == 0) {
        // Start reading data in over USB to the buffer at the correct position (up to 64 bytes)
        usb_ep_start_out(USB_EP_PIPE_OUT, out_ring_buf[out_ring_write_pos], PACKET_SIZE);
        // We are waiting for the transfer to complete
        out_usb_pending = true;
    }

    // If we are not waiting on a bridge transaction to complete and we have packets to send
    if (!out_bridge_pending && out_ring_count > 0) {
        // The size of the packet is 64 bytes (unless the below case is true)
        u8 len = PACKET_SIZE;
        // If we only have one outgoing packet and it is a short packet
        if (out_ring_count == 1 && out_ring_short_packet != 0) {
             // The length is actually a subset of a full packet
             len = out_ring_short_packet;
             // Reset the short packet var
             out_ring_short_packet = 0;
        }
        // Start sending data to the spi daemon
        bridge_start_in(BRIDGE_USB, out_ring_buf[out_ring_read_pos], len);
        // We are currently waiting on the SPI
        out_bridge_pending = true;
    }
}

// Received from USB, send to bridge
void pipe_usb_out_completion() {
    // Get the length of the packet from USB
    u32 len = usb_ep_out_length(USB_EP_PIPE_OUT);
    // If it is less than one full packet, mark the short packet var with the length
    if (len < PACKET_SIZE) out_ring_short_packet = len;
    // Increase the next writable buffer by 1 (but loop to the beginning if necessary)
    out_ring_write_pos = (out_ring_write_pos + 1) % OUT_RING_SIZE;
    // Mark that we have one packet that needs attention
    out_ring_count += 1;
    // We are no longer operating over USB
    out_usb_pending = false;
    // Push the data to the correct place
    out_ring_step();
}

// Finished sending on bridge, start receive from USB
void pipe_bridge_in_completion() {
    // Increment the location of where we will read from next (to send over USB)
    out_ring_read_pos = (out_ring_read_pos + 1) % OUT_RING_SIZE;
    // Decrement the number of packets that need reading
    out_ring_count -= 1;
    // Mark the bridge transfer as complete
    out_bridge_pending = false;
    // Move data along
    out_ring_step();
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

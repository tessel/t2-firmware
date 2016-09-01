#include "test_rig.h"

void usb_control_req_digital(uint16_t wIndex, uint16_t wValue) {
    // wiIndex = index into the array
    // wValue: 0 = low, 1 = high, 2 = input
    if (wIndex >= sizeof(DIGITAL_PINS) / sizeof(Pin)) {
        return usb_ep0_stall();
    }
    switch (wValue) {
        case 0:
            pin_low(DIGITAL_PINS[wIndex]);
            pin_out(DIGITAL_PINS[wIndex]);
            break;
        case 1:
            pin_high(DIGITAL_PINS[wIndex]);
            pin_out(DIGITAL_PINS[wIndex]);
            break;
        case 2:
            pin_in(DIGITAL_PINS[wIndex]);
            break;
        default:
            return usb_ep0_stall();
    }
    //  send the pin value back to the master
    ep0_buf_in[0] = pin_read(DIGITAL_PINS[wIndex]);
    usb_ep0_in(1);
    usb_ep0_out();
}

void usb_control_req_digital_read_all() {
    for (uint8_t c = 0; c < sizeof(DIGITAL_PINS) / sizeof(Pin); c++) {
        ep0_buf_in[c] = pin_read(DIGITAL_PINS[c]);
    }
    usb_ep0_in(sizeof(DIGITAL_PINS) / sizeof(Pin));
    usb_ep0_out();
}

void init_all_digital_pins() {
    for (uint8_t c = 0; c < sizeof(DIGITAL_PINS) / sizeof(Pin); c++) {
        pin_in(DIGITAL_PINS[c]);
    }
}

void usb_control_req_analog_read(uint16_t wIndex, uint16_t wValue) {
    // wiIndex = index into the array
    // wValue unused
    if (wIndex >= sizeof(ANALOG_PINS) / sizeof(Pin)) {
        return usb_ep0_stall();
    }
    uint16_t val = adc_read_sync(ANALOG_PINS[wIndex], ADC_INPUTCTRL_GAIN_1X);
    ep0_buf_in[0] = val;
    ep0_buf_in[1] = (val >> 8);
    usb_ep0_in(2);
    usb_ep0_out();
}

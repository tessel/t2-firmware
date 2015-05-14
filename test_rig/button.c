#include "test_rig/test_rig.h"

typedef enum {
    BUTTON_UP,
    BUTTON_BOUNCE,
    BUTTON_DOWN,
} ButtonState;

ButtonState button_state;

void button_init() {
    button_state = BUTTON_UP;
    pin_in(PIN_START_BUTTON);
    pin_pull_up(PIN_START_BUTTON);
    usb_enable_ep(USB_EP_REPORT_IN, USB_EP_TYPE_INTERRUPT, 8);
    timer_clock_enable(TC_BUTTON_POLL);
    tc(TC_BUTTON_POLL)->COUNT16.CTRLA.reg
        = TC_CTRLA_MODE_COUNT16
        | TC_CTRLA_WAVEGEN_NFRQ
        | TC_CTRLA_PRESCALER_DIV8; // approx. 11ms period
    while (tc(TC_BUTTON_POLL)->COUNT16.STATUS.bit.SYNCBUSY);
    tc(TC_BUTTON_POLL)->COUNT16.CTRLA.bit.ENABLE = 1;
    tc(TC_BUTTON_POLL)->COUNT16.INTENSET.reg = TC_INTENSET_OVF;
    NVIC_EnableIRQ(TC3_IRQn + TC_BUTTON_POLL - 3);
}

USB_ALIGN u8 report_buf[1];
void button_report(bool state) {
    report_buf[0] = state;
    usb_ep_start_in(USB_EP_REPORT_IN, report_buf, 1, true);
}

void button_poll() {
    bool down = !pin_read(PIN_START_BUTTON);
    if (button_state == BUTTON_UP && down) {
        button_state = BUTTON_BOUNCE;
    } else if (button_state == BUTTON_BOUNCE && down) {
        button_state = BUTTON_DOWN;
        button_report(true);
    } else if (button_state == BUTTON_DOWN && !down) {
        button_state = BUTTON_UP;
        button_report(false);
    }
}

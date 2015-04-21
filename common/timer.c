#include "board.h"

void timer_clock_enable(TimerId id) {
    PM->APBCMASK.reg |= 1 << (PM_APBCMASK_TCC0_Pos + id);

    GCLK->CLKCTRL.reg = GCLK_CLKCTRL_CLKEN |
        GCLK_CLKCTRL_GEN(0) |
        GCLK_CLKCTRL_ID(TCC0_GCLK_ID + id/2);
}

// clears timeout and resets timer
void timer_delay_ms_clear(TimerId id) {
    tc(id)->COUNT16.COUNT.reg = 0;
}

// disables timer delay
void timer_delay_disable(TimerId id) {
    tc(id)->COUNT16.INTENCLR.reg = TC_INTENSET_OVF;
    tc(id)->COUNT16.CTRLA.bit.ENABLE = 0;
    NVIC_DisableIRQ(TC3_IRQn + id - 3);
}

// sets up a timer to count down from a certain number of microseconds. 
void timer_delay_ms_enable(TimerId id, uint32_t ms) {
    timer_clock_enable(id);
    tc(id)->COUNT16.CTRLA.reg = 
        TC_CTRLA_WAVEGEN_MPWM | TC_CTRLA_PRESCALER_DIV256;

    tc(id)->COUNT16.DBGCTRL.reg = TC_DBGCTRL_DBGRUN;

    tc(id)->COUNT16.CC[0].reg = ms*200;

    while (tc(id)->COUNT16.STATUS.bit.SYNCBUSY);

    tc(id)->COUNT16.CTRLA.bit.ENABLE = 1;
    tc(id)->COUNT16.INTENSET.reg = TC_INTENSET_OVF;

    // nvic gets enabled on async enable events
}

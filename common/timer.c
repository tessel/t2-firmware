#include "board.h"

void timer_clock_enable(TimerId id) {
    PM->APBCMASK.reg |= 1 << (PM_APBCMASK_TCC0_Pos + id);

    GCLK->CLKCTRL.reg = GCLK_CLKCTRL_CLKEN |
        GCLK_CLKCTRL_GEN(0) |
        GCLK_CLKCTRL_ID(TCC0_GCLK_ID + id/2);
}

// clears timeout and resets timer
void tcc_delay_ms_clear(TimerId id) {
    tcc(id)->COUNT.reg = 0;
}

// disables timer delay
void tcc_delay_disable(TimerId id) {
    tcc(id)->INTENCLR.reg = TC_INTENSET_OVF;
    tcc(id)->CTRLA.bit.ENABLE = 0;
    NVIC_DisableIRQ(TCC0_IRQn + id);
}

// sets up a timer to count down from a certain number of microseconds. 
void tcc_delay_ms_enable(TimerId id, uint32_t ms) {
    timer_clock_enable(id);

    tcc(id)->CTRLA.reg = TCC_CTRLA_PRESCALER_DIV256;
    tcc(id)->COUNT.reg = ms*200;

    while (tcc(id)->SYNCBUSY.reg > 0);

    tcc(id)->CTRLA.bit.ENABLE = 1;
    tcc(id)->INTENSET.reg = TCC_INTENSET_OVF;

    // nvic gets enabled on async enable events
}

#include "common/hw.h"

void timer_clock_enable(TimerId id) {
    PM->APBCMASK.reg |= 1 << (PM_APBCMASK_TCC0_Pos + id);

    GCLK->CLKCTRL.reg = GCLK_CLKCTRL_CLKEN |
        GCLK_CLKCTRL_GEN(0) |
        GCLK_CLKCTRL_ID(TCC0_GCLK_ID + id/2);
}

// Starts timer countdown
void tcc_delay_start(TimerId id, u32 ticks) {
    tcc(id)->PER.reg = ticks;
    tcc(id)->CTRLBSET.reg = TCC_CTRLBSET_CMD_RETRIGGER;
}

// disables timer delay
void tcc_delay_disable(TimerId id) {
    tcc(id)->INTENCLR.reg = TC_INTENSET_OVF;
    tcc(id)->CTRLA.bit.ENABLE = 0;
}

// sets up a timer to count down in one-shot mode.
void tcc_delay_enable(TimerId id) {
    timer_clock_enable(id);

    tcc(id)->CTRLA.reg = TCC_CTRLA_PRESCALER_DIV256;
    tcc(id)->CTRLBSET.reg = TCC_CTRLBSET_DIR | TCC_CTRLBSET_ONESHOT;

    while (tcc(id)->SYNCBUSY.reg > 0);

    tcc(id)->CTRLA.bit.ENABLE = 1;
    tcc(id)->INTENSET.reg = TCC_INTENSET_OVF;
}

// start a timer/capture delay that has already been configured
void tc_delay_start(TimerId id, u32 ticks) {

    // Set the initial value to 0
    tc(id)->COUNT16.COUNT.reg = 0;

    // Set the top of the counter
    tc(id)->COUNT16.CC[0].reg = ticks;

    NVIC_EnableIRQ(TC3_IRQn + (id - 3));

    // Enable the counter!
    tc(id)->COUNT16.CTRLA.bit.ENABLE = 1;
}

// delay a currently running timer/capture channel
void tc_delay_disable(TimerId id) {
    // Enable the interrupt for compare channel 0
    tc(id)->COUNT16.INTENCLR.reg = TC_INTFLAG_MC(1);

    // Disable the counter
    tc(id)->COUNT16.CTRLA.bit.ENABLE = 0 << TC_CTRLA_ENABLE_Pos;
}

// setup a new timer/capture delay channel
void tc_delay_enable(TimerId id) {
    // Set up the timer
    timer_clock_enable(id);

    // Reset the timer
    tc(id)->COUNT16.CTRLA.reg |= TC_CTRLA_SWRST;

    // Set it to use a 16 bit counter, resync on glock, 1024 clock prescaler, run in standby
    tc(id)->COUNT16.CTRLA.reg = TC_CTRLA_MODE_COUNT16 | TC_CTRLA_PRESCSYNC_GCLK
        | TC_CTRLA_PRESCALER(7) | TC_CTRLA_RUNSTDBY;

    // Clear everything?
    tc(id)->COUNT16.CTRLBCLR.reg = 0xFF;

    // Not one shot and please count upwards
    tc(id)->COUNT16.CTRLBSET.reg = 0;

    // Enable the interrupt for compare channel 0
    tc(id)->COUNT16.INTENSET.reg |= TC_INTFLAG_MC(1);
}

// clear the capture channel interrupt flag from the interrupt
void tc_clear_interrupt_flag(TimerId id) {
    tc(id)->COUNT16.INTFLAG.reg = TC_INTFLAG_OVF;
}

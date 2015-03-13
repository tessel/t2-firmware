#include "board.h"

void timer_clock_enable(TimerId id) {
    PM->APBCMASK.reg |= 1 << (PM_APBCMASK_TCC0_Pos + id);

    GCLK->CLKCTRL.reg = GCLK_CLKCTRL_CLKEN |
        GCLK_CLKCTRL_GEN(0) |
        GCLK_CLKCTRL_ID(TCC0_GCLK_ID + id/2);
}

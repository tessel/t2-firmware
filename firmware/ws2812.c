#include "firmware.h"
// #include "tcc/tcc.h"

void _ws2812_set_pin_mux(Pin p);
void _ws2812_enable_clock();
void _ws2812_enable_tcc();

/*
Initializes the Counter Control of a specific pin
so that it's ready to output a waveform compatible
with the ws2812 protocol
*/
void ws2812_init(Pin p) {

  _ws2812_set_pin_mux(p);

  _ws2812_enable_clock();

  _ws2812_enable_tcc();
}

/*
Sets the pin function to use the CCT
Section 30.5.1
*/
void _ws2812_set_pin_mux(Pin p) {
  int8_t tcc_func = 0x05;
  
  if (p.pin & 1) {
    PORT->Group[p.group].PMUX[p.pin/2].bit.PMUXO = tcc_func;
  } else {
    PORT->Group[p.group].PMUX[p.pin/2].bit.PMUXE = tcc_func;
  }

  PORT->Group[p.group].PINCFG[p.pin].bit.PMUXEN = 1;

}

/*
Starts up the peripheral clock for the specific TCC used by the pin
Section 30.5.3
*/
void _ws2812_enable_clock() {
  // system_apb_clock_set_mask(SYSTEM_CLOCK_APB_APBC, TCC0_GCLK_ID)
  // TODO enable appropriate clock based on pin
  // (GCLK_TCC0 vs GCLK_TCC1, etc.)
  PM->APBCMASK.reg |= PM_APBCMASK_TCC0;
    // GCLK->CLKCTRL.reg = GCLK_CLKCTRL_CLKEN |
    //     GCLK_CLKCTRL_GEN(GCLK_SYSTEM) |
    //     GCLK_CLKCTRL_ID(TCC0_GCLK_ID);
}

void _ws2812_enable_tcc() {

}

/*
Sets the DMA address the pin should read from
*/
void ws2812_set_dma_addr(Pin p, void *addr) {

}

/* 
Begins an animation on a particular pin
*/
void ws2812_begin_animation(Pin p) {

}
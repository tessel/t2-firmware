#include "hw.h"


void adc_init(u8 channel) {
  // set up clock
  PM->APBCMASK.reg |= PM_APBCMASK_ADC;
  
  // divide prescaler by 512 (93.75KHz), max adc freq is 2.1MHz
  ADC->CTRLB.reg = ADC_CTRLB_PRESCALER_DIV512;

  // enable clock adc channel
  GCLK->CLKCTRL.reg = GCLK_CLKCTRL_CLKEN |
      GCLK_CLKCTRL_GEN(channel) |
      GCLK_CLKCTRL_ID(ADC_GCLK_ID);
}

void dac_init(u8 channel) {
  // hook up clk
  PM->APBCMASK.reg |= PM_APBCMASK_DAC;
  GCLK->CLKCTRL.reg = GCLK_CLKCTRL_CLKEN | 
    GCLK_CLKCTRL_GEN(channel) | 
    GCLK_CLKCTRL_ID(DAC_GCLK_ID);
}

uint16_t analog_read(Pin p) {
    // disable adc
    ADC->CTRLA.reg &= ~ADC_CTRLA_ENABLE;
    while(ADC->STATUS.reg & ADC_STATUS_SYNCBUSY);

    // switch pin mux to analog in
    pin_analog(p);

    ADC->INPUTCTRL.reg = (ADC_INPUTCTRL_MUXPOS(p.chan) // select from proper pin
        | ADC_INPUTCTRL_MUXNEG_GND // 0 = gnd
        | ADC_INPUTCTRL_GAIN_DIV2); // gain of 1/2

    ADC->REFCTRL.reg = ADC_REFCTRL_REFSEL_INTVCC1; // reference voltage is 1/2 VDDANA
    
    ADC->CTRLA.reg = ADC_CTRLA_ENABLE; // enable
    while(ADC->STATUS.reg & ADC_STATUS_SYNCBUSY);
    
    uint16_t result = 1;
    // flush first value in the pipeline
    for (u8 i = 0; i<2; i++) {
        ADC->SWTRIG.reg = ADC_SWTRIG_START;
        while(ADC->SWTRIG.reg & ADC_SWTRIG_START); // wait until conversion has started
        while(ADC->INTFLAG.reg & ADC_INTFLAG_RESRDY); // wait until result is ready
        ADC->INTFLAG.reg = ADC_INTFLAG_RESRDY; // clear ready flag
        result = ADC->RESULT.reg;
    }
    
    return result;
}

void analog_write(Pin p, u16 val) {
    // switch dac pinmux. this must be PA02
    pin_analog(p);

    // disable
    DAC->CTRLA.reg &= ~DAC_CTRLA_ENABLE;

    // set vcc as reference voltage
    DAC->CTRLB.reg = DAC_CTRLB_EOEN |DAC_CTRLB_REFSEL_AVCC;

    // enable
    DAC->CTRLA.reg = DAC_CTRLA_ENABLE;

    DAC->DATA.reg = val;
}

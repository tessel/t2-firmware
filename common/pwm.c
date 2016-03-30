#include "hw.h"

// Variable to store our bank period (in ticks)
u16 bank_period = 0;

u8 bank_prescalar = 0;

void pwm_bank_enable(TimerId id) {
  // Disable and reset previous settings
  pwm_bank_reset(id);

  // Enable the timer
  timer_clock_enable(id);

  // Put the TCC into PWM wavegen mode
  tcc(id)->WAVE.reg |= TCC_WAVE_WAVEGEN_NPWM;

  // Set a default frequency for this bank
  pwm_bank_set_period(id, bank_prescalar, bank_period);

  // Enable the TCC
  tcc(id)->CTRLA.reg |= TCC_CTRLA_ENABLE;
}

// Disables PWM bank without resetting configuration registers
void pwm_bank_disable(TimerId id){

  // Disable the TCC
  tcc(id)->CTRLA.reg &=~(TCC_CTRLA_ENABLE);

  // Wait for the disable to complete
  while (tcc(id)->SYNCBUSY.reg > 0);
}

// Resets AND disables PWM bank
void pwm_bank_reset(TimerId id) {

  pwm_bank_disable(id);

  // Reset the TCC
  tcc(id)->CTRLA.reg = TCC_CTRLA_SWRST;

  // Wait for the reset to complete
  while (tcc(id)->SYNCBUSY.reg > 0 && tcc(id)->CTRLA.bit.SWRST > 0);
}

void pwm_bank_set_period(TimerId id, u8 new_prescalar, u16 new_period) {
  // Store our new period
  bank_period = new_period;
  // Store our new prescalar
  bank_prescalar = new_prescalar;

  // Disable the TCC so we can make configuration changes
  pwm_bank_disable(id);

  // Set the prescalar setting to no division
  tcc(id)->CTRLA.bit.PRESCALER = bank_prescalar;

  // Reset with the prescalar clock, not the generic clock
  tcc(id)->CTRLA.bit.PRESCSYNC = TCC_CTRLA_PRESCSYNC_PRESC_Val;

  // Set the top count value (when a match will be hit and the waveform output flipped)
  tcc(id)->PER.reg = bank_period;

  // Wait for all the changes to finish loading
  while (tcc(id)->SYNCBUSY.reg > 0);

}
void pwm_set_pin_duty(Pin p, u16 duty_cycle) {

  // If the TCC isn't enabled yet
  if (tcc(p.tcc_id)->CTRLA.bit.ENABLE == 0) {
    // Enable it now
    pwm_bank_enable(p.tcc_id);
  }

  // Set the PIN to its alternate mux with is as a TCC output
  pin_alt_mux(p);

  // Set the pin direction to output
  pin_dir(p, true);

  // Set the duty cycle for this channel
  tcc(p.tcc_id)->CC[p.cc_chan].reg = duty_cycle;

}

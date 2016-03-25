#include "firmware.h"

PortData port_a;
PortData port_b;

// Indicates whether the SPI Daemon is listening for USB traffic
volatile bool booted = false;
// LED Chan: TCC1/WO[0]
#define PWR_LED_TCC_CHAN 1
// CC channel 0 on TCC instance 1
#define PWR_LED_CC_CHAN 0
// The maximum counter value was chosen to get a 2s period heartbeat
#define MAX_COUNTER 0xFFFF
// We have 16 slices of a sine wave
#define NUM_POINT_SLICES 0x10
// Number of loop iterations in a single slice
#define COUNTS_IN_SLICE MAX_COUNTER/NUM_POINT_SLICES
// Evenly spaced points along a sine wave, shifted up by 1, scaled by 0.5
// multiplied by the max counter value
const uint32_t sin_wave_points[] = {
    32767,
    45307,
    55937,
    63040,
    65535,
    63040,
    55937,
    45307,
    32767,
    20227,
    9597,
    2494,
    0,
    2494,
    9597,
    20227
};
// The current counter value of our timer
volatile uint16_t counter = 0;

/*
    Reset the TCC module after breathing completes and stop interrupts
*/
void cancel_breathing_animation() {
    // Disable the TCC
    tcc(PWR_LED_TCC_CHAN)->CTRLA.reg = TCC_CTRLA_RESETVALUE;
    // Disable Boot LED TCC IRQ in the NVIC
    NVIC_DisableIRQ(TCC1_IRQn);
    // Set the PWR LED to the default high state
    pin_out(PIN_LED);
    pin_high(PIN_LED);
}

/*
 Linear interpolation between points in a circular pattern
 Suggested by @kevinmehall: https://github.com/tessel/t2-firmware/pull/141#issuecomment-166160115
*/
uint32_t interpolate(uint32_t position) {
  // Choose the two points points this position falls between
  uint8_t index = (position * NUM_POINT_SLICES) / MAX_COUNTER;
  uint8_t next_index = (index + 1) % NUM_POINT_SLICES;

  // The relative position between the points, as a fraction of `MAX_COUNTER`
  uint32_t between = (position * NUM_POINT_SLICES) % MAX_COUNTER;

  // Linear interpolation
  return ((MAX_COUNTER - between) * sin_wave_points[index] + between * sin_wave_points[next_index]) / MAX_COUNTER;
}

/*
    Handler for the POWER LED breathing animation
*/
void TCC1_Handler() {
    // booted is true when the coprocess first gets
    // a status packet from the spi daemon
    if (booted == true) {
        // Stop this breathing animation and cancel interrupts
        cancel_breathing_animation();
    }

    // Take that proportion and extract a point along the sudo sine wave
    tcc(PWR_LED_TCC_CHAN)->CCB[PWR_LED_CC_CHAN].bit.CCB = interpolate(++counter);
}

/*
    Sets up the TCC module to send PWM output to the PWR LED
*/
void init_breathing_animation() {
    // Setup the pin to be used as a TCC output
    pin_mux(PIN_LED);
    pin_dir(PIN_LED, true);

    // Disable the TCC
    tcc(PWR_LED_TCC_CHAN)->CTRLA.reg = 0;

    // Reset the TCC
    tcc(PWR_LED_TCC_CHAN)->CTRLA.reg = TCC_CTRLA_SWRST;

    // Enable the timer
    timer_clock_enable(PWR_LED_TCC_CHAN);

    /* Set the prescalar setting to the highest division so we have more time
        in between interrupts to complete the math
    */
    tcc(PWR_LED_TCC_CHAN)->CTRLA.bit.PRESCALER = TCC_CTRLA_PRESCALER_DIV1024_Val;

    // Set the waveform generator to generate a PWM signal
    // It uses polarity setting of 1 (switches from DIR to ~DIR)
    tcc(PWR_LED_TCC_CHAN)->WAVE.reg = TCC_WAVE_WAVEGEN_NPWM | TCC_WAVE_POL0;

    // Set the top count value (when a match will be hit and the waveform output flipped)
    tcc(PWR_LED_TCC_CHAN)->PER.reg = MAX_COUNTER;

    // Set the counter number, starting at 0% duty cycle
    tcc(PWR_LED_TCC_CHAN)->CC[PWR_LED_CC_CHAN].reg = counter;

    // Set the second CCB value value be dark for simplicity
    tcc(PWR_LED_TCC_CHAN)->CCB[PWR_LED_CC_CHAN].bit.CCB = counter;

    // Enable IRQ's in the NVIC
    NVIC_EnableIRQ(TCC1_IRQn);
    // Set the priority to low
    NVIC_SetPriority(TCC1_IRQn, 0xff);
    // Enable interrupts so we can modify the counter value (creates breathing effect)
    tcc(PWR_LED_TCC_CHAN)->INTENSET.reg = TC_INTENSET_OVF;

    // Wait for all the changes to finish loading?
    while (tcc(PWR_LED_TCC_CHAN)->SYNCBUSY.reg > 0);

    // Enable the TCC
    tcc(PWR_LED_TCC_CHAN)->CTRLA.reg = TCC_CTRLA_ENABLE;
}

void boot_delay_ms(int delay){
    tc(TC_BOOT)->COUNT16.CTRLA.reg
        = TC_CTRLA_WAVEGEN_MPWM
        | TC_CTRLA_PRESCALER_DIV1024;

    tc(TC_BOOT)->COUNT16.CC[0].reg = delay*50;
    while (tc(TC_BOOT)->COUNT16.STATUS.bit.SYNCBUSY);

    tc(TC_BOOT)->COUNT16.CTRLA.bit.ENABLE = 1;

    while(!tc(TC_BOOT)->COUNT16.INTFLAG.bit.MC0) {
        // hold off until timer has been hit
    }

    // clear match flag
    tc(TC_BOOT)->COUNT16.INTFLAG.bit.MC0 = 1;

    // disable boot counter
    tc(TC_BOOT)->COUNT16.CTRLA.bit.ENABLE = 0;
}

void tmp_dev_pulse_capture() {

  // TODO: programmatically fetch TCC channel
  uint8_t PULSE_TCC_CHAN = 0;
  // TODO: assign appropriate channel to each pin
  uint8_t PULSE_CC_CHAN = 1;
  // TODO: Abstract this
  // Test pin to use
  Pin test_pin = PORT_A.g3;
  // Setup the pin to be used with the TCC
  pin_mux(test_pin);
  // Use the pin as an input
  pin_dir(test_pin, false);

  // Perform software reset on the TCC
  // TODO: don't do this if it's being used by another pin...
  tcc(PULSE_TCC_CHAN)->CTRLA.bit.SWRST = TCC_CTRLA_SWRST;
  while (tcc(PULSE_TCC_CHAN)->SYNCBUSY.bit.SWRST) {} // Wait for operation to complete

  // Enable capture on channel 1, Wrap on prescalar value, No prescalar value (GCLK)
  tcc(PULSE_TCC_CHAN)->CTRLA.reg = TCC_CTRLA_CPTEN1 | TCC_CTRLA_PRESCSYNC_GCLK | TCC_CTRLA_PRESCALER_DIV1;

  tcc(PULSE_TCC_CHAN)->CTRLBSET.reg = TCC_CTRLBSET_ONESHOT; // Enable one-shot operation
  while (tcc(PULSE_TCC_CHAN)->SYNCBUSY.bit.CTRLB) {} // Wait for operation to complete

  // Enable event match output, input, counter event input???
  tcc(PULSE_TCC_CHAN)->EVCTRL.reg = TCC_EVCTRL_MCEI1 | TCC_EVCTRL_MCEO1 | TCC_EVCTRL_TCEI1;

  // TODO: Accept incoming value
  // If the event expects a low pulse, we must invert
  // if (LOW_PULSE) {
  //   tcc(PULSE_TCC_CHAN)->EVCTRL.bit.TCINV = TCC_EVCTRL_TCINV1;
  // }

  // Enable overflow event, setup pulse capture event
  tcc(PULSE_TCC_CHAN)->EVCTRL.reg |= TCC_EVCTRL_OVFEO | TCC_EVCTRL_EVACT1_PPW;

  // Enable interrupts on overflow and capture in channel 1
  tcc(PULSE_TCC_CHAN)->INTENSET.reg = TCC_INTENSET_OVF | TCC_INTENSET_MC1;

  // Reset the count
  tcc(PULSE_TCC_CHAN)->COUNT.reg = TCC_COUNT_RESETVALUE;

  // TODO: Accept incoming value
  tcc(PULSE_TCC_CHAN)->CCB[PULSE_CC_CHAN].reg = 10000;

  // Enable the TCC
  tcc(PULSE_TCC_CHAN)->CTRLA.reg |= TCC_CTRLA_ENABLE;
}

int main(void) {
    if (PM->RCAUSE.reg & (PM_RCAUSE_POR | PM_RCAUSE_BOD12 | PM_RCAUSE_BOD33)) {
        // On powerup, force a clean reset of the MT7620
        pin_low(PIN_SOC_RST);
        pin_out(PIN_SOC_RST);

        // turn off 3.3V to SoC
        pin_low(PIN_SOC_PWR);
        pin_out(PIN_SOC_PWR);

        // pull 1.8V low
        pin_low(PIN_18_V);
        pin_out(PIN_18_V);

        clock_init_crystal(GCLK_SYSTEM, GCLK_32K);
        timer_clock_enable(TC_BOOT);

        // hold everything low
        boot_delay_ms(50); // power off for 50ms

        pin_high(PIN_SOC_PWR);

        boot_delay_ms(2); // 2ms until 1.8 rail comes on

        pin_high(PIN_18_V);

        boot_delay_ms(50); // 50ms before soc rst comes on
    } else {
        clock_init_crystal(GCLK_SYSTEM, GCLK_32K);
    }

    pin_mux(PIN_USB_DM);
    pin_mux(PIN_USB_DP);
    usb_init();
    usb_attach();
    NVIC_SetPriority(USB_IRQn, 0xff);

    pin_in(PIN_SOC_RST);

    pin_high(PIN_SOC_PWR);
    pin_out(PIN_SOC_PWR);

    pin_low(PORT_A.power);
    pin_out(PORT_A.power);

    pin_low(PORT_B.power);
    pin_out(PORT_B.power);

    pin_pull_up(PIN_BRIDGE_CS);
    pin_pull_up(PIN_FLASH_CS);

    pin_pull_up(PIN_SERIAL_TX);
    pin_pull_up(PIN_SERIAL_RX);

    dma_init();
    NVIC_EnableIRQ(DMAC_IRQn);
    NVIC_SetPriority(DMAC_IRQn, 0xff);

    eic_init();
    NVIC_EnableIRQ(EIC_IRQn);
    NVIC_SetPriority(EIC_IRQn, 0xff);

    evsys_init();
    NVIC_EnableIRQ(EVSYS_IRQn);
    NVIC_SetPriority(EVSYS_IRQn, 0);

    adc_init(GCLK_SYSTEM, ADC_REFCTRL_REFSEL_INTVCC1);
    dac_init(GCLK_32K);

    bridge_init();

    port_init(&port_a, 1, &PORT_A, GCLK_PORT_A,
        TCC_PORT_A, DMA_PORT_A_TX, DMA_PORT_A_RX);
    port_init(&port_b, 2, &PORT_B, GCLK_PORT_B,
        TCC_PORT_B, DMA_PORT_B_TX, DMA_PORT_B_RX);

    __enable_irq();
    SCB->SCR |= SCB_SCR_SLEEPONEXIT_Msk;

    tmp_dev_pulse_capture();

    init_breathing_animation();

    while (1) { __WFI(); }
}

void DMAC_Handler() {
    u32 intpend = DMAC->INTPEND.reg;
    if (intpend & DMAC_INTPEND_TCMPL) {
        u32 id = intpend & DMAC_INTPEND_ID_Msk;

        if (id == DMA_BRIDGE_RX) {
            bridge_dma_rx_completion();
            flash_dma_rx_completion();
        } else if (id == DMA_PORT_A_TX) {
            port_dma_tx_completion(&port_a);
        } else if (id == DMA_PORT_B_TX) {
            port_dma_tx_completion(&port_b);
        } else if (id == DMA_PORT_A_RX) {
            port_dma_rx_completion(&port_a);
        } else if (id == DMA_PORT_B_RX) {
            port_dma_rx_completion(&port_b);
        } else if (id == DMA_TERMINAL_RX) {
            usbserial_dma_rx_completion();
        } else if (id == DMA_TERMINAL_TX) {
            usbserial_dma_tx_completion();
        }
    }

    if (intpend & (DMAC_INTPEND_TERR | DMAC_INTPEND_SUSP)) {
        invalid();
    }

    DMAC->INTPEND.reg = intpend;
}

void EIC_Handler() {
    u32 flags = EIC->INTFLAG.reg;
    if (flags & PORT_A.pin_interrupts) {
        port_handle_extint(&port_a, flags);
    } else if (flags & PORT_B.pin_interrupts) {
        port_handle_extint(&port_b, flags);
    }
}

void EVSYS_Handler() {
    if (EVSYS->INTFLAG.reg & EVSYS_EVD(EVSYS_BRIDGE_SYNC)) {
        EVSYS->INTFLAG.reg = EVSYS_EVD(EVSYS_BRIDGE_SYNC);
        bridge_handle_sync();
    } else {
        invalid();
    }
}

void SERCOM_HANDLER(SERCOM_PORT_A_UART_I2C) {
    bridge_handle_sercom_uart_i2c(&port_a);
}

void SERCOM_HANDLER(SERCOM_PORT_B_UART_I2C) {
    bridge_handle_sercom_uart_i2c(&port_b);
}

void bridge_open_0() {}

void bridge_completion_out_0(u8 count) {
    pipe_bridge_out_completion(count);
}
void bridge_completion_in_0() {
    pipe_bridge_in_completion();
}
void bridge_close_0() {}

void bridge_open_1() {
    port_enable(&port_a);
}
void bridge_completion_out_1(u8 count) {
    port_bridge_out_completion(&port_a, count);
}
void bridge_completion_in_1() {
    port_bridge_in_completion(&port_a);
}
void bridge_close_1() {
    port_disable(&port_a);
}

void bridge_open_2() {
    port_enable(&port_b);
}
void bridge_completion_out_2(u8 count) {
    port_bridge_out_completion(&port_b, count);
}
void bridge_completion_in_2() {
    port_bridge_in_completion(&port_b);
}
void bridge_close_2() {
    port_disable(&port_b);
}

void TC_HANDLER(TC_TERMINAL_TIMEOUT) {
    usbserial_handle_tc();
}

void TCC_HANDLER(TCC_PORT_A) {
    uart_send_data(&port_a);

    // clear irq
    tcc(TCC_PORT_A)->INTFLAG.reg = TCC_INTENSET_OVF;
}

void TCC_HANDLER(TCC_PORT_B) {
    uart_send_data(&port_b);

    // clear irq
    tcc(TCC_PORT_B)->INTFLAG.reg = TCC_INTENSET_OVF;
}

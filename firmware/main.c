#include "firmware.h"

PortData port_a;
PortData port_b;

volatile bool booted = false;

/*** SysTick ***/
volatile uint32_t g_msTicks;
/*** BOOT LED ***/
unsigned led_next_time = 0;

/* SysTick IRQ handler */
void SysTick_Handler(void) {
    g_msTicks++;

    // Boot LED Tasks
    if (!booted && g_msTicks > led_next_time) {
        led_next_time += 400;
        pin_toggle(PORT_A.power);
        pin_toggle(PORT_B.power);
        pin_toggle(PIN_LED);
    }
}

void init_systick() {
    if (SysTick_Config(48000000 / 1000)) {  /* Setup SysTick Timer for 1 msec interrupts  */
        while (1) {}                                /* Capture error */
    }
    NVIC_SetPriority(SysTick_IRQn, 0x0);
    g_msTicks = 0;
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

    pin_high(PIN_LED);
    pin_out(PIN_LED);

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
    
    init_systick();

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

void bridge_open_0() {
    booted = true;
    pin_high(PIN_LED);
    pin_low(PORT_A.power);
    pin_low(PORT_B.power);
}
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

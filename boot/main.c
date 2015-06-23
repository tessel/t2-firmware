// Copyright 2014 Technical Machine, Inc. See the COPYRIGHT
// file at the top-level directory of this distribution.
//
// Licensed under the Apache License, Version 2.0 <LICENSE-APACHE or
// http://www.apache.org/licenses/LICENSE-2.0> or the MIT license
// <LICENSE-MIT or http://opensource.org/licenses/MIT>, at your
// option. This file may not be copied, modified, or distributed
// except according to those terms.

#include "common/util.h"
#include "samd/usb_samd.h"

#include <string.h>
#include <stdbool.h>

#include "boot.h"
#include "common/nvm.h"

volatile bool exit_and_jump = 0;

/*** SysTick ***/

volatile uint32_t g_msTicks;

/* SysTick IRQ handler */
void SysTick_Handler(void) {
	g_msTicks++;
}

void delay_ms(unsigned ms) {
	unsigned start = g_msTicks;
	while (g_msTicks - start <= ms) {
		__WFI();
	}
}

void init_systick() {
	if (SysTick_Config(48000000 / 1000)) {	/* Setup SysTick Timer for 1 msec interrupts  */
		while (1) {}								/* Capture error */
	}
	NVIC_SetPriority(SysTick_IRQn, 0x0);
	g_msTicks = 0;
}

/*** USB / DFU ***/

void dfu_cb_dnload_block(uint16_t block_num, uint16_t len) {
	if (usb_setup.wLength > DFU_TRANSFER_SIZE) {
		dfu_error(DFU_STATUS_errUNKNOWN);
		return;
	}

	if (block_num * DFU_TRANSFER_SIZE > FLASH_FW_SIZE) {
		dfu_error(DFU_STATUS_errADDRESS);
		return;
	}

	nvm_erase_row(FLASH_FW_START + block_num * DFU_TRANSFER_SIZE);
}

void dfu_cb_dnload_packet_completed(uint16_t block_num, uint16_t offset, uint8_t* data, uint16_t length) {
	unsigned addr = FLASH_FW_START + block_num * DFU_TRANSFER_SIZE + offset;
	nvm_write_page(addr, data, length);
}

unsigned dfu_cb_dnload_block_completed(uint16_t block_num, uint16_t length) {
	return 0;
}

void dfu_cb_manifest(void) {
	exit_and_jump = 1;
}

/*** LED ***/

unsigned led_next_time = 0;
void led_task() {
	if (g_msTicks > led_next_time) {
		led_next_time += 400;
		pin_toggle(PIN_LED);
	}
}

void bootloader_main() {
	if (PM->RCAUSE.reg & (PM_RCAUSE_POR | PM_RCAUSE_BOD12 | PM_RCAUSE_BOD33)) {
		// On powerup, power off MT7620
		pin_low(PIN_SOC_RST);
		pin_out(PIN_SOC_RST);
	}

	clock_init_usb(GCLK_SYSTEM);
	init_systick();
	nvm_init();

	pin_low(PORT_A.power);
	pin_out(PORT_A.power);

	pin_low(PORT_B.power);
	pin_out(PORT_B.power);

	pin_out(PIN_LED);

	__enable_irq();

	pin_mux(PIN_USB_DM);
	pin_mux(PIN_USB_DP);
	usb_init();
	usb_attach();

	while(!exit_and_jump) {
		led_task();
		__WFI(); /* conserve power */
	}

	delay_ms(25);

	usb_detach();
	nvm_invalidate_cache();

	delay_ms(100);

	jump_to_flash(FLASH_FW_ADDR, 0);
}

bool flash_valid() {
	unsigned sp = ((unsigned *)FLASH_FW_ADDR)[0];
	unsigned ip = ((unsigned *)FLASH_FW_ADDR)[1];

	return sp > 0x20000000
	    && sp < 0x20008000
			&& ip < 0x00400000;
}

bool button_pressed() {
	pin_in(PIN_BTN);
	return !pin_read(PIN_BTN);
}

bool bootloader_sw_triggered() {
	return PM->RCAUSE.reg & PM_RCAUSE_WDT;
}

int main() {
	if (!flash_valid() || button_pressed() || bootloader_sw_triggered()) {
		bootloader_main();
	}

	jump_to_flash(FLASH_FW_ADDR, 0);
}

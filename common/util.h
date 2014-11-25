#pragma once
#include "common/board.h"

void clock_init();

inline void pin_mux(uint32_t group, uint32_t pinmux) {
  uint32_t pin = pinmux >> 16;
  uint32_t mux = pinmux & 0xF;

  if (pin & 1) {
    PORT->Group[group].PMUX[pin/2].bit.PMUXO = mux;
  } else {
    PORT->Group[group].PMUX[pin/2].bit.PMUXE = mux;
  }

  PORT->Group[group].PINCFG[pin].bit.PMUXEN = 1;
}


inline void jump_to_flash(uint32_t addr_p, uint32_t r0_val) {
  uint32_t *addr = (void*) addr_p;
  __disable_irq();

  // Disable SysTick
  SysTick->CTRL = 0;

  // TODO: reset peripherals

  // Switch to the the interrupt vector table in flash
  SCB->VTOR = (uint32_t) addr;

  // Set up the stack and jump to the reset vector
  uint32_t sp = addr[0];
  uint32_t pc = addr[1];
  register uint32_t r0 __asm__ ("r0") = r0_val;
  __asm__ volatile("mov sp, %0; bx %1" :: "r" (sp), "r" (pc), "r" (r0));
  (void) r0_val;
}

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

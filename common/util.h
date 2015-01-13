#pragma once
#include <stdbool.h>
#include <stdint.h>

typedef uint8_t u8;
typedef uint32_t u32;

typedef uint8_t DmaChan;
typedef uint8_t SercomId;
typedef struct Pin {
  u8 mux;
  u8 group;
  u8 pin;
} Pin;

inline static void invalid() {
    __asm__("bkpt");
}

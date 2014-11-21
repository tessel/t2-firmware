#include "common/board.h"
#include "common/util.h"
#include "samd/usb_samd.h"

USB_ENDPOINTS(3);

int main(void) {
  clock_init();

  PORT->Group[0].DIRSET.reg = (1<<14);
  PORT->Group[0].OUTSET.reg = (1<<14);

  pin_mux(0, PINMUX_PA24G_USB_DM);
  pin_mux(0, PINMUX_PA25G_USB_DP);
  usb_init();
  usb_attach();

  __enable_irq();

  while(1) {

  }
}

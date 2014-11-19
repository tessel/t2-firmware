#include <system.h>
#include "samd/usb_samd.h"

USB_ENDPOINTS(3);

int main(void) {
  system_init();

  PORT->Group[0].DIRSET.reg = (1<<14);
  PORT->Group[0].OUTSET.reg = (1<<14);

  usb_init();
  usb_attach();

  __enable_irq();

  while(1) {

  }
}

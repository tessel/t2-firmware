#include "board.h"
#include <string.h>

__attribute__((aligned(16)))
DmacDescriptor dma_descriptors[12];

__attribute__((aligned(16)))
DmacDescriptor dma_descriptors_wb[12];

void dma_init() {
    memset(&dma_descriptors, 0, sizeof(dma_descriptors));
    memset(&dma_descriptors_wb, 0, sizeof(dma_descriptors_wb));

    PM->AHBMASK.reg |= PM_AHBMASK_DMAC;
    PM->APBBMASK.reg |= PM_APBBMASK_DMAC;

    DMAC->CTRL.bit.DMAENABLE = 0;
    DMAC->CTRL.bit.SWRST = 1;

    DMAC->BASEADDR.reg = (unsigned) &dma_descriptors;
    DMAC->WRBADDR.reg = (unsigned) &dma_descriptors_wb;

    DMAC->CTRL.reg = DMAC_CTRL_DMAENABLE | DMAC_CTRL_LVLEN(0xf);
}

void dma_abort(DmaChan chan) {
    DMAC->CHCTRLA.reg = 0;
}

void dma_sercom_start_tx(DmaChan chan, SercomId id, u8* src, unsigned size) {
    dma_descriptors[chan].SRCADDR.reg = (unsigned) src + size;
    dma_descriptors[chan].DSTADDR.reg = (unsigned) &sercom(id)->SPI.DATA;
    dma_descriptors[chan].BTCNT.reg = size;
    dma_descriptors[chan].BTCTRL.reg = DMAC_BTCTRL_VALID | DMAC_BTCTRL_SRCINC;

    DMAC->CHID.reg = chan;
    DMAC->CHINTENSET.reg = DMAC_CHINTENSET_TCMPL | DMAC_CHINTENSET_TERR;
    DMAC->CHCTRLB.reg = DMAC_CHCTRLB_TRIGACT_BEAT | DMAC_CHCTRLB_TRIGSRC(id*2 + 2);
    DMAC->CHCTRLA.reg = DMAC_CHCTRLA_ENABLE;
}

void dma_sercom_start_rx(DmaChan chan, SercomId id, u8* dst, unsigned size) {
    dma_descriptors[chan].SRCADDR.reg = (unsigned) &sercom(id)->SPI.DATA;
    dma_descriptors[chan].DSTADDR.reg = (unsigned) dst + size;
    dma_descriptors[chan].BTCNT.reg = size;
    dma_descriptors[chan].BTCTRL.reg = DMAC_BTCTRL_VALID | DMAC_BTCTRL_DSTINC;

    DMAC->CHID.reg = chan;
    DMAC->CHINTENSET.reg = DMAC_CHINTENSET_TCMPL | DMAC_CHINTENSET_TERR;
    DMAC->CHCTRLB.reg = DMAC_CHCTRLB_TRIGACT_BEAT | DMAC_CHCTRLB_TRIGSRC(id*2 + 1);
    DMAC->CHCTRLA.reg = DMAC_CHCTRLA_ENABLE;
}

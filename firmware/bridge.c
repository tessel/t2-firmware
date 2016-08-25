#include "firmware.h"

typedef enum BridgeState {
    BRIDGE_STATE_DISABLE,
    BRIDGE_STATE_IDLE,
    BRIDGE_STATE_CTRL,
    BRIDGE_STATE_DATA,
} BridgeState;

BridgeState bridge_state = BRIDGE_STATE_DISABLE;

typedef struct ControlPkt {
    u8 cmd;
    u8 status;
    u8 size[BRIDGE_NUM_CHAN];
} __attribute__((packed)) ControlPkt;

u8 was_open = 0;
ControlPkt ctrl_rx;
ControlPkt ctrl_tx;

DMA_DESC_ALIGN DmacDescriptor dma_chain_control_rx[2];
DMA_DESC_ALIGN DmacDescriptor dma_chain_control_tx[2];

DMA_DESC_ALIGN DmacDescriptor dma_chain_data_rx[BRIDGE_NUM_CHAN*2];
DMA_DESC_ALIGN DmacDescriptor dma_chain_data_tx[BRIDGE_NUM_CHAN*2];

// These variables store the state configured by bridge_start_{in, out}
u8* in_chan_ptr[BRIDGE_NUM_CHAN];
u8 in_chan_size[BRIDGE_NUM_CHAN];

u8* out_chan_ptr[BRIDGE_NUM_CHAN];
u8 out_chan_ready;

void bridge_init() {
    sercom_clock_enable(SERCOM_BRIDGE, GCLK_SYSTEM, 1);

    pin_mux(PIN_BRIDGE_MOSI);
    pin_mux(PIN_BRIDGE_MISO);
    pin_mux(PIN_BRIDGE_SCK);
    pin_mux(PIN_BRIDGE_CS);

    pin_in(PIN_FLASH_CS);

    pin_in(PIN_BRIDGE_SYNC);
    pin_pull_down(PIN_BRIDGE_SYNC);

    pin_low(PIN_BRIDGE_IRQ);
    pin_out(PIN_BRIDGE_IRQ);

    dma_sercom_configure_rx(DMA_BRIDGE_RX, SERCOM_BRIDGE);
    dma_fill_sercom_rx(&dma_chain_control_rx[0], SERCOM_BRIDGE, (u8*)&ctrl_rx, sizeof(ControlPkt));
    dma_fill_sercom_rx(&dma_chain_control_rx[1], SERCOM_BRIDGE, NULL, sizeof(ControlPkt));
    dma_link_chain(dma_chain_control_rx, 2);

    dma_sercom_configure_tx(DMA_BRIDGE_TX, SERCOM_BRIDGE);
    dma_fill_sercom_tx(&dma_chain_control_tx[0], SERCOM_BRIDGE, NULL, sizeof(ControlPkt));
    dma_fill_sercom_tx(&dma_chain_control_tx[1], SERCOM_BRIDGE, (u8*)&ctrl_tx, sizeof(ControlPkt));
    dma_link_chain(dma_chain_control_tx, 2);

    pin_mux_eic(PIN_BRIDGE_SYNC);
    eic_config(PIN_BRIDGE_SYNC, EIC_CONFIG_SENSE_BOTH);
    EIC->EVCTRL.reg |= 1 << pin_extint(PIN_BRIDGE_SYNC);
    evsys_config(EVSYS_BRIDGE_SYNC,
        EVSYS_ID_GEN_EIC_EXTINT_0 + pin_extint(PIN_BRIDGE_SYNC),
        EVSYS_USER_NONE);
    EVSYS->INTENSET.reg = EVSYS_EVD(EVSYS_BRIDGE_SYNC);

    bridge_state = BRIDGE_STATE_IDLE;
}

void bridge_disable() {
    NVIC_DisableIRQ(SERCOM0_IRQn + SERCOM_BRIDGE);
    dma_abort(DMA_FLASH_TX);
    dma_abort(DMA_FLASH_RX);

    pin_in(PIN_BRIDGE_MOSI);
    pin_in(PIN_BRIDGE_MISO);
    pin_in(PIN_BRIDGE_SCK);
    pin_in(PIN_BRIDGE_CS);
    pin_in(PIN_FLASH_CS);

    pin_low(PIN_BRIDGE_IRQ);

    bridge_state = BRIDGE_STATE_DISABLE;
}

void bridge_handle_sync() {
    if (pin_read(PIN_BRIDGE_SYNC) == 0) {
        // Reset SERCOM to clear FIFOs and prepare for header packet
        dma_abort(DMA_BRIDGE_TX);
        dma_abort(DMA_BRIDGE_RX);

        sercom_spi_slave_init(SERCOM_BRIDGE, BRIDGE_DIPO, BRIDGE_DOPO, 1, 1);

        ctrl_rx.cmd = 0x00;
        ctrl_tx.cmd = 0xCA;
        for (u8 chan=0; chan<BRIDGE_NUM_CHAN; chan++) {
            ctrl_tx.size[chan] = in_chan_size[chan];
        }
        ctrl_tx.status = out_chan_ready;

        dma_start_descriptor(DMA_BRIDGE_TX, &dma_chain_control_tx[0]);
        dma_start_descriptor(DMA_BRIDGE_RX, &dma_chain_control_rx[0]);
        DMAC->CHINTENCLR.reg = DMAC_CHINTENSET_TCMPL | DMAC_CHINTENSET_TERR; // note: depends on ID from previous call
        bridge_state = BRIDGE_STATE_CTRL;
    } else {
        // Configure DMA for the data phase
        if (ctrl_rx.cmd != 0x53) {
            bridge_state = BRIDGE_STATE_IDLE;
            return;
        }

        // Set this flag so the LED boot sequence stops
        booted = true;

        u8 desc = 0;

        // Create DMA chain
        for (u8 chan=0; chan<BRIDGE_NUM_CHAN; chan++) {
            u8 size = ctrl_rx.size[chan];
            if (ctrl_tx.status & (1<<chan) && size > 0) {
                out_chan_ready &= ~ (1<<chan);
                dma_fill_sercom_tx(&dma_chain_data_tx[desc], SERCOM_BRIDGE, NULL, size);
                dma_fill_sercom_rx(&dma_chain_data_rx[desc], SERCOM_BRIDGE, out_chan_ptr[chan], size);
                desc++;
            }

            size = ctrl_tx.size[chan];
            if (ctrl_rx.status & (1<<chan) && size > 0) {
                in_chan_size[chan] = 0;
                dma_fill_sercom_tx(&dma_chain_data_tx[desc], SERCOM_BRIDGE, in_chan_ptr[chan], size);
                dma_fill_sercom_rx(&dma_chain_data_rx[desc], SERCOM_BRIDGE, NULL, size);
                desc++;
            }
        }

        if (desc > 0) {
            dma_link_chain(dma_chain_data_tx, desc);
            dma_link_chain(dma_chain_data_rx, desc);
            dma_start_descriptor(DMA_BRIDGE_TX, &dma_chain_data_tx[0]);
            dma_start_descriptor(DMA_BRIDGE_RX, &dma_chain_data_rx[0]);
            DMAC->CHINTFLAG.reg = DMAC_CHINTFLAG_TCMPL | DMAC_CHINTFLAG_TERR; // note: depends on ID from previous call
            DMAC->CHINTENSET.reg = DMAC_CHINTENSET_TCMPL | DMAC_CHINTENSET_TERR;
            bridge_state = BRIDGE_STATE_DATA;
        } else if ((ctrl_rx.status & 0xF0) != (was_open & 0xF0)) {
            // No data to transfer, but we need to process an open/close, so trigger a DMA
            // completion interrupt (which runs at a lower priority). The interrupt is already
            // pending because of the control packet completion, and just needs to be unmasked
            // to trigger the interrupt.
            bridge_state = BRIDGE_STATE_DATA;
            DMAC->CHID.reg = DMA_BRIDGE_RX;
            DMAC->CHINTENSET.reg = DMAC_CHINTENSET_TCMPL | DMAC_CHINTENSET_TERR;
        } else {
            // No data to transfer
            bridge_state = BRIDGE_STATE_IDLE;
        }

        pin_low(PIN_BRIDGE_IRQ);
    }
}

void bridge_dma_rx_completion() {
    if (bridge_state == BRIDGE_STATE_DATA) {

        // Copy the global state to this stack frame in case SYNC changes and the ISR overwrites these
        uint8_t rx_status = ctrl_rx.status;
        uint8_t tx_status = ctrl_tx.status;
        uint8_t rx_size[BRIDGE_NUM_CHAN];
        memcpy(rx_size, ctrl_rx.size, sizeof(rx_size));
        uint8_t tx_size[BRIDGE_NUM_CHAN];
        memcpy(tx_size, ctrl_tx.size, sizeof(tx_size));
        __asm__ __volatile__ ("" : : : "memory");

        #define CHECK_OPEN(x) \
            if ((rx_status & (0x10<<x)) && !(was_open & (0x10<<x))) { \
                bridge_open_##x(rx_size[x]); \
            }

        #define CHECK_COMPLETION_OUT(x) \
            if (tx_status & (1<<x) && rx_size[x] > 0) { \
                bridge_completion_out_##x(rx_size[x]); \
            }

        #define CHECK_COMPLETION_IN(x) \
            if (rx_status & (1<<x) && tx_size[x] > 0) { \
                bridge_completion_in_##x(); \
            }

        #define CHECK_CLOSE(x) \
            if (!(rx_status & (0x10<<x)) && (was_open & (0x10<<x))) { \
                bridge_close_##x(rx_size[x]); \
            }

        CHECK_OPEN(0)
        CHECK_OPEN(1)
        CHECK_OPEN(2)

        CHECK_COMPLETION_OUT(0);
        CHECK_COMPLETION_OUT(1);
        CHECK_COMPLETION_OUT(2);

        CHECK_COMPLETION_IN(0);
        CHECK_COMPLETION_IN(1);
        CHECK_COMPLETION_IN(2);

        CHECK_CLOSE(0)
        CHECK_CLOSE(1)
        CHECK_CLOSE(2)


        #undef CHECK_OPEN
        #undef CHECK_COMPLETION_OUT
        #undef CHECK_COMPLETION_IN
        #undef CHECK_CLOSE

        was_open = ctrl_rx.status & 0xF0;
        bridge_state = BRIDGE_STATE_IDLE;
    }
}

void bridge_start_in(u8 channel, u8* data, u8 length) {
    __disable_irq();
    in_chan_ptr[channel] = data;
    in_chan_size[channel] = length;
    __enable_irq();
    pin_high(PIN_BRIDGE_IRQ);
}

void bridge_start_out(u8 channel, u8* data) {
    __disable_irq();
    out_chan_ptr[channel] = data;
    out_chan_ready |= (1<<channel);
    __enable_irq();
    pin_high(PIN_BRIDGE_IRQ);
}

void bridge_enable_chan(u8 channel) {
    __disable_irq();
    out_chan_ready |= (0x10<<channel);
    __enable_irq();
    pin_high(PIN_BRIDGE_IRQ);
}

void bridge_disable_chan(u8 channel) {
    __disable_irq();
    out_chan_ready &= ~(0x11<<channel); // Also clears the "ready to accept data" bit
    in_chan_size[channel] = 0; // Clears any data that was waiting to be sent
    __enable_irq();
    pin_high(PIN_BRIDGE_IRQ);
}

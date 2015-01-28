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
    u8 rx_state;
    u8 tx_size[BRIDGE_NUM_CHAN];
} __attribute__((packed)) ControlPkt;

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
    sercom_spi_slave_init(SERCOM_BRIDGE, BRIDGE_DIPO, BRIDGE_DOPO, 1, 1);

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
    evsys_config(EVSYS_BRIDGE_SYNC, EVSYS_ID_GEN_EIC_EXTINT_0 + pin_extint(PIN_BRIDGE_SYNC));
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
        pin_high(PIN_PBCS);
        // Reset SERCOM to clear FIFOs and prepare for header packet
        dma_abort(DMA_BRIDGE_TX);
        dma_abort(DMA_BRIDGE_RX);

        sercom_spi_slave_init(SERCOM_BRIDGE, BRIDGE_DIPO, BRIDGE_DOPO, 1, 1);

        ctrl_rx.cmd = 0x00;
        ctrl_tx.cmd = 0xCA;
        for (u8 chan=0; chan<BRIDGE_NUM_CHAN; chan++) {
            ctrl_tx.tx_size[chan] = in_chan_size[chan];
        }
        ctrl_tx.rx_state = out_chan_ready;

        dma_start_descriptor(DMA_BRIDGE_TX, &dma_chain_control_tx[0]);
        dma_start_descriptor(DMA_BRIDGE_RX, &dma_chain_control_rx[0]);
        bridge_state = BRIDGE_STATE_CTRL;
    } else {
        // Configure DMA for the data phase

    }
}

void bridge_dma_rx_completion() {
    if (bridge_state == BRIDGE_STATE_DISABLE) {
        return;
    } else if (bridge_state == BRIDGE_STATE_CTRL) {
        if (ctrl_rx.cmd != 0x53) {
            invalid();
            bridge_state = BRIDGE_STATE_IDLE;
            return;
        }

        u8 desc = 0;

        // Create DMA chain
        for (u8 chan=0; chan<BRIDGE_NUM_CHAN; chan++) {
            u8 size = ctrl_rx.tx_size[chan];
            if (ctrl_tx.rx_state & (1<<chan) && size > 0) {
                dma_fill_sercom_tx(&dma_chain_data_tx[desc], SERCOM_BRIDGE, NULL, size);
                dma_fill_sercom_rx(&dma_chain_data_rx[desc], SERCOM_BRIDGE, out_chan_ptr[chan], size);
                desc++;
            }

            size = ctrl_tx.tx_size[chan];
            if (ctrl_rx.rx_state & (1<<chan) && size > 0) {
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
            bridge_state = BRIDGE_STATE_DATA;
        } else {
            // No data to transfer
            bridge_state = BRIDGE_STATE_IDLE;
        }

        pin_low(PIN_BRIDGE_IRQ);

    } else if (bridge_state == BRIDGE_STATE_DATA) {

        #define CHECK_COMPLETION_OUT(x) \
            if (ctrl_tx.rx_state & (1<<x) && ctrl_rx.tx_size[x] > 0) { \
                out_chan_ready &= ~ (1<<x); \
                bridge_completion_out_##x(ctrl_rx.tx_size[x]); \
            }

        #define CHECK_COMPLETION_IN(x) \
            if (ctrl_rx.rx_state & (1<<x) && ctrl_tx.tx_size[x] > 0) { \
                in_chan_size[x] = 0; \
                bridge_completion_in_##x(); \
            }

        CHECK_COMPLETION_OUT(0);
        CHECK_COMPLETION_OUT(1);
        CHECK_COMPLETION_OUT(2);

        CHECK_COMPLETION_IN(0);
        CHECK_COMPLETION_IN(1);
        CHECK_COMPLETION_IN(2);

        #undef CHECK_COMPLETION_OUT
        #undef CHECK_COMPLETION_IN

        bridge_state = BRIDGE_STATE_IDLE;
    }
}

void bridge_start_in(u8 channel, u8* data, u8 length) {
    in_chan_ptr[channel] = data;
    in_chan_size[channel] = length;
    pin_high(PIN_BRIDGE_IRQ);
}

void bridge_start_out(u8 channel, u8* data) {
    out_chan_ptr[channel] = data;
    out_chan_ready |= (1<<channel);
    pin_high(PIN_BRIDGE_IRQ);
}

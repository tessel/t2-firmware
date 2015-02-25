#include "firmware.h"

typedef enum PortState {
    PORT_DISABLE,
    PORT_READ_CMD,
    PORT_READ_ARG,
    PORT_EXEC,
    PORT_EXEC_ASYNC,
} PortState;

typedef enum PortCmd {
    CMD_NOP = 0,
    CMD_FLUSH = 1,
    CMD_ECHO = 2,
    CMD_GPIO_IN = 3,
    CMD_GPIO_HIGH = 4,
    CMD_GPIO_LOW = 5,
    CMD_GPIO_TOGGLE = 21,
    CMD_GPIO_CFG = 6,
    CMD_GPIO_WAIT = 7,
    CMD_GPIO_INT = 8,

    CMD_ENABLE_SPI = 10,
    CMD_DISABLE_SPI = 11,
    CMD_ENABLE_I2C = 12,
    CMD_DISABLE_I2C = 13,
    CMD_ENABLE_UART = 14,
    CMD_DISABLE_UART = 15,
    CMD_TX = 16,
    CMD_RX = 17,
    CMD_TXRX = 18,
    CMD_START = 19,
    CMD_STOP = 20,
} PortCmd;

typedef enum PortMode {
    MODE_NONE,
    MODE_SPI,
    MODE_I2C,
    MODE_UART,
} PortMode;

typedef enum ExecStatus {
    EXEC_DONE = PORT_READ_CMD,
    EXEC_CONTINUE = PORT_EXEC,
    EXEC_ASYNC = PORT_EXEC_ASYNC,
} ExecStatus;

void port_step(PortData* p);

void port_init(PortData* p, u8 chan, const TesselPort* port, DmaChan dma_tx, DmaChan dma_rx) {
    p->chan = chan;
    p->port = port;
    p->dma_tx = dma_tx;
    p->dma_rx = dma_rx;
}

void port_enable(PortData* p) {
    bridge_start_out(p->chan, p->cmd_buf);
    p->pending_in = false;
    p->pending_out = true;
    p->cmd_len = 0;
    p->cmd_pos = 0;
    p->reply_len = 0;
    p->state = PORT_READ_CMD;
    p->mode = MODE_NONE;
    NVIC_EnableIRQ(SERCOM0_IRQn + p->port->uart_i2c);

    pin_high(p->port->power);
    for (int i = 0; i<8; i++) {
        pin_pull_up(p->port->gpio[i]);
    }
}

void port_disable(PortData* p) {
    p->state = PORT_DISABLE;
    sercom_reset(p->port->spi);
    sercom_reset(p->port->uart_i2c);
    dma_abort(p->dma_tx);
    dma_abort(p->dma_rx);

    for (int i = 0; i<8; i++) {
        pin_float(p->port->gpio[i]);
    }
    pin_low(p->port->power);
}

bool port_cmd_has_arg(PortCmd cmd) {
    switch (cmd) {
        case CMD_NOP:
        case CMD_FLUSH:
        case CMD_DISABLE_SPI:
        case CMD_DISABLE_I2C:
        case CMD_DISABLE_UART:
        case CMD_STOP:
            return false;

        // Length argument:
        case CMD_ECHO:
        case CMD_TX:
        case CMD_RX:
        case CMD_TXRX:
            return true;

        // Pin argument:
        case CMD_GPIO_IN:
        case CMD_GPIO_HIGH:
        case CMD_GPIO_LOW:
        case CMD_GPIO_TOGGLE:
        case CMD_GPIO_WAIT:
        case CMD_GPIO_INT:
        case CMD_GPIO_CFG:
            return true;

        // Config argument:
        case CMD_ENABLE_SPI:
        case CMD_ENABLE_I2C:
        case CMD_ENABLE_UART:
        case CMD_START:
            return true;
    }
    invalid();
    return false;
}

u32 port_tx_len(PortData* p) {
    u32 size = p->arg;
    u32 cmd_remaining = p->cmd_len - p->cmd_pos;
    if (cmd_remaining < size) {
        size = cmd_remaining;
    }
    return size;
}

u32 port_rx_len(PortData* p) {
    u32 size = p->arg;
    u32 reply_remaining = BUF_SIZE - p->reply_len;
    if (reply_remaining < size) {
        size = reply_remaining;
    }
    return size;
}

u32 port_txrx_len(PortData *p) {
    u32 size = p->arg;
    u32 cmd_remaining = p->cmd_len - p->cmd_pos;
    if (cmd_remaining < size) {
        size = cmd_remaining;
    }
    u32 reply_remaining = BUF_SIZE - p->reply_len;
    if (reply_remaining < size) {
        size = reply_remaining;
    }
    return size;
}

Pin port_selected_pin(PortData* p) {
    return p->port->gpio[p->arg % 8];
}

void port_exec_async_complete(PortData* p, ExecStatus s) {
    if (p->state != PORT_EXEC_ASYNC) {
        invalid();
    }
    p->state = s;
    port_step(p);
}

ExecStatus port_begin_cmd(PortData *p) {
    switch (p->cmd) {
        case CMD_NOP:
            return EXEC_DONE;

        case CMD_ECHO:
        case CMD_TX:
        case CMD_RX:
        case CMD_TXRX:
            return EXEC_CONTINUE;

        case CMD_GPIO_IN:
            pin_in(port_selected_pin(p));
            return EXEC_DONE;
        case CMD_GPIO_HIGH:
            pin_high(port_selected_pin(p));
            pin_out(port_selected_pin(p));
            return EXEC_DONE;
        case CMD_GPIO_LOW:
            pin_low(port_selected_pin(p));
            pin_out(port_selected_pin(p));
            return EXEC_DONE;
        case CMD_GPIO_TOGGLE:
            pin_toggle(port_selected_pin(p));
            pin_out(port_selected_pin(p));
            return EXEC_DONE;

        case CMD_GPIO_WAIT:
        case CMD_GPIO_INT:
        case CMD_GPIO_CFG:
            return EXEC_DONE;

        case CMD_ENABLE_SPI:
            sercom_spi_master_init(p->port->spi, p->port->spi_dipo, p->port->spi_dopo, 0, 0);
            dma_sercom_configure_tx(p->dma_tx, p->port->spi);
            dma_sercom_configure_rx(p->dma_rx, p->port->spi);
            DMAC->CHINTENSET.reg = DMAC_CHINTENSET_TCMPL | DMAC_CHINTENSET_TERR; // ID depends on prev call
            pin_mux(p->port->mosi);
            pin_mux(p->port->miso);
            pin_mux(p->port->sck);
            p->mode = MODE_SPI;
            return EXEC_DONE;

        case CMD_DISABLE_SPI:
            // TODO: disable SERCOM
            pin_gpio(p->port->mosi);
            pin_gpio(p->port->miso);
            pin_gpio(p->port->sck);
            p->mode = MODE_NONE;
            return EXEC_DONE;

        case CMD_ENABLE_I2C:
            sercom_i2c_master_init(p->port->uart_i2c);
            pin_mux(p->port->sda);
            pin_mux(p->port->scl);
            sercom(p->port->uart_i2c)->I2CM.INTENSET.reg = SERCOM_I2CM_INTENSET_SB | SERCOM_I2CM_INTENSET_MB;
            p->mode = MODE_I2C;
            return EXEC_DONE;

        case CMD_DISABLE_I2C:
            pin_gpio(p->port->sda);
            pin_gpio(p->port->scl);
            p->mode = MODE_NONE;
            return EXEC_DONE;

        case CMD_START:
            sercom(p->port->uart_i2c)->I2CM.ADDR.reg = p->arg;
            p->arg = 0;
            return EXEC_ASYNC;

        case CMD_STOP:
            sercom(p->port->uart_i2c)->I2CM.CTRLB.bit.ACKACT = 1;
            sercom(p->port->uart_i2c)->I2CM.CTRLB.bit.CMD = 3;
            return EXEC_DONE;

        case CMD_ENABLE_UART:
            return EXEC_DONE;

        case CMD_DISABLE_UART:
            return EXEC_DONE;
    }
    invalid();
    return EXEC_DONE;
}

ExecStatus port_continue_cmd(PortData *p) {
    switch (p->cmd) {
        case CMD_ECHO: {
            u32 size = port_txrx_len(p);
            memcpy(&p->reply_buf[p->reply_len], &p->cmd_buf[p->cmd_pos], size);
            p->reply_len += size;
            p->cmd_pos += size;
            p->arg -= size;
            return p->arg == 0 ? EXEC_DONE : EXEC_CONTINUE;
        }
        case CMD_TX:
            if (p->mode == MODE_SPI) {
                u32 size = port_tx_len(p);
                dma_sercom_start_tx(p->dma_tx, p->port->spi, &p->cmd_buf[p->cmd_pos], size);
                p->cmd_pos += size;
                p->arg -= size;
            } else if (p->mode == MODE_I2C) {
                sercom(p->port->uart_i2c)->I2CM.DATA.reg = p->cmd_buf[p->cmd_pos];
                p->cmd_pos += 1;
                p->arg -= 1;
            }
            return EXEC_ASYNC;
        case CMD_RX:
            if (p->mode == MODE_SPI) {
                u32 size = port_rx_len(p);
                dma_sercom_start_rx(p->dma_rx, p->port->spi, &p->reply_buf[p->reply_len], size);
                dma_sercom_start_tx(p->dma_tx, p->port->spi, NULL, size);
                p->reply_len += size;
                p->arg -= size;
            } if (p->mode == MODE_I2C) {
                p->reply_buf[p->reply_len] = sercom(p->port->uart_i2c)->I2CM.DATA.reg;
                sercom(p->port->uart_i2c)->I2CM.CTRLB.bit.ACKACT = 0;
                sercom(p->port->uart_i2c)->I2CM.CTRLB.bit.CMD = 2;
                p->reply_len += 1;
                p->arg -= 1;
            }
            return EXEC_ASYNC;
        case CMD_TXRX:
            if (p->mode == MODE_SPI) {
                u32 size = port_txrx_len(p);
                dma_sercom_start_rx(p->dma_rx, p->port->spi, &p->reply_buf[p->reply_len], size);
                dma_sercom_start_tx(p->dma_tx, p->port->spi, &p->cmd_buf[p->cmd_pos], size);
                p->reply_len += size;
                p->cmd_pos += size;
                p->arg -= size;
            }
            return EXEC_ASYNC;
    }
    return EXEC_DONE;
}

void port_step(PortData* p) {
    if (p->state == PORT_DISABLE || p->state == PORT_EXEC_ASYNC) {
        invalid();
        return;
    }

    while (1) {
        // If the command buffer has been processed, request a new one
        if (p->cmd_pos >= p->cmd_len && !p->pending_out) {
            p->pending_out = true;
            bridge_start_out(p->chan, p->cmd_buf);
        }
        // If the reply buffer is full, flush it.
        // Or, if there is any data and no commands, might as well flush.
        if ((p->reply_len >= BUF_SIZE || (p->pending_out && p->reply_len > 0)) && !p->pending_in) {
            p->pending_in = true;
            bridge_start_in(p->chan, p->reply_buf, p->reply_len);
        }

        // Wait for bridge transfers to complete;
        // TODO: multiple-buffer FIFO
        if (p->pending_in || p->pending_out) break;

        if (p->state == PORT_READ_CMD) {
            p->cmd = p->cmd_buf[p->cmd_pos++];
            if (port_cmd_has_arg(p->cmd)) {
                p->state = PORT_READ_ARG;
            } else {
                p->state = port_begin_cmd(p);
            }
        } else if (p->state == PORT_READ_ARG) {
            p->arg = p->cmd_buf[p->cmd_pos++];
            p->state = port_begin_cmd(p);
        } else if (p->state == PORT_EXEC) {
            p->state = port_continue_cmd(p);
        } else if (p->state == PORT_EXEC_ASYNC) {
            break;
        }
    }
}

void port_bridge_out_completion(PortData* p, u8 len) {
    p->pending_out = false;
    p->cmd_len = len;
    p->cmd_pos = 0;
    port_step(p);
}

void port_bridge_in_completion(PortData* p) {
    p->pending_in = false;
    p->reply_len = 0;
    port_step(p);
}

void port_dma_rx_completion(PortData* p) {
    if (p->state == PORT_EXEC_ASYNC) {
        p->state = (p->arg == 0 ? EXEC_DONE : EXEC_CONTINUE);
        port_step(p);
    } else {
        invalid();
    }
}

void bridge_handle_sercom_uart_i2c(PortData* p) {
    sercom(p->port->uart_i2c)->I2CM.INTFLAG.reg = SERCOM_I2CM_INTFLAG_SB | SERCOM_I2CM_INTFLAG_MB;
    if (p->state == PORT_EXEC_ASYNC) {
        p->state = (p->arg == 0 ? EXEC_DONE : EXEC_CONTINUE);
        port_step(p);
    } else {
        invalid();
    }
}

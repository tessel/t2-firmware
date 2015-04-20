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

#define FLAG_SPI_CPOL (1<<0)
#define FLAG_SPI_CPHA (1<<1)

typedef enum {
    REPLY_ACK = 0x80,
    REPLY_NACK = 0x81,
    REPLY_HIGH = 0x82,
    REPLY_LOW  = 0x83,
    REPLY_DATA = 0x84,

    REPLY_ASYNC_PIN_CHANGE_N = 0xC0, // 0xC0 + n
    REPLY_ASYNC_UART_RX = 0xD0
} PortReply;

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
void port_enable_async_events(PortData *p);
void port_disable_async_events(PortData *p);
void uart_send_data(PortData *p);

inline static bool port_pin_supports_interrupt(PortData* p, u8 i) {
    u8 extint = pin_extint(p->port->gpio[i]);
    return !!((1 << extint) & p->port->pin_interrupts);
}

void port_init(PortData* p, u8 chan, const TesselPort* port, u8 clock_channel, DmaChan dma_tx, DmaChan dma_rx) {
    p->chan = chan;
    p->port = port;
    p->dma_tx = dma_tx;
    p->dma_rx = dma_rx;
    p->clock_channel = clock_channel;
    p->uart_buf.data_pos = 255;

    sercom_clock_enable(p->port->spi, p->clock_channel, 1);
    sercom_clock_enable(p->port->uart_i2c, p->clock_channel, 1);
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

    port_disable_async_events(p);

    for (int i = 0; i<8; i++) {
        if (port_pin_supports_interrupt(p, i)) {
            eic_config(p->port->gpio[i], EIC_CONFIG_SENSE_NONE);
        }
        pin_float(p->port->gpio[i]);
    }
    EIC->INTFLAG.reg = p->port->pin_interrupts;

    pin_low(p->port->power);
}

void port_send_status(PortData* p, u8 d) {
    if (p->reply_len >= BRIDGE_BUF_SIZE) {
        invalid();
        return;
    }
    p->reply_buf[p->reply_len++] = d;
}

// returns number of arguments
int port_cmd_args(PortCmd cmd) {
    switch (cmd) {
        case CMD_NOP:
        case CMD_FLUSH:
        case CMD_DISABLE_SPI:
        case CMD_DISABLE_I2C:
        case CMD_DISABLE_UART:
        case CMD_STOP:
            return 0;

        // Length argument:
        case CMD_ECHO:
        case CMD_TX:
        case CMD_RX:
        case CMD_TXRX:
            return 1;

        // Pin argument:
        case CMD_GPIO_IN:
        case CMD_GPIO_HIGH:
        case CMD_GPIO_LOW:
        case CMD_GPIO_TOGGLE:
        case CMD_GPIO_WAIT:
        case CMD_GPIO_INT:
        case CMD_GPIO_CFG:
            return 1;

        // Config argument:
        case CMD_ENABLE_SPI:
            // 1 byte for mode, 1 byte for freq, 1 byte for div
            return 3;
        case CMD_ENABLE_I2C:
            // 1 byte for freq
            return 1;
        case CMD_ENABLE_UART:
            return 2; // 1 byte for baud, 1 byte for mode
        case CMD_START:
            return 1; // 1 byte for addr
    }
    invalid();
    return 0;
}

u32 port_tx_len(PortData* p) {
    u32 size = p->arg[0];
    u32 cmd_remaining = p->cmd_len - p->cmd_pos;
    if (cmd_remaining < size) {
        size = cmd_remaining;
    }
    return size;
}

u32 port_rx_len(PortData* p) {
    u32 size = p->arg[0];
    u32 reply_remaining = BRIDGE_BUF_SIZE - p->reply_len;
    if (reply_remaining < size) {
        size = reply_remaining;
    }
    return size;
}

u32 port_txrx_len(PortData *p) {
    u32 size = p->arg[0];
    u32 cmd_remaining = p->cmd_len - p->cmd_pos;
    if (cmd_remaining < size) {
        size = cmd_remaining;
    }
    u32 reply_remaining = BRIDGE_BUF_SIZE - p->reply_len;
    if (reply_remaining < size) {
        size = reply_remaining;
    }
    return size;
}

Pin port_selected_pin(PortData* p) {
    return p->port->gpio[p->arg[0] % 8];
}

void port_exec_async_complete(PortData* p, ExecStatus s) {
    if (p->state != PORT_EXEC_ASYNC) {
        invalid();
    }
    p->state = s;
    port_step(p);
}

void uart_send_data(PortData *p){
    if (p->uart_buf.buf_len > 0) {
        // pad 2 bytes at the beginning
        // 1st byte indicates uart rx
        // 2nd byte indicates uart rx number. 
        // this also means rx number has to be <255
        // p->reply_len += uart_buf.buf_len;
        if (p->uart_buf.data_pos == 255) {
            // if this is the first time that uart data is 
            // getting put into reply buf, pad by 2.
            p->uart_buf.data_pos = p->reply_len; // keep track of where we write uart data headers

            p->reply_buf[p->reply_len++] = REPLY_ASYNC_UART_RX;
            p->reply_buf[p->reply_len++] = p->uart_buf.buf_len;
            // p->reply_len += 2; 
        } else {
            // otherwise we are appending uart data to the buffer
            p->reply_buf[p->uart_buf.data_pos+1] += p->uart_buf.buf_len;
        }
        
        // copy data into reply buf
        for (uint8_t i = 0; i < p->uart_buf.buf_len; i++) {
            p->reply_buf[p->reply_len++] = p->uart_buf.rx[p->uart_buf.tail];

            RX_BUF_INCR(p->uart_buf.tail);
        }

        p->uart_buf.buf_len = 0;
        port_step(p);
    }
}

ExecStatus port_begin_cmd(PortData *p) {
    switch (p->cmd) {
        case CMD_NOP:
            return EXEC_DONE;

        case CMD_ECHO:
        case CMD_RX:
        case CMD_TXRX:
            port_send_status(p, REPLY_DATA);
            return EXEC_CONTINUE;

        case CMD_TX:
            return EXEC_CONTINUE;

        case CMD_GPIO_IN:
            pin_in(port_selected_pin(p));
            u8 state = pin_read(port_selected_pin(p));
            port_send_status(p, state ? REPLY_HIGH : REPLY_LOW);
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

        case CMD_GPIO_INT: {
            u8 pin = p->arg[0] & 0x7;
            u8 mode = (p->arg[0] >> 4) & 0x07;

            if (port_pin_supports_interrupt(p, pin)) {
                eic_config(p->port->gpio[pin], mode);
                if (mode != 0) {
                    pin_mux_eic(p->port->gpio[pin]);
                } else {
                    pin_gpio(p->port->gpio[pin]);
                }
            }

            return EXEC_DONE;
        }

        case CMD_GPIO_WAIT:
        case CMD_GPIO_CFG:
            return EXEC_DONE;

        case CMD_ENABLE_SPI:
            // set up clock in case we need to use a divider
            sercom_clock_enable(p->port->spi, p->clock_channel, p->arg[2]);
            // can only do spi master
            sercom_spi_master_init(p->port->spi, p->port->spi_dipo, p->port->spi_dopo,
                !!(p->arg[0] & FLAG_SPI_CPOL), !!(p->arg[0] & FLAG_SPI_CPHA), p->arg[1]);
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
            sercom_i2c_master_init(p->port->uart_i2c, p->arg[0]);
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
            sercom(p->port->uart_i2c)->I2CM.ADDR.reg = p->arg[0];
            p->arg[0] = 0;
            return EXEC_ASYNC;

        case CMD_STOP:
            sercom(p->port->uart_i2c)->I2CM.CTRLB.bit.ACKACT = 1;
            sercom(p->port->uart_i2c)->I2CM.CTRLB.bit.CMD = 3;
            return EXEC_DONE;

        case CMD_ENABLE_UART:
            // set up uart
            pin_mux(p->port->tx);
            pin_mux(p->port->rx);
            sercom_uart_init(p->port->uart_i2c, p->port->uart_dipo, p->port->uart_dopo, 63019);
            dma_sercom_configure_tx(p->dma_tx, p->port->uart_i2c);
            DMAC->CHINTENSET.reg = DMAC_CHINTENSET_TCMPL | DMAC_CHINTENSET_TERR;

            p->mode = MODE_UART;
            
            // clear out buffer
            memset(p->uart_buf.rx, 0, UART_RX_SIZE);
            p->uart_buf.head = 0;
            p->uart_buf.tail = 0;
            // set up interrupt on uart receive data complete
            sercom(p->port->uart_i2c)->USART.INTENSET.reg = SERCOM_USART_INTFLAG_RXC;
            
            // set up interrupt timer so that uart data will get written on timeout
            timer_delay_ms_enable(TC_DELAY_CALLBACK, 10);

            return EXEC_DONE;

        case CMD_DISABLE_UART:
            p->mode = MODE_NONE;
            // disable interrupt only if both ports are not in uart mode
            if (port_a.mode != MODE_UART && port_b.mode != MODE_UART) {
                timer_delay_disable(TC_DELAY_CALLBACK);
            }
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
            p->arg[0] -= size;
            return p->arg[0] == 0 ? EXEC_DONE : EXEC_CONTINUE;
        }
        case CMD_TX:
            if (p->mode == MODE_SPI) {
                u32 size = port_tx_len(p);
                dma_sercom_start_rx(p->dma_rx, p->port->spi, NULL, size);
                dma_sercom_start_tx(p->dma_tx, p->port->spi, &p->cmd_buf[p->cmd_pos], size);
                p->cmd_pos += size;
                p->arg[0] -= size;
            } else if (p->mode == MODE_I2C) {
                sercom(p->port->uart_i2c)->I2CM.DATA.reg = p->cmd_buf[p->cmd_pos];
                p->cmd_pos += 1;
                p->arg[0] -= 1;
            } else if (p->mode == MODE_UART) {
                u32 size = port_tx_len(p);
                // start dma transfer
                // dma_sercom_start_rx(p->dma_rx, p->port->uart_i2c, NULL, size);
                dma_sercom_start_tx(p->dma_tx, p->port->uart_i2c, &p->cmd_buf[p->cmd_pos], size);
                p->cmd_pos += size;
                p->arg[0] -= size;
            }
            return EXEC_ASYNC;
        case CMD_RX:
            if (p->mode == MODE_SPI) {
                u32 size = port_rx_len(p);
                dma_sercom_start_rx(p->dma_rx, p->port->spi, &p->reply_buf[p->reply_len], size);
                dma_sercom_start_tx(p->dma_tx, p->port->spi, NULL, size);
                p->reply_len += size;
                p->arg[0] -= size;
            } else if (p->mode == MODE_I2C) {
                p->reply_buf[p->reply_len] = sercom(p->port->uart_i2c)->I2CM.DATA.reg;
                sercom(p->port->uart_i2c)->I2CM.CTRLB.bit.ACKACT = 0;
                sercom(p->port->uart_i2c)->I2CM.CTRLB.bit.CMD = 2;
                p->reply_len += 1;
                p->arg[0] -= 1;
            }
            return EXEC_ASYNC;
        case CMD_TXRX:
            if (p->mode == MODE_SPI) {
                u32 size = port_txrx_len(p);
                dma_sercom_start_rx(p->dma_rx, p->port->spi, &p->reply_buf[p->reply_len], size);
                dma_sercom_start_tx(p->dma_tx, p->port->spi, &p->cmd_buf[p->cmd_pos], size);
                p->reply_len += size;
                p->cmd_pos += size;
                p->arg[0] -= size;
            }
            return EXEC_ASYNC;
    }
    return EXEC_DONE;
}

void port_enable_async_events(PortData *p) {
    pin_low(PORT_A.g3);
    EIC->INTENSET.reg = p->port->pin_interrupts;

    // enable uart data getting copied
    NVIC_EnableIRQ(TC3_IRQn + TC_DELAY_CALLBACK - 3);
}

void port_disable_async_events(PortData *p) {
    // pin_high(PORT_A.g3);
    EIC->INTENCLR.reg = p->port->pin_interrupts;

    // disable uart data getting copied
    NVIC_DisableIRQ(TC3_IRQn + TC_DELAY_CALLBACK - 3);
}

void port_step(PortData* p) {
    if ( (p->state == PORT_DISABLE || p->state == PORT_EXEC_ASYNC)
        && p->mode != MODE_UART) {
        invalid();
        return;
    }

    port_disable_async_events(p);

    while (1) {
        // If the command buffer has been processed, request a new one
        if (p->cmd_pos >= p->cmd_len && !p->pending_out) {
            p->pending_out = true;
            bridge_start_out(p->chan, p->cmd_buf);
        }
        // If the reply buffer is full, flush it.
        // Or, if there is any data and no commands, might as well flush.
        if ((p->reply_len >= BRIDGE_BUF_SIZE || (p->pending_out && p->reply_len > 0)) && !p->pending_in) {
            p->pending_in = true;
            bridge_start_in(p->chan, p->reply_buf, p->reply_len);
        }

        // Wait for bridge transfers to complete;
        // TODO: multiple-buffer FIFO
        if (p->pending_in || p->pending_out) {
            if (!p->pending_in && p->state == PORT_READ_CMD) {
                // If we're waiting for further commands, also
                // wait for async events.
                port_enable_async_events(p);
            }
            break;
        };

        if (p->state == PORT_READ_CMD) {
            p->cmd = p->cmd_buf[p->cmd_pos++];
            p->arg_len = port_cmd_args(p->cmd);

            if (p->arg_len > 0) {
                p->arg_pos = 0;
                p->state = PORT_READ_ARG;
            } else {
                p->state = port_begin_cmd(p);
            }
        } else if (p->state == PORT_READ_ARG) {
            if (p->arg_len == 0) invalid();
            p->arg[p->arg_pos++] = p->cmd_buf[p->cmd_pos++];
            p->arg_len--;

            if (p->arg_len == 0) {
                p->state = port_begin_cmd(p);
            }
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
    p->uart_buf.data_pos = 255;
    port_step(p);
}

void port_dma_rx_completion(PortData* p) {
    if (p->state == PORT_EXEC_ASYNC) {
        p->state = (p->arg[0] == 0 ? EXEC_DONE : EXEC_CONTINUE);
        port_step(p);
    } else {
        invalid();
    }
}

void port_dma_tx_completion(PortData* p) {
    if (p->state == PORT_EXEC_ASYNC) {
        p->state = (p->arg[0] == 0 ? EXEC_DONE : EXEC_CONTINUE);
        port_step(p);
    } else {
        invalid();
    }
}

int number_hit = 0;
int times_sent = 0;

void bridge_handle_sercom_uart_i2c(PortData* p) {
    // check if its a uart or i2c irq
    if (sercom(p->port->uart_i2c)->USART.INTFLAG.reg & SERCOM_USART_INTFLAG_RXC) {
        number_hit++;
        // reset timeout to zero
        timer_delay_ms_clear(TC_DELAY_CALLBACK);

        // read data and push into buffer
        p->uart_buf.rx[p->uart_buf.head] = sercom(p->port->uart_i2c)->USART.DATA.reg;
        RX_BUF_INCR(p->uart_buf.head);
        p->uart_buf.buf_len++;

        // TODO: there is a bug that can occur if we run out of 
        // room on the uart buffer and we are in the middle of
        // sending data on the coprocessor bridge. If that happens
        // then there will be uart data dropped.
        // Ideally this won't happen if the buffer is big enough
        if (p->uart_buf.head == p->uart_buf.tail) {
            times_sent++;
            uart_send_data(p);
        }

        // clear irq
        sercom(p->port->uart_i2c)->USART.INTFLAG.reg = SERCOM_USART_INTFLAG_RXC;

        return;
    }

    // interrupt on i2c flag
    sercom(p->port->uart_i2c)->I2CM.INTFLAG.reg = SERCOM_I2CM_INTFLAG_SB | SERCOM_I2CM_INTFLAG_MB;
    if (p->state == PORT_EXEC_ASYNC) {
        p->state = (p->arg[0] == 0 ? EXEC_DONE : EXEC_CONTINUE);
        port_step(p);
    } else {
        invalid();
    }
}

void port_handle_extint(PortData *p, u32 flags) {
    if (p->state == PORT_READ_CMD) {
        // Async event
        for (int pin = 0; pin<8; pin++) {
            if (port_pin_supports_interrupt(p, pin)) {
                Pin sys_pin = p->port->gpio[pin];
                if (flags & (1 << pin_extint(sys_pin))) {
                    port_send_status(p, REPLY_ASYNC_PIN_CHANGE_N + pin);
                    if (eic_read_config(sys_pin) & EIC_CONFIG_SENSE_LEVEL) {
                        // Async level interrupts only trigger once
                        eic_config(sys_pin, EIC_CONFIG_SENSE_NONE);
                    }
                }
            }
        }
        EIC->INTFLAG.reg = p->port->pin_interrupts & flags;
    } else {
        invalid();
    }

    port_step(p);
}

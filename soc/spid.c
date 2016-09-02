#define _GNU_SOURCE
#include <sys/socket.h>
#include <sys/un.h>
#include <stdlib.h>
#include <stdio.h>
#include <string.h>
#include <stdbool.h>
#include <stdint.h>
#include <errno.h>
#include <poll.h>
#include <sys/types.h>
#include <sys/stat.h>
#include <fcntl.h>
#include <unistd.h>
#include <sys/ioctl.h>
#include <linux/types.h>
#include <linux/spi/spidev.h>
#include <syslog.h>

#define N_CHANNEL 3
#define BUFSIZE 255

#define STATUS_TRUE 1
#define STATUS_FALSE 0
#define STATUS_BYTE 0x01
#define STATUS_BIT 0x10

#define USBD_CHANNEL 0

#define debug(args...)
#define info(args...)   syslog(LOG_INFO, args)
#define error(args...)  syslog(LOG_ERR, args)
#define fatal(args...) ({ \
    syslog (LOG_CRIT, args); \
    exit(1); \
})

typedef struct ChannelData {
    int in_length;
    char out_buf[BUFSIZE];
    int out_length;
    char in_buf[BUFSIZE];
} ChannelData;

ChannelData channels[N_CHANNEL];

uint8_t channels_writable_bitmask;
uint8_t channels_opened_bitmask;
uint8_t channels_enabled_bitmask;

/// Use sysfs to export the specified GPIO
void gpio_export(const char* gpio) {
    char path[512];
    snprintf(path, sizeof(path), "/sys/class/gpio/gpio%s", gpio);
    if (access(path, F_OK) == 0) {
        // Already exported;
        return;
    }

    int fd = open("/sys/class/gpio/export", O_WRONLY);
    if (fd < 0) {
      fatal("Error opening /sys/class/gpio/export: %s\n", strerror(errno));
      exit(1);
    }
    if (write(fd, gpio, strlen(gpio)) < 0) {
        fatal("GPIO export write: %s", strerror(errno));
    };
    close(fd);
}

/// Open a sysfs GPIO file
int gpio_open(const char* gpio, const char* file) {
    char path[512];
    snprintf(path, sizeof(path), "/sys/class/gpio/gpio%s/%s", gpio, file);
    int fd = open(path, O_RDWR);
    if (fd < 0) {
      fatal("Error opening %s: %s\n", path, strerror(errno));
    }
    return fd;
}

/// Set the direction of the specified GPIO pin
void gpio_direction(const char* gpio, const char* mode) {
    int fd = gpio_open(gpio, "direction");
    if (write(fd, mode, strlen(mode)) < 0) {
        fatal("GPIO direction write: %s", strerror(errno));
    }
    close(fd);
}

/// Set the edge trigger mode of the specified GPIO pin
void gpio_edge(const char* gpio, const char* mode) {
    int fd = gpio_open(gpio, "edge");
    if (write(fd, mode, strlen(mode)) < 0){
        fatal("GPIO edge write: %s", strerror(errno));
    }
    close(fd);
}

// IRQ pin pollfd (when coprocessor has async data)
#define GPIO_POLL fds[0]
// connected domain socket pollfds
#define CONN_POLL(n) fds[1 + n]
// listening domain socket pollfds
#define SOCK_POLL(n) fds[1 + N_CHANNEL + n]
#define N_POLLFDS (N_CHANNEL * 2 + 1)
struct pollfd fds[N_POLLFDS];
int usbd_sock_fd;
struct sockaddr_un usbd_sock_addr;
void delay() {
    usleep(10);
}

/*
Fetches the stored open/closed state of a given channel

Args:
    - bitmask: the bitmask to fetch a value from
    - channel: the index of the channel to check the status of

Returns:
    STATUS_TRUE if state is currently active
    STATUS_FALSE if state is currently inactive

*/
uint8_t get_channel_bitmask_state(uint8_t *bitmask, uint8_t channel) {
    return ((*bitmask) & (1 << channel)) ? STATUS_TRUE : STATUS_FALSE;
}

/*
Sets a channel bitmap state

Args:
    - bitmask: the bitmask to modify
    - channel: the index of the channel to set the state of
    - state: a bool determining whether that state is active or not

*/
void set_channel_bitmask_state(uint8_t *bitmask, uint8_t channel, bool state) {
    if (state == true) {
        *(bitmask) |= (1<<channel);
    }
    else {
        *(bitmask) &= ~(1<<channel);
    }
}

/*
Helper function to pull out the correct bitmask from a buffer header sent by the coprocessor

Args:
    rx_buf: The buffer sent from the coprocessor
    channel: The connection channel to get the enabled status of
*/
uint8_t extract_enabled_state(uint8_t *rx_buf, uint8_t channel) {
    return ((rx_buf[STATUS_BYTE] & (STATUS_BIT << channel)) ? STATUS_TRUE : STATUS_FALSE);
}

/*
Closes a provided channel's connection

Args:
    - channel: the index of the channel
        0: USB
        1: MODULE PORT A
        2: MODULE PORT B

*/
void close_channel_connection(uint8_t channel) {

    info("Closing connection %d\n", channel);
    // Close the file descriptor
    close(CONN_POLL(channel).fd);
    // Reset the file descriptor
    CONN_POLL(channel).fd = -1;
    // Clear the outgoing data
    channels[channel].out_length = 0;
    // Re-enable events on a new connection if it's still enabled
    if (get_channel_bitmask_state(&channels_enabled_bitmask, channel) && channel != USBD_CHANNEL) {
        SOCK_POLL(channel).events = POLLIN;
    }
    // Set the channel open status to false
    set_channel_bitmask_state(&channels_opened_bitmask, channel, false);
    // Set the writability to false
    set_channel_bitmask_state(&channels_writable_bitmask, channel, false);
}

void disable_listening_socket(uint8_t channel) {
    SOCK_POLL(channel).events = 0;
}

void enable_listening_socket(uint8_t channel) {
    SOCK_POLL(channel).events = POLLIN;
}

void enable_usb_daemon_socket() {

    // Create a new socket
    int fd = socket(usbd_sock_addr.sun_family, SOCK_STREAM, 0);
    // Check for errors
    if (fd < 0) {
        fatal("Error creating socket %s: %s\n", usbd_sock_addr.sun_path, strerror(errno));
    }

    CONN_POLL(USBD_CHANNEL).fd = fd;

    // Connect to the USB Daemon
    if (connect(CONN_POLL(USBD_CHANNEL).fd, (struct sockaddr *)&usbd_sock_addr, sizeof(usbd_sock_addr)) == -1) {
        fatal("Error connecting to USB Daemon socket %s: %s\n", usbd_sock_addr.sun_path, strerror(errno));
    }

    // Set the bits of the events we want to listen to
    CONN_POLL(USBD_CHANNEL).events = POLLIN | POLLOUT | POLLERR;

    // Mark the channel as opened
    set_channel_bitmask_state(&channels_opened_bitmask, USBD_CHANNEL, true);
}

/*
Checks for any requested changes from MCU in a channel's open/close status and obliges

Args:
    rx_buf: Buffer received over SPI from MCU
    writable: bit flag indicating state of channel (used in maintaining state after closing)
    chanels_open: bit flag indicating writable channels (used in maintaining state after closing)
*/
void manage_channel_active_status(uint8_t *rx_buf) {

    // For each possible channel
    for (int i=0; i<N_CHANNEL; i++) {
        // Extract the new channel enabled status from the packet header
        uint8_t new_status = extract_enabled_state(rx_buf, i);
        // Fetch the old enabled status
        uint8_t old_status = get_channel_bitmask_state(&channels_enabled_bitmask, i);
        debug("\nChannel %d, old enabled status: %d, new enabled status: %d", i, old_status, new_status);
        // If the status hasn't changed
        if (new_status == old_status) {
            debug("\nStatus has not changed.\n");
            // Make no changes to the polling
            continue;
        }
        // If the new status has the channel enabled
        else if (new_status == STATUS_TRUE) {
            debug("\nChannel has been enabled!\n");
            // We should start listening for connect events
            if (i == USBD_CHANNEL) {
                enable_usb_daemon_socket();
            }
            else {
                enable_listening_socket(i);
            }
            // Set the status as enabled
            set_channel_bitmask_state(&channels_enabled_bitmask, i, true);
        }
        // If the new status disables the channel
        else {
            debug("\nChannel has been disabled!\n");
            // Close the socket and mark the channel closed
            close_channel_connection(i);
            // Disable the listening socket
            if (i != USBD_CHANNEL) {
                // Turn off the listening socket
                disable_listening_socket(i);
                // Stop listening for events on the socket listener
                SOCK_POLL(i).events = 0;
            }
            else {
                // Stop listening for events on usbd socket
                CONN_POLL(i).events = 0;
            }

            // Mark the channel as disabled
            set_channel_bitmask_state(&channels_enabled_bitmask, i, false);
        }
    }
}

int main(int argc, char** argv) {
    openlog("spid", LOG_PERROR | LOG_PID | LOG_NDELAY, LOG_LOCAL1);
    info("Starting");

    if (argc != 5) {
      fatal("usage: spid /dev/spidev0.1 irq_gpio sync_gpio /var/run/tessel\n");
    }

    // Open SPI
    int spi_fd = open(argv[1], O_RDWR);
    if (spi_fd < 0) {
      fatal("Error opening SPI device %s: %s\n", argv[1], strerror(errno));
    }

    // set up IRQ pin
    gpio_export(argv[2]);
    gpio_direction(argv[2], "in");
    gpio_edge(argv[2], "rising");
    int irq_fd = gpio_open(argv[2], "value");

    // set up sync pin
    gpio_export(argv[3]);
    gpio_edge(argv[3], "none");
    gpio_direction(argv[3], "high");
    int sync_fd = gpio_open(argv[3], "value");

    memset(channels, 0, sizeof(channels));
    memset(fds, 0, sizeof(fds));

    GPIO_POLL.fd = irq_fd;
    GPIO_POLL.events = POLLPRI;

    // Create the listening unix domain sockets
    for (int i = 0; i<N_CHANNEL; i++) {

        // If this is not the USB Daemon channel
        if (i != USBD_CHANNEL) {
            // Create a struct to store socket info
            struct sockaddr_un addr;
            // Use UNIX family sockets
            addr.sun_family = AF_UNIX;
            // Copy the path of the socket into the struct
            snprintf(addr.sun_path, sizeof(addr.sun_path), "%s/%d", argv[4], i);
            // Create the socket
            int fd = socket(addr.sun_family, SOCK_STREAM, 0);
            // Check for errors
            if (fd < 0) {
                fatal("Error creating socket %s: %s\n", addr.sun_path, strerror(errno));
            }
            // Delete any previous paths because we'll create a new one
            unlink(addr.sun_path);

            // Bind to that socket address
            if (bind(fd, (struct sockaddr *) &addr, sizeof(addr)) == -1) {
                fatal("Error binding socket %s: %s\n", addr.sun_path, strerror(errno));
            }

            // Start listening for new connections
            if (listen(fd, 1) == -1) {
                fatal("Error listening on socket %s: %s\n", addr.sun_path, strerror(errno));
            }

            // Save the file descriptor of the listening socket
            SOCK_POLL(i).fd = fd;
            // The first time the coprocessor enables, it will be set to POLLIN
            SOCK_POLL(i).events = 0;
        }
        // If this is the USB Daemon channel
        else {
            // Set the family of our global addr struct
            usbd_sock_addr.sun_family = AF_UNIX;
            // Copy the addr info into a global
            snprintf(usbd_sock_addr.sun_path, sizeof(usbd_sock_addr.sun_path), "%s/%s", argv[4], "usb");
            // We will create a socket fd when the channel is enabled
            CONN_POLL(i).fd = -1;
            // We will try to connect once the channel is enabled
            CONN_POLL(i).events = 0;
        }
    }

    channels_writable_bitmask = 0;
    channels_opened_bitmask = 0;
    channels_enabled_bitmask = 0;
    int retries = 0;

    while (1) {
        for (int i=0; i<N_POLLFDS; i++) {
            fds[i].revents = 0;
        }

        int nfds = poll(fds, N_POLLFDS, 5000);
        if (nfds < 0) {
            fatal("Error in poll: %s", strerror(errno));
        }

        debug("poll returned: %i\n", nfds);

        for (int i=0; i<N_POLLFDS; i++) {
            debug("%x ", fds[i].events);
        }
        debug("- %x %x %x %x %x \n", POLLIN, POLLOUT, POLLERR, POLLHUP, POLLRDHUP);

        for (int i=0; i<N_POLLFDS; i++) {
            debug("%x ", fds[i].revents);
        }
        debug("\n");

        // If it was a GPIO interrupt on the IRQ pin, acknowlege it
        if (GPIO_POLL.revents & POLLPRI) {
            char buf[2];
            lseek(irq_fd, SEEK_SET, 0);
            if (read(irq_fd, buf, 2) < 0) {
                fatal("GPIO read: %s", strerror(errno));
            }
            debug("GPIO interrupt %c\n", buf[0]);
        }

        // Sync pin low
        if (write(sync_fd, "0", 1) < 0) {
            fatal("GPIO write: %s", strerror(errno));
        }

        delay();

        // Check for new connections on unconnected sockets
        for (int i=0; i<N_CHANNEL; i++) {
            // The USB Daemon channel is a client so we wont have new connection events
            if (i == USBD_CHANNEL) {
                // Just continue
                continue;
            }

            if (SOCK_POLL(i).revents & POLLIN) {
                int fd = accept(SOCK_POLL(i).fd, NULL, 0);
                if (fd == -1) {
                    fatal("Error in accept: %s", strerror(errno));
                }

                info("Accepted connection on %i\n", i);
                CONN_POLL(i).fd = fd;
                CONN_POLL(i).events = POLLIN | POLLOUT;

                // disable further events on listening socket
                SOCK_POLL(i).events = 0;
                debug("\nWe have a new connection on a socket, %d\n", i);
                set_channel_bitmask_state(&channels_opened_bitmask, i, true);
            }
        }

        // Check which connected sockets are readable / writable or closed
        for (int i=0; i<N_CHANNEL; i++) {
            bool to_close = false;
            debug("\nChecking if channel was closed %d %d\n", i, CONN_POLL(i).revents & POLLIN);
            if (CONN_POLL(i).revents & POLLIN) {
                int length = read(CONN_POLL(i).fd, channels[i].out_buf, BUFSIZE);
                CONN_POLL(i).events &= ~POLLIN;

                debug("%i: Read %u\n", i, length);

                if (length > 0) {
                    channels[i].out_length = length;
                } else {
                    if (length < 0) {
                        error("Error in read %i: %s\n", i, strerror(errno));
                    }
                    to_close = true;
                }
            }

            if (to_close || CONN_POLL(i).revents & POLLHUP
                         || CONN_POLL(i).revents & POLLERR
                         || CONN_POLL(i).revents & POLLRDHUP) {
                debug("Got the call to close connection on %d", i);
                // Close the connection
                close_channel_connection(i);
                continue;
            }

            if (CONN_POLL(i).revents & POLLOUT) {
                CONN_POLL(i).events &= ~POLLOUT;
                // The connection is now writable
                set_channel_bitmask_state(&channels_writable_bitmask, i, true);
                debug("%i: Writable\n", i);
            }
        }

        // Prepare the header transfer
        struct spi_ioc_transfer ctrl_transfer[2];
        memset(ctrl_transfer, 0, sizeof(ctrl_transfer));

        uint8_t tx_buf[2 + N_CHANNEL];
        uint8_t rx_buf[2 + N_CHANNEL];

        tx_buf[0] = 0x53;
        tx_buf[1] = channels_writable_bitmask | (channels_opened_bitmask << 4);

        for (int i=0; i<N_CHANNEL; i++) {
            tx_buf[2+i] = channels[i].out_length;
        }

        debug("tx: %2x %2x %2x %2x %2x\n", tx_buf[0], tx_buf[1], tx_buf[2], tx_buf[3], tx_buf[4]);

        ctrl_transfer[0].len = sizeof(tx_buf);
        ctrl_transfer[0].tx_buf = (unsigned long)tx_buf;
        ctrl_transfer[1].len = sizeof(rx_buf);
        ctrl_transfer[1].rx_buf = (unsigned long)rx_buf;
        int status = ioctl(spi_fd, SPI_IOC_MESSAGE(2), ctrl_transfer);

        if (status < 0) {
          fatal("SPI_IOC_MESSAGE: header: %s", strerror(errno));
        }

        debug("rx: %2x %2x %2x %2x %2x\n", rx_buf[0], rx_buf[1], rx_buf[2], rx_buf[3], rx_buf[4]);
        if (write(sync_fd, "1", 1) < 0) {
            fatal("GPIO write: %s", strerror(errno));
        }

        if (rx_buf[0] != 0xCA) {
            error("Invalid command reply: %2x %2x %2x %2x %2x\n", rx_buf[0], rx_buf[1], rx_buf[2], rx_buf[3], rx_buf[4]);
            retries++;

            if (retries > 15) {
                fatal("Too many retries, exiting");
            } else {
                continue;
            }
        }

        // Check for any open/close requests on the channels
        manage_channel_active_status(rx_buf);

        retries = 0;

        delay();

        // Prepare the data transfer
        struct spi_ioc_transfer transfer[N_CHANNEL * 2];
        memset(transfer, 0, sizeof(transfer));
        int desc = 0;

        for (int chan=0; chan<N_CHANNEL; chan++) {
            int size = channels[chan].out_length;
            // If the coprocessor is ready to receive, and we have data to send
            if (rx_buf[1] & (1<<chan) && size > 0) {
                debug("coprocessor is ready to receive and we have %d bytes from channel %d", size, chan);
                // Make this channel readable by others
                CONN_POLL(chan).events |= POLLIN;
                // Set the length to the size we need to send
                transfer[desc].len = size;
                // Point the output buffer to the correct place
                transfer[desc].tx_buf = (unsigned long) &channels[chan].out_buf[0];
                // Note that we will have no more data to send (once this is sent)
                channels[chan].out_length = 0;
                // Mark that we need to make a SPI transaction
                desc++;
            }

            // The number of bytes the coprocessor wants to send to a channel
            size = rx_buf[2+chan];
            // Check that the channel is writable and there is data that needs to be received
            if (get_channel_bitmask_state(&channels_writable_bitmask, chan) && size > 0) {
                debug("Channel %d is ready to have %d bytes written to it from bridge", chan, size);
                // Set the appropriate size
                transfer[desc].len = size;
                // Point our receive buffer to the in buf of the appropriate channel
                transfer[desc].rx_buf = (unsigned long) &channels[chan].in_buf[0];
                // Mark that we need a SPI transaction to take place
                desc++;
            }
        }

        // If the previous logic designated the need for a SPI transaction
        if (desc != 0) {
            debug("Performing transfer on %i channels\n", desc);

            // Make the SPI transaction
            int status = ioctl(spi_fd, SPI_IOC_MESSAGE(desc), transfer);

            // Ensure there were no errors
            if (status < 0) {
              fatal("SPI_IOC_MESSAGE: data: %s", strerror(errno));
            }

            // Write received data to the appropriate socket
            for (int chan=0; chan<N_CHANNEL; chan++) {
                // Get the length of the received data for this channel
                int size = rx_buf[2+chan];
                // Make sure that channel is writable and we have data to send to it
                if (get_channel_bitmask_state(&channels_writable_bitmask, chan) && size > 0) {
                    // Write this data to the pipe
                    int r = write(CONN_POLL(chan).fd, &channels[chan].in_buf[0], size);
                    debug("%i: Write %u %i\n", chan, size, r);
                    // Ensure there were no errors
                    if (r < 0) {
                        error("Error in write %i: %s\n", chan, strerror(errno));
                    }

                    // Mark we want to know when this pipe is writable again
                    CONN_POLL(chan).events |= POLLOUT;
                    // Set the state to not writable
                    set_channel_bitmask_state(&channels_writable_bitmask, chan, false);
                }
            }
        }
    }
}

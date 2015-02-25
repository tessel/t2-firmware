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

#define N_CHANNEL 3
#define BUFSIZE 255

#define DEBUG //printf

typedef struct ChannelData {
    int in_length;
    char out_buf[BUFSIZE];
    int out_length;
    char in_buf[BUFSIZE];
} ChannelData;

ChannelData channels[N_CHANNEL];

/// Use sysfs to export the specified GPIO
void gpio_export(const char* gpio) {
    int fd = open("/sys/class/gpio/export", O_WRONLY);
    if (fd < 0) {
      fprintf(stderr, "Error opening /sys/class/gpio/export: %s\n", strerror(errno));
      exit(1);
    }
    write(fd, gpio, strlen(gpio));
    close(fd);
}

/// Open a sysfs GPIO file
int gpio_open(const char* gpio, const char* file) {
    char path[512];
    snprintf(path, sizeof(path), "/sys/class/gpio/gpio%s/%s", gpio, file);
    int fd = open(path, O_RDWR);
    if (fd < 0) {
      fprintf(stderr, "Error opening %s: %s\n", path, strerror(errno));
      exit(1);
    }
    return fd;
}

/// Set the direction of the specified GPIO pin
void gpio_direction(const char* gpio, const char* mode) {
    int fd = gpio_open(gpio, "direction");
    write(fd, mode, strlen(mode));
    close(fd);
}

/// Set the edge trigger mode of the specified GPIO pin
void gpio_edge(const char* gpio, const char* mode) {
    int fd = gpio_open(gpio, "edge");
    write(fd, mode, strlen(mode));
    close(fd);
}

#define GPIO_POLL fds[0]
#define CONN_POLL(n) fds[1 + n]
#define SOCK_POLL(n) fds[1 + N_CHANNEL + n]
#define N_POLLFDS (N_CHANNEL * 2 + 1)
struct pollfd fds[N_POLLFDS];

int main(int argc, char** argv) {
    if (argc != 5) {
      fprintf(stderr, "usage: spid /dev/spidev0.1 irq_gpio sync_gpio /var/run/tessel\n");
      exit(1);
    }

    // Open SPI
    int spi_fd = open(argv[1], O_RDWR);
    if (spi_fd < 0) {
      fprintf(stderr, "Error opening SPI device %s: %s\n", argv[1], strerror(errno));
      exit(1);
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
        struct sockaddr_un addr;
        addr.sun_family = AF_UNIX;
        snprintf(addr.sun_path, sizeof(addr.sun_path), "%s/%d", argv[4], i);
        unlink(addr.sun_path);
        int fd = socket(AF_UNIX, SOCK_STREAM, 0);
        if (fd < 0) {
            fprintf(stderr, "Error creating socket %s: %s\n", addr.sun_path, strerror(errno));
            exit(1);
        }

        if (bind(fd, (struct sockaddr *) &addr, sizeof(addr)) == -1) {
            fprintf(stderr, "Error binding socket %s: %s\n", addr.sun_path, strerror(errno));
            exit(1);
        }

        if (listen(fd, 1) == -1) {
            fprintf(stderr, "Error listening on socket %s: %s\n", addr.sun_path, strerror(errno));
            exit(1);
        }

        SOCK_POLL(i).fd = fd;
        SOCK_POLL(i).events = POLLIN;
        CONN_POLL(i).fd = -1;
    }

    uint8_t writable = 0;
    uint8_t channels_open = 0;
    int retries = 0;

    while (1) {
        for (int i=0; i<N_POLLFDS; i++) {
            fds[i].revents = 0;
        }

        int nfds = poll(fds, N_POLLFDS, 5000);
        if (nfds < 0) {
            fprintf(stderr, "Error in poll: %s", strerror(errno));
            exit(2);
        }

        DEBUG("poll returned: %i\n", nfds);

        for (int i=0; i<N_POLLFDS; i++) {
            DEBUG("%x ", fds[i].events);
        }
        DEBUG("- %x %x %x \n", POLLIN, POLLOUT, POLLERR);

        for (int i=0; i<N_POLLFDS; i++) {
            DEBUG("%x ", fds[i].revents);
        }
        DEBUG("\n");

        // If it was a GPIO interrupt on the IRQ pin, acknowlege it
        if (GPIO_POLL.revents & POLLPRI) {
            char buf[2];
            lseek(irq_fd, SEEK_SET, 0);
            read(irq_fd, buf, 2);
            DEBUG("GPIO interrupt %c\n", buf[0]);
        }

        // Sync pin low
        write(sync_fd, "0", 1);

        // Check for new connections on unconnected sockets
        for (int i=0; i<N_CHANNEL; i++) {
            if (SOCK_POLL(i).revents & POLLIN) {
                int fd = accept(SOCK_POLL(i).fd, NULL, 0);
                if (fd == -1) {
                    fprintf(stderr, "Error in accept: %s", strerror(errno));
                    exit(2);
                }

                printf("Accepted connection on %i\n", i);
                CONN_POLL(i).fd = fd;
                CONN_POLL(i).events = POLLIN | POLLOUT;

                // disable further events on listening socket
                SOCK_POLL(i).events = 0;
                channels_open |= (1<<i);
            }
        }

        // Check which connected sockets are readable / writable or closed
        for (int i=0; i<N_CHANNEL; i++) {
            bool to_close = false;
            if (CONN_POLL(i).revents & POLLIN) {
                int length = read(CONN_POLL(i).fd, channels[i].out_buf, BUFSIZE);
                CONN_POLL(i).events &= ~POLLIN;

                DEBUG("%i: Read %u\n", i, length);

                if (length > 0) {
                    channels[i].out_length = length;
                } else {
                    if (length < 0) {
                        fprintf(stderr, "Error in read %i: %s\n", i, strerror(errno));
                    }
                    to_close = true;
                }
            }

            if (to_close || CONN_POLL(i).revents & POLLHUP
                         || CONN_POLL(i).revents & POLLERR
                         || CONN_POLL(i).revents & POLLRDHUP) {
                printf("Closing connection %d\n", i);
                close(CONN_POLL(i).fd);
                CONN_POLL(i).fd = -1;

                channels[i].out_length = 0;
                writable &= ~(1 << i);

                // Re-enable events on a new connection
                SOCK_POLL(i).events = POLLIN;
                channels_open &= ~(1<<i);

                continue;
            }

            if (CONN_POLL(i).revents & POLLOUT) {
                CONN_POLL(i).events &= ~POLLOUT;
                writable |= (1 << i);
                printf("%i: Writable\n", i);
            }
        }

        // Prepare the header transfer
        struct spi_ioc_transfer ctrl_transfer[2];
        memset(ctrl_transfer, 0, sizeof(ctrl_transfer));

        uint8_t tx_buf[2 + N_CHANNEL];
        uint8_t rx_buf[2 + N_CHANNEL];

        tx_buf[0] = 0x53;
        tx_buf[1] = writable | (channels_open << 4);

        for (int i=0; i<N_CHANNEL; i++) {
            tx_buf[2+i] = channels[i].out_length;
        }

        DEBUG("tx: %2x %2x %2x %2x %2x\n", tx_buf[0], tx_buf[1], tx_buf[2], tx_buf[3], tx_buf[4]);

        ctrl_transfer[0].len = sizeof(tx_buf);
        ctrl_transfer[0].tx_buf = (unsigned long)tx_buf;
        ctrl_transfer[1].len = sizeof(rx_buf);
        ctrl_transfer[1].rx_buf = (unsigned long)rx_buf;
        int status = ioctl(spi_fd, SPI_IOC_MESSAGE(2), ctrl_transfer);

        if (status < 0) {
          perror("SPI_IOC_MESSAGE: header");
          exit(3);
        }

        DEBUG("rx: %2x %2x %2x %2x %2x\n", rx_buf[0], rx_buf[1], rx_buf[2], rx_buf[3], rx_buf[4]);
        write(sync_fd, "1", 1);

        if (rx_buf[0] != 0xCA) {
            printf("Invalid command reply: %2x %2x %2x %2x %2x\n", rx_buf[0], rx_buf[1], rx_buf[2], rx_buf[3], rx_buf[4]);
            retries++;

            if (retries > 500) {
                exit(4);
            } else {
                continue;
            }
        }
        retries = 0;

        usleep(20);

        // Prepare the data transfer
        struct spi_ioc_transfer transfer[N_CHANNEL * 2];
        memset(transfer, 0, sizeof(transfer));
        int desc = 0;

        for (int chan=0; chan<N_CHANNEL; chan++) {
            int size = channels[chan].out_length;
            if (rx_buf[1] & (1<<chan) && size > 0) {
                CONN_POLL(chan).events |= POLLIN;
                transfer[desc].len = size;
                transfer[desc].tx_buf = (unsigned long) &channels[chan].out_buf[0];
                channels[chan].out_length = 0;
                desc++;
            }

            size = rx_buf[2+chan];
            if (writable & (1<<chan) && size > 0) {
                transfer[desc].len = size;
                transfer[desc].rx_buf = (unsigned long) &channels[chan].in_buf[0];
                desc++;
            }
        }

        if (desc != 0) {
            DEBUG("Performing transfer on %i channels\n", desc);

            int status = ioctl(spi_fd, SPI_IOC_MESSAGE(desc), transfer);

            if (status < 0) {
              perror("SPI_IOC_MESSAGE: data");
              exit(3);
            }

            // Write received data to the appropriate socket
            for (int chan=0; chan<N_CHANNEL; chan++) {
                int size = rx_buf[2+chan];
                if (writable & (1<<chan) && size > 0) {
                    int r = write(CONN_POLL(chan).fd, &channels[chan].in_buf[0], size);
                    DEBUG("%i: Write %u %i\n", chan, size, r);
                    if (r < 0) {
                        fprintf(stderr, "Error in write %i: %s\n", chan, strerror(errno));
                    }

                    CONN_POLL(chan).events |= POLLOUT;
                    writable &= ~(1<<chan);
                }
            }
        }
    }
}

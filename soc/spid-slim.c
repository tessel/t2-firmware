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

#define debug(args...)  syslog(LOG_INFO, args)
#define info(args...)   syslog(LOG_INFO, args)
#define error(args...)  syslog(LOG_ERR, args)
#define fatal(args...) ({ \
    syslog (LOG_CRIT, args); \
    exit(1); \
})

#define N_POLLFDS 1
#define N_CHANNEL 1
#define BUFSIZE 255

// Create our array of pollfd structs
struct pollfd fds[N_POLLFDS];

void close_usbd_client(int i) {
  // Close the file descriptor
  close(fds[i].fd);
  // Reset the fd 
  fds[i].fd = -1;
  // Stop listening for events
  fds[i].events &= ~(POLLIN | POLLOUT | POLLERR);
} 

void debug_poll_results() {
    for (int i=0; i<N_POLLFDS; i++) {
        debug("%x ", fds[i].events);
    }
    debug("- %x %x %x %x %x \n", POLLIN, POLLOUT, POLLERR, POLLHUP, POLLRDHUP);

    for (int i=0; i<N_POLLFDS; i++) {
        debug("%x ", fds[i].revents);
    }
    debug("\n");
}

int main(int argc, char **argv) {
    openlog("spid-slim", LOG_PERROR | LOG_PID | LOG_NDELAY, LOG_LOCAL1);
    info("Starting");

    if (argc != 2) {
      fatal("usage: spid-slim /var/run/tessel\n");
    }
    struct sockaddr_un addr;
    // Set the addr family type
    addr.sun_family = AF_UNIX;
    char *domain_socket_dir = argv[1];
    snprintf(addr.sun_path, sizeof(addr.sun_path), "%s/%s", domain_socket_dir, "usb");

    debug("Will create a socket connection at: %s", addr.sun_path);
    // Will this be an issue for USB? YES IT IS
    // unlink(addr.sun_path);
    // Create the new socket
    int sock = socket(addr.sun_family, SOCK_STREAM, 0);
    // Check for errors
    if (sock < 0) {
        fatal("Error creating socket %s: %s\n", addr.sun_path, strerror(errno));
    }

    size_t len = strlen(addr.sun_path) + sizeof(addr.sun_family);

    if (connect(sock, (struct sockaddr *)&addr, len) == -1) {
        fatal("Error connecting to socket %s: %s\n", addr.sun_path, strerror(errno));
    }

    // Make our sock the fd of the first item
    memset(fds, 0, sizeof(fds));
    fds[0].fd = sock;

    // Do THIS only when enabled bit goes from 0->1
    fds[0].events = POLLIN | POLLOUT | POLLERR;

    while (true) {
      // Clear old registered events on the file descriptors
      for (int i=0; i<N_POLLFDS; i++) {
          fds[i].revents = 0;
      }

      // Wait up to 5 seconds for new events on these file descriptors
      int nfds = poll(fds, N_POLLFDS, 5000);

      if (nfds < 0) {
          fatal("Error in poll: %s", strerror(errno));
      }

      debug_poll_results();

      // Check for new connections on unconnected sockets
      for (int i=0; i<N_CHANNEL; i++) {
        // We are indexing fds instead of SOCK_POLL
        bool to_close = false;
        if (fds[i].revents & POLLIN) {
          debug("\nWe have a new connection on a socket or it is readable or something, %d\n", i);
          char out_buf[255];
          int length = read(fds[i].fd, out_buf, BUFSIZE);
          debug("%i: Read %u\n", i, length);

          if (length <= 0) {
            if (length < 0) {
                error("Error in read %i: %s\n", i, strerror(errno));
            }
            to_close = true;
          }
        }
        if (to_close || fds[i].revents & POLLHUP
                       || fds[i].revents & POLLERR
                       || fds[i].revents & POLLRDHUP) {
            debug("Got the call to close connection on %d", i);
            // Close the connection
            // close_channel_connection(i);
            close_usbd_client(i);
            continue;
          }

        if (fds[i].revents & POLLOUT) {
            fds[i].events &= ~POLLOUT;
            // The connection is now writable
            // set_channel_bitmask_state(&channels_writable_bitmask, i, true);
            debug("%i: Writable\n", i);
            uint8_t out_buf[] = {1, 0, 0, 0};
            int r = write(fds[0].fd, &out_buf, sizeof(out_buf));
            debug("%i: Write %u %i\n", i, sizeof(out_buf), r);
            if (r < 0) {
                error("Error in write %i: %s\n", i, strerror(errno));
            }

            // Close the file descriptor
            close_usbd_client(i);

        }
      }
    }

    return 0;
}

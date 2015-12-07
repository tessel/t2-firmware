#define _GNU_SOURCE
#include <sys/socket.h>
#include <sys/un.h>
#include <stdio.h>
#include <string.h>
#include <stdbool.h>
#include <stdint.h>
#include <errno.h>
#include <poll.h>
#include <sys/types.h>
#include <signal.h>
#include <sys/wait.h>
#include <sys/stat.h>
#include <fcntl.h>
#include <unistd.h>
#include <syslog.h>
#include <stdlib.h>
#include <sys/epoll.h>
#include <sys/signalfd.h>

#define debug(args...)  syslog(LOG_INFO, args)
#define info(args...)   syslog(LOG_INFO, args)
#define error(args...)  syslog(LOG_ERR, args)
#define fatal(args...) ({ \
    syslog (LOG_CRIT, args); \
    exit(1); \
})

int epfd = -1;
int sock_fd = -1;

/* Helper function to continue attempting to read a non blocking file descriptor
until a specified number of bytes are read
Param: fd - an open, NON-BLOCKING file descriptor
Param: buf - the data to read bytes into
Param: len - the number of bytes to read
Returns: Error code (-1) if the file descriptor was closed
*/
int read_until(int non_blocking_fd, void *buf, int len) {

    int total_read = 0, single_read = 0;

    while (total_read < len) {

        // Read from a file descriptor into another buffer
        single_read = read(non_blocking_fd, &(((uint8_t *)buf)[total_read]), len - total_read);

        // If we read nothing and the socket would have blocked
        if (single_read < 0 && (errno == EAGAIN || errno == EWOULDBLOCK)) {
            // There is nothing to be read right now, try again
            continue;
        }
        // We have read more than zero bytes sucessfully
        else if (single_read > 0) {

            // Increment the amount we have read
            total_read += single_read;
        }
        else if (single_read == 0) {
            // EOF 
            return -1;
        }
        else {
            fatal("An error occured during blocking read of file descriptor %s.", strerror(errno));
        }
    }

    return 0;
}

void handle_socket_closed() {
  close(sock_fd);
  sock_fd = -1;
}

void handle_socket_readable() {
      // Array to store incoming packet
    uint8_t header[4];
    // Block until 4 bytes are read
    int sock_closed = read_until(sock_fd, header, 4);

    // If the remote socket is closed
    if (sock_closed) {
        // Go back to waiting for a new event
        fatal("Domain Socket has been closed.");
    }

    // Save the command
    int cmd = header[0];
    // Get the ID of the process this message is intended for
    int id = header[1];
    // Get a reference to the correspondong process
    // procinfo_t* p = processes[id];

    debug("Got a packet of command id %d and process id %d", cmd, id);
}

int main(int argc, char **argv) {
  openlog("usbexecd-slim", LOG_PERROR | LOG_PID | LOG_NDELAY, LOG_LOCAL1);
  info("Starting");

  if (argc != 2) {
    fatal("usage: usbexecd-slim /var/run/tessel/usb\n");
  }

  struct sockaddr_un addr;
  // Set the addr family type
  addr.sun_family = AF_UNIX;
  char *domain_socket_path = argv[1];
  snprintf(addr.sun_path, sizeof(addr.sun_path), "%s", domain_socket_path);

  debug("Will create a socket connection at: %s", addr.sun_path);
  // Will this be an issue for USB?
  unlink(addr.sun_path);
  // Create the new socket
  int listener_fd = socket(addr.sun_family, SOCK_STREAM, 0);
  // Check for errors
  if (listener_fd < 0) {
      fatal("Error creating socket %s: %s\n", addr.sun_path, strerror(errno));
  }

  if (bind(listener_fd, (struct sockaddr *) &addr, sizeof(addr)) == -1) {
      fatal("Error binding socket %s: %s\n", addr.sun_path, strerror(errno));
  }

  if (listen(listener_fd, 1) == -1) {
      fatal("Error listening on socket %s: %s\n", addr.sun_path, strerror(errno));
  }

  // Register an event listener with the kernel
  // (Size argument doesn't matter at all. See http://man7.org/linux/man-pages/man2/epoll_create.2.html)
  epfd = epoll_create(1);
  if (epfd < 0) {
      fatal("Error creating epoll: %s\n", strerror(errno));
  }

  // The number of events we can register between polling the event descriptor
  const int num_events = 16;
  // Static array for those events to be stored
  struct epoll_event events[num_events];
  // Create an event for when the usb unix domain socket is readable/writable
  struct epoll_event evt;
  // Set the data pointer to point to the callback function
  evt.data.fd = listener_fd;
  // We want to know when it is readable and when data comes in
  evt.events = EPOLLIN;
  // Add the socket file descriptor to our epoll fd
  int r = epoll_ctl(epfd, EPOLL_CTL_ADD, listener_fd, &evt);

  if (r < 0) {
      fatal("Could not add listening socket to event poll: %s", strerror(errno));
  }

  while (true) {
    debug("Waiting for soemthing interesting to happen");

    // Wait for at least one event to happen (indefinitely)
    int nfds = epoll_wait(epfd, events, num_events, -1);

    if (nfds < 0 && errno != EINTR) {
        fatal("epoll error: %s\n", strerror(errno));
    }

    debug("We got %d events ready", nfds);

    // For each event that occured, check what kind of event it is
    for (int i=0; i<nfds; i++) {
      // Data from SPI domain socket
      if (events[i].data.fd == listener_fd) {
        if (events[i].events & EPOLLIN) {
          // Process the packet using the protocol defined above
          debug("We got a connection attempt!");
          sock_fd = accept(listener_fd, NULL, NULL);
          if (sock_fd < 0) {
            fatal("Unable to accept socket connection...");
          }

          debug("Descriptor is %d", sock_fd);

          // Create an event for when the usb unix domain socket is readable/writable
          struct epoll_event evt;
          // Set the data pointer to point to the callback function
          evt.data.fd = sock_fd;
          // We want to know when it is readable and when data comes in
          evt.events = EPOLLIN | EPOLLERR | EPOLLHUP;
          // Add the socket file descriptor to our epoll fd
          int r = epoll_ctl(epfd, EPOLL_CTL_ADD, sock_fd, &evt);
          if (r < 0) {
              fatal("Could not add domain socket to event poll: %s", strerror(errno));
          }
        }
      }
      else if (events[i].data.fd == sock_fd) {
        if ((events[i].events & EPOLLERR) ||
          (events[i].events & EPOLLHUP))
        {
          debug("Socket was closed remotely!");
          handle_socket_closed();
        }
        else if (events[i].events & EPOLLIN) {        
          debug("We have a readable socket!");
          handle_socket_readable();
          uint8_t out_buf[] = {1, 0, 0, 0};
          int r = write(sock_fd, &out_buf, sizeof(out_buf));
          debug("%i: Write %u %i\n", i, sizeof(out_buf), r);
          if (r < 0) {
              error("Error in write %i: %s\n", i, strerror(errno));
          }
        }
      }
      else {
        debug("Don't know wat it is, %d, %d\n", events[i].data.fd, events[i].events);
        debug("Could be %x %x %x %x\n", EPOLLIN, EPOLLOUT, EPOLLERR, EPOLLHUP);
      }
    }
  }

  return 0;
}
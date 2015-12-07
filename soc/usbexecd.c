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

enum Commands {
    CMD_RESET = 0x0,
    CMD_OPEN = 0x1,
    CMD_CLOSE = 0x2,
    CMD_KILL = 0x3,
    CMD_EXIT_STATUS = 0x5,
    CMD_CLOSE_ACK = 0x6,

    CMD_WRITE_CONTROL = 0x10,
    CMD_WRITE_STDIN = 0x11,
    CMD_WRITE_STDOUT = 0x12,
    CMD_WRITE_STDERR = 0x13,

    CMD_ACK_CONTROL = 0x20,
    CMD_ACK_STDIN = 0x21,
    CMD_ACK_STDOUT = 0x22,
    CMD_ACK_STDERR = 0x23,

    CMD_CLOSE_CONTROL = 0x30,
    CMD_CLOSE_STDIN = 0x31,
    CMD_CLOSE_STDOUT = 0x32,
    CMD_CLOSE_STDERR = 0x33,
};

#define debug(args...)  syslog(LOG_INFO, args)
#define info(args...)   syslog(LOG_INFO, args)
#define error(args...)  syslog(LOG_ERR, args)
#define fatal(args...) ({ \
    syslog (LOG_CRIT, args); \
    exit(1); \
})
// The maximum number of new events to be processed in one iteration
#define MAX_EPOLL_EVENTS 16

int listener_fd  = -1;
int sock_fd      = -1;
int ep_fd        = -1;
int sig_fd       = -1;

struct sockaddr_un listener_addr;
struct epoll_event listener_event;

struct sockaddr_un spid_addr;
struct epoll_event spid_event;

// Static array for those events to be stored
struct epoll_event events[MAX_EPOLL_EVENTS];

#define PIPE_BUF 4096
#define MAX_CTRL_ARGS 255
#define MAX_WRITE_LEN 255

// Flag to close a stream immediately without waiting for remaining bytes to be flushed
#define NO_FLUSH 1
// Flag to close a stream once the remaining internal buffer has been flushed
#define FLUSH 0

// Return value indicating a stream was successfully closed
#define CLOSE_SUCCESS 0
// Return value indicated that this stream has already been closed
#define ERR_ALREADY_CLOSED -1
// Return value indicating that data remains in the internal buffer and the NO_FLUSH flag was not passed
#define ERR_BUFFER_NOT_EMPTY -2

enum Roles {
    ROLE_CTRL = 0,
    ROLE_STDIN = 1,
    ROLE_STDOUT = 2,
    ROLE_STDERR = 3,
};

typedef struct {
    // The id set by the CLI
    uint8_t id;
    // The stream role (see Roles enum)
    uint8_t role;
    // The epoll events to use as triggers
    int events;
    // Whether or not this stream has been requested to close
    bool eof;
    // The amount of bytes the other endpoint can receive
    int credit;
    // The file descriptor that this pipe buffer reads/writes data to
    int fd;
    // The index of the first readable byte of the ring buffer
    int startpos;
    // The index of the first writable byte of the ring buffer
    int endpos;
    // The number of 'active' bytes
    int bufcount;
    // The internal buffer used for back pressure
    char buffer[PIPE_BUF];
} pipebuf_t;

typedef struct {
    int pid;
    pipebuf_t ctrl;
    pipebuf_t stdin;
    pipebuf_t stdout;
    pipebuf_t stderr;
} procinfo_t;

#define MAX_COMMAND_LEN 1024
#define N_PROC 256
procinfo_t* processes[N_PROC];

void child(int ctrl, int stdin, int stdout, int stderr);
void pipebuf_out_ack(pipebuf_t* pb, size_t acksize);
void modify_pipebuf_epoll(pipebuf_t* pb, int operation);
void add_pipebuf_epoll(pipebuf_t* pb);
void delete_pipebuf_epoll(pipebuf_t* pb);
void pipebuf_interal_write(pipebuf_t* pb, uint8_t *data);
int write_from_pipebuf(pipebuf_t *pb, int fd, int len);
void pipebuf_out_to_internal_buffer(pipebuf_t* pb, int len);
void pipebuf_out_is_writable(pipebuf_t* pb);
void pipebuf_common_debug(pipebuf_t *pb, const char * str);

/* Helper function to write a packet header to the domain socket
Param: cmd - which command in the Commands enum to send
Param: id - which process is sending this
Param: arg - an argument for the command (like ACK)
Param len - the length of the data being sent following this packet
*/
void send_header(uint8_t cmd, uint8_t id, uint8_t arg, uint8_t len) {
    // If the socket is still active
    if (sock_fd > -1) {
        // Create the packet
        uint8_t buf[4] = {cmd, id, arg, len};
        // Write the packet to the socket
        int r = write(sock_fd, buf, sizeof(buf));
        // Ensure it wrote all of the bytes
        if (r != sizeof(buf)) {
            fatal("send_header failed: %s", strerror(errno));
        }
    }
}

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

/* Constructor function for both read-only and write-only pipe buffers
Param: pb - the pipebuffer pointer to initialize
Param: id - the friendly id to assign to the pipebuffer requested by the CLI
Param: role - the kind of stream to create (control, stdin, stdout, or stderr)
Param: events - which epoll events to be polling on
Param: bufend - 0 or 1 depending on the pipebuffer is writable or readable, respectively
Returns: the end of the pipe needed to communicate with the pipe buffer
*/
int pipebuf_common_init(pipebuf_t* pb, int id, int role, uint32_t events, unsigned bufend) {
    // Assign all fields to the pipe buffer
    pb->id = id;
    pb->role = role;
    pb->eof = false;
    pb->startpos = pb->endpos = pb->bufcount = 0;
    pb->credit = 0;
    pb->events = events;
    // Allocate memory for file descriptors
    int pipefd[2];
    // Create the pipes
    int r = pipe(pipefd);
    // Verify it worked
    if (r < 0) {
        fatal("pipe failed: %s", strerror(errno));
    }

    // Set the proper read or write pipe file descriptor
    pb->fd = pipefd[bufend];

    // Get the flags to the internal pipe
    int flags = fcntl(pb->fd, F_GETFL, 0);
    // Set only the internal side as non blocking
    fcntl(pb->fd, F_SETFL, flags | O_NONBLOCK);

    // Return the end of the file descriptor for the daemon to write to
    return pipefd[!bufend];
}

/* Helper function to write from a pipe buffer's internal buffer
into its file descriptor
Param: pb - the pipebuffer to write from
Param: fd - the file descriptor to write into
Param: write_len - the number of bytes to write
Returns: the number of bytes actually written
*/
int write_from_pipebuf(pipebuf_t *pb, int fd, int write_len) {
    // The number of bytes to write in a single pass
    int to_write = 0, written = 0;
    // Var to help us keep track of the number of bytes written
    int total_written = write_len;

    // While we still have data to write
    while(write_len) {

        // Attempt to write all of the bytes
        to_write = write_len;

        // If the data would go past the end of the buffer
        if (pb->startpos + to_write > PIPE_BUF) {
            // Only write until the end of the buffer
            to_write = PIPE_BUF - pb->startpos;
        }

        // Write this batch to the file descriptor from the internal buffer
        written = write(fd, &(pb->buffer[pb->startpos]), to_write);

        // Increment the start position
        pb->startpos += written;
        // Decrement the number of bytes we have pending
        pb->bufcount -= written;

        // If the start position marker is at the buffer end
        if (pb->startpos == PIPE_BUF) {
            // Set it at the start of the buffer for the next read
            pb->startpos = 0;
        }

        // Decrement the number remaining to write
        write_len -= written;
    }

    // Return the total number of bytes written
    return (total_written - write_len);
}

/* Helper function to change add, remove, or modify a pipebuffer from the epoll
into its file descriptor
Param: pb - the pipebuffer to modify
Param: operation - the operation to commit on the epoll with respect to the pipebuffer
*/
void modify_pipebuf_epoll(pipebuf_t* pb, int operation) {
    // Create an epoll_event related to that file descriptor
    struct epoll_event evt;
    evt.data.ptr = pb;
    evt.events = pb->events;

    // Register the event
    int r = epoll_ctl(ep_fd, operation, pb->fd, &evt);
    // Verify it worked
    if (r < 0) {
        fatal("epoll_ctl failed: %s", strerror(errno));
    }
}

/* Tells epoll to start polling on a pipebuffer for the events specified on initialization
Param: pb - the pipebuffer to add to epoll
*/
void add_pipebuf_epoll(pipebuf_t* pb) {
    pipebuf_common_debug(pb, "Adding pipe buf to epoll");
    modify_pipebuf_epoll(pb, EPOLL_CTL_ADD);
}

/* Tells epoll to stop polling on a pipebuffer for the events specified on initialization
Param: pb - the pipebuffer to remove from epoll
*/
void delete_pipebuf_epoll(pipebuf_t* pb) {
    pipebuf_common_debug(pb, "DELETING pipe buf from epoll");
    modify_pipebuf_epoll(pb, EPOLL_CTL_DEL);
}

/* Closing functionality for readable and writable pipe buffers
Param: pb - the pipebuffer to close
Param: flush - whether or not to allow the buffer to flush before closing
*/
int pipebuf_common_close(pipebuf_t* pb, int flush) {
    pipebuf_common_debug(pb, "Attempting to close");
    // Mark this buffer as ready to close
    pb->eof = true;

    // If this stream has no more data internally or we don't want to flush it
    // close it immediately
    if (pb->bufcount == 0 || flush == NO_FLUSH) {
        // If the file descriptor exists (which it should)
        if (pb->fd != -1) {
            // Close it
            int ret = close(pb->fd);
            // info("We attempted to close the file descriptor %d", ret);
            if (ret == -1) {
                fatal("Unable to close the file descriptor: %s", strerror(errno));
            }
            // Set it back to -1
            pb->fd = -1;
            // Reset other fields
            pb->startpos = pb->endpos = pb->bufcount = 0;
            pipebuf_common_debug(pb, "Successfully closed");
            return CLOSE_SUCCESS;
        }
        else {
            return ERR_ALREADY_CLOSED;
        }
    }
    else {
        pipebuf_common_debug(pb, "Requested Close but it has remaining bytes...");
        return ERR_BUFFER_NOT_EMPTY;
    }
}

/* A helper function to print out details of a pipebuffer and a string
Param: pb - the pipebuffer to print out details of
Param: str - the string to print following the pipebuffer details
*/
void pipebuf_common_debug(pipebuf_t *pb, const char *str) {
    debug("From process %d, role %d, credit %d, bufcount %d, startpos %d, endpos %d", pb->id, pb->role, pb->credit, pb->bufcount, pb->startpos, pb->endpos);
    debug("\t%s", str);
}

/* Initialize a pipebuffer that should have data coming in (stdout, stderr)
Param: pb - the pipebuffer to initialize
Param: id - the process id of the pipebuffer
Param: role - the type of pipebuffer stream (stdout or stderr)
Returns: the file descriptor needed to communicate with the pipebuffer created
*/
int pipebuf_in_init(pipebuf_t* pb, int id, int role) {
    int fd = pipebuf_common_init(pb, id, role, EPOLLIN, 0);

    // Start polling for data available to stream into the internal buf
    add_pipebuf_epoll(pb);

    return fd;
}

/* Close a readable pipebuffer (stdout, stderr)
Param: pb - the pipebuffer to close
Param: flush - whether or not to allow the buffer to flush before closing
*/
void pipebuf_in_close(pipebuf_t* pb, int flush) {

    // Close the pipebuf
    int res = pipebuf_common_close(pb, flush);

    // If this pipebuf was closed successfully
    // (it could have bytes remaining in the pipe buffer)
    if (res == CLOSE_SUCCESS) {
        // Tell the other end of the pipe that this fd has been closed
        send_header(CMD_CLOSE_CONTROL + pb->role, pb->id, 0, 0);
    }
}


/* Write from a readable stream (stdout, stderr) to the domain socket (CLI)
Param: pb - the pipebuffer to transfer data from (internal -> CLI)
Param: num_to_write - the number of bytes to write
Returns: the number of bytes written
*/
int pipebuf_in_write_to_sock(pipebuf_t* pb, size_t num_to_write) {

    // If there is data to write and it is less than the ack size
    if (pb->bufcount >= 0 && pb->bufcount < num_to_write) {
        // Only write whatever data is available
        num_to_write = pb->bufcount;
    }

    // If the number we are about to write is greater than the host can accept
    if (num_to_write > pb->credit) {
        // Only send the maximum the host can accept
        num_to_write = pb->credit;
    }

    // Write from STDOUT/STDERR Buffer ----> CLI
    // Store the total number of bytes we wrote
    int written = 0;
    // While there is more to write
    while (written != num_to_write) {
        // Calculate the size of this packet
        int remaining = num_to_write - written;
        int packet_write_size = (remaining < MAX_WRITE_LEN) ? remaining : MAX_WRITE_LEN;
        // Send the header so the CLI knows it's about to receive data
        send_header(CMD_WRITE_CONTROL + pb->role, pb->id, 0, packet_write_size);
        // Send the data and increment the counter of the number of bytes written
        pipebuf_common_debug(pb, "WRiting from stdout/stderr internal to CLI");
        debug("{%d bytes}", packet_write_size);
        written += write_from_pipebuf(pb, sock_fd, packet_write_size);
    }

    debug("{%d in total}", written);

    // Calculate our new credit based on what was available and how much we just wrote
    pb->credit -= written;

    return written;
}

/* Add more credits to a readable stream (stdout, stderr)
Param: pb - the pipebuffer to add more credits to. Also sends out more data to fd if necessary
Param: ack_number_size - the number of credits to add to the stream
*/
void pipebuf_in_ack(pipebuf_t* pb, size_t ack_number_size) {

    uint8_t ack_size_bytes[ack_number_size];
    int sock_closed = read_until(sock_fd, ack_size_bytes, ack_number_size);
    // If the socket was closed prematurely
    if (sock_closed == -1) {
        // Return back to the event loop
        fatal("Remote socket closed in the middle of sending ACK length bytes");
    }

    int ack_size = 0;

    for (int i = 0; i < ack_number_size; i++) {
        ack_size += (ack_size_bytes[i] << (i * 8));
    }

    // If this pipe buffer was previously full
    // But will now be able to send out data
    if (pb->bufcount == PIPE_BUF && ack_size > 0) {
        // Enable notifications of when the internal pipe buffer is written to
        add_pipebuf_epoll(pb);
    }

    // Add this ack size to the credit count
    pb->credit += ack_size;

    // If there is data ready to write to the CLI
    if (pb->bufcount > 0) {

        // Write from STDOUT/STDERR Buffer ----> CLI
        // (the smaller of ack_size of the remaining bytes in the internal buffer)
        pipebuf_in_write_to_sock(pb, (pb->bufcount < ack_size ? pb->bufcount : ack_size));
    }

    // If we just finished sending the rest of the data
    if (pb->eof && pb->bufcount == 0) {
        // Close the stream
        pipebuf_in_close(pb, FLUSH);
    }
}

/* A readable stream (stdout, stderr) has data to read into the internal buffer
Param: pb - the pipebuffer that has data to read
*/
void pipebuf_in_to_internal_buffer(pipebuf_t* pb) {

    /* Read from the file descriptor into the pipe buffer
    until the pipe buffer is full or there is nothing
    else to read */
    int r = 0;
    int try_to_read = 0;
    int space_available = PIPE_BUF - pb->bufcount;
    pipebuf_common_debug(pb, "stdout/stderr has data from child to be read");
    // While we have space in the pipe buffer
    while (space_available) {
        // Try to read the entire space
        try_to_read = space_available;

        // If the space extends past the pipe buffer end
        if (pb->endpos + try_to_read > PIPE_BUF) {
            // Set this read to only read up to the end
            try_to_read = PIPE_BUF - pb->endpos;
        }

        pipebuf_common_debug(pb, "Attempting to write from stdout/stderr child to internal");
        debug("{%d bytes}", try_to_read);
        // Read up to the end
        r = read(pb->fd, &(pb->buffer[pb->endpos]), try_to_read);
        // If we read nothing and the socket would have blocked
        if (r == -1 && (errno == EAGAIN || errno == EWOULDBLOCK)) {
            // We have finished reading, get out of the while loop
            break;
        }
        // We have read more than zero bytes sucessfully
        else if (r > 0) {
            // Subtract from our total available
            space_available -= r;
            // Increase the number of bytes awaiting transfer
            pb->bufcount += r;
            // Move the end of the buffer
            pb->endpos += r;

             // If the start position marker is at the buffer end
            if (pb->endpos == PIPE_BUF) {
                // Set it at the start of the buffer for the next read
                pb->endpos = 0;
            }

            // If the pipe buffer is full now, stop reading
            if (space_available == 0) {
                break;
            }
        }
        else if (r == 0) {
            pipebuf_common_debug(pb, "Read has returned EOF");
            // Close the file descriptor
            pb->eof = true;
            // Remove this file descriptor from the epoll
            delete_pipebuf_epoll(pb);
            break;
        }
        else {
            fatal("An error occured while reading from stdout/stderr into pipebuf: %s.", strerror(errno));
        }
    }

    // If this stream has remaining credit and data to send
    if (pb->credit && pb->bufcount > 0) {
        // Send up to the number of bytes stored in the internal buffer to the CLI
        pipebuf_in_write_to_sock(pb, pb->bufcount);

    }

    // If the pipe buffer is full
    if (pb->bufcount == PIPE_BUF) {
        // remove it from the epoll
        delete_pipebuf_epoll(pb);
    }

    // If the eof flag is set and there is no more data to send
    else if (pb->eof && pb->bufcount == 0) {
        // we can completely close down the buffer
        pipebuf_in_close(pb, FLUSH);
    }
}

/* Initialize a writable stream (control, stdin)
Param: pb - the pipebuffer to initialize
Param: id - the process id of the pipe buffer
Param: role - the type of stream to create (control, stdin)
Returns: the file descriptor to communicate with the stream
*/
int pipebuf_out_init(pipebuf_t* pb, int id, int role) {
    int fd =  pipebuf_common_init(pb, id, role, EPOLLOUT, 1);

    pipebuf_out_ack(pb, PIPE_BUF);

    pb->credit = PIPE_BUF;

    return fd;
}

/* Close a writable stream (control, stdin)
Param: pb - the pipebuffer to close
Param: flush - whether or not to allow the buffer to flush before closing
*/
void pipebuf_out_close(pipebuf_t* pb, int flush) {
    pipebuf_common_close(pb, flush);
}


/* The CLI is writing data to the internal buffer of a writable stream (control, stdin)
Param: pb - the pipebuffer to write the data to
Param: read_len - the number of bytes to read from the domain socket
*/
void pipebuf_out_to_internal_buffer(pipebuf_t* pb, int read_len) {

    // If this file has been requested to close
    if (pb->eof) {
        pipebuf_common_debug(pb, "We would have written to the internal buffer but this stream has been requested to close.");
        // Don't actually write the data
        fatal("This stream was already closed.");
    }

    // If there is currently nothing in the internal buffer
    // and data is being added
    if (pb->bufcount == 0 && read_len > 0) {
        pipebuf_common_debug(pb, "Enabling polling for stdin/control");
        // start polling this file descriptor until it's ready to be written to
        add_pipebuf_epoll(pb);
    }

    // The number of bytes to read from the socket
    int to_read = 0;

    while(read_len) {
        // Attempt to read all of the bytes
        to_read = read_len;

        // If this read would read further than the end of the ring buffer
        if (pb->endpos + read_len > PIPE_BUF) {
            // Only read until the end of the ring buffer
            to_read = PIPE_BUF - pb->endpos;
        }

        // Read from the socket into the buffer
        pipebuf_common_debug(pb, "Reading bytes from CLI socket into stdin/control internal");
        debug("(%d bytes)", to_read);

        // Read until all of the possible bytes are filled
        int sock_closed = read_until(sock_fd, &(pb->buffer[pb->endpos]), to_read);

        // If the socket closes, abort
        if (sock_closed == -1) {
            fatal("Socket connection closed in the middle of ctrl/stdin transmission");
        }

        // Add the number read into the buf count
        pb->bufcount += to_read;
        // Add the number read into the end position marker
        pb->endpos += to_read;

        // If the end position marker is at the buffer end
        if (pb->endpos == PIPE_BUF) {
            // Set it at the start of the buffer for the next read
            pb->endpos = 0;
        }

        // Subtract the bytes read from the bytes remaining and credit
        read_len -= to_read;
        pb->credit -= to_read;
    }
}

/* A writable stream's (control, stdin) internal buffer has data to write to a process
Param: pb - the pipebuffer to write the data to
*/
void pipebuf_out_is_writable(pipebuf_t* pb) {

    // Save the number of bytes we need to write
    int to_write = pb->bufcount;
    // Write as many bytes as possible from the internal buffer to
    // the file descriptor of the pipe buf
    int written = write_from_pipebuf(pb, pb->fd, pb->bufcount);
    // If there was data to write, and we wrote all of it
    if (to_write == written) {
        // Stop polling so we aren't notified that the socket is ready
        // to be written to (we have nothing to write...)
        delete_pipebuf_epoll(pb);
    }

    // Send an ACK for the bytes we wrote.
    pipebuf_out_ack(pb, written);

    // If this pipe has been requested to close
    // And there are no more bytes internally
    if (pb->eof && pb->bufcount == 0) {
        pipebuf_common_debug(pb, "Requested closed previously. Finished writing data. Closing.");
        // close it
        pipebuf_out_close(pb, FLUSH);
    }
}

/* A writable stream's (control, stdin) can add more credits
Param: pb - the pipebuffer to add credits to
Param: acksize - the number of bytes of credit to add
*/
void pipebuf_out_ack(pipebuf_t* pb, size_t acksize) {

    pb->credit += acksize;
    // The number of byte data to send
    uint8_t num_size = sizeof(int);
    size_t size_bytes[num_size];
    pipebuf_common_debug(pb, "Telling the CLI to send more data to stdin/ctrl");
    debug("(%d bytes)", num_size);
    // Tell the CLI that it can send more data to this stream
    send_header(CMD_ACK_CONTROL + pb->role, pb->id, 0, num_size);
    
    // Set all the bytes to 0
    memset(size_bytes, 0, num_size);
    // Then copy over the bytes from acksize
    memcpy(size_bytes, &acksize, num_size);
    // Then write this ack length to the socket 
    int t = write(sock_fd, size_bytes, num_size);

    if (t < 0) {
        fatal("Unable to write STDIN/CTRL Ack to the pipe: %s", strerror(errno));
    }
}

void close_process(procinfo_t* p) {

    // If the process isn't killed yet
    if (p->pid) {
        // Kill it now
        kill(p->pid, SIGKILL);
        // Wait for it to be finished
        waitpid(p->pid, NULL, 0);
    }

    // Close out all of the pipe buffers if they haven't been closed already
    if ((&p->ctrl)->fd != -1) pipebuf_out_close(&p->ctrl, NO_FLUSH);
    if ((&p->stdin)->fd != -1) pipebuf_out_close(&p->stdin, NO_FLUSH);
    if ((&p->stdout)->fd != -1) pipebuf_in_close(&p->stdout, NO_FLUSH);
    if ((&p->stderr)->fd != -1) pipebuf_in_close(&p->stderr, NO_FLUSH);
    // Free the process memory
    free(p);
    // Reset the pointer (may not be necessary)
    p = NULL;
}

/* 
The primary method of handling new bytes coming in from the domain socket.
It reads the first four bytes of the header in order to call the appropriate function.
*/
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
    procinfo_t* p = processes[id];

    debug("Got a packet of command id %d and process id %d", cmd, id);

    // Make sure it's a valid command
    if (cmd != CMD_RESET && cmd != CMD_OPEN && p == NULL) {
        if (!p) fatal("Process does not exist: %i", id);
    }

    // Handle the various commands
    switch (cmd) {
        // TODO: Reset this daemon
        case CMD_RESET:
            debug("CMD: Reset the daemon");
            exit(0);
            break;

        // Open a new process
        case CMD_OPEN:
            debug("CMD: Open a process with %d", id);
            if (p != NULL) {
                fatal("Process %i already in use", id);
            }
            
            // Create a new process
            p = processes[id] = malloc(sizeof(procinfo_t));

            // Create a writable pipebuf and return the readable pipe for the child process
            int ctrl_fd   = pipebuf_out_init (&p->ctrl,   id, 0);
            int stdin_fd  = pipebuf_out_init (&p->stdin,  id, 1);

            // Create a readable pipebuf and return the writable pipe for the child process
            int stdout_fd = pipebuf_in_init(&p->stdout, id, 2);
            int stderr_fd = pipebuf_in_init(&p->stderr, id, 3);

            int pid;
            // Fork the child process, if this is the child process
            if ((pid = fork()) == 0) {

                // For every process in the parent
                for (int iterator = 0; iterator < N_PROC; iterator++) {
                    // Get a reference to the correspondong process
                    procinfo_t* parent_process = processes[iterator];

                    // If this process exists
                    if (parent_process) {
                        // Close all of the file descriptors for this child
                        if ((&parent_process->ctrl)->fd != -1) close((&parent_process->ctrl)->fd);
                        if ((&parent_process->stdin)->fd != -1) close((&parent_process->stdin)->fd);
                        if ((&parent_process->stdout)->fd != -1) close((&parent_process->stdout)->fd);
                        if ((&parent_process->stderr)->fd != -1) close((&parent_process->stderr)->fd);
                    }
                }

                // Close socket and fds used by parent
                close(sock_fd);
                close(ep_fd);
                close(sig_fd);

                // Get started on its own task
                child(ctrl_fd, stdin_fd, stdout_fd, stderr_fd);
            // If there was an error
            } else if (pid < 0) {
                // Notify the user
                fatal("Error in fork: %s", strerror(errno));
            // If this is the parent process 
            } else {
                // Close the child ends of the pipes
                close(ctrl_fd);
                close(stdin_fd);
                close(stdout_fd);
                close(stderr_fd);
                // Set the field for the child process pid
                p->pid = pid;
            }

            break;

        case CMD_CLOSE:
            debug("CMD: Close a process with %d", id);
            // Close the process out
            close_process(p);
            // Update the table entry
            processes[id] = NULL;
            // Let the sender know that the child process was successfully closed
            send_header(CMD_CLOSE_ACK, id, 255, 0);
            // Return
            break;

        case CMD_KILL:
            debug("CMD: Kill a process with %d", id);
            // If this child hasn't already been killed
            if (p->pid) {
                // Send it the provided signal
                kill(p->pid, header[2]);
            }

            break;

        case CMD_WRITE_CONTROL:
            debug("CMD: Write to CTRL buf of process with id %d", id);
            pipebuf_out_to_internal_buffer(&p->ctrl, header[3]);
            break;

        case CMD_WRITE_STDIN:
            debug("CMD: Write to STDIN buf of process with id %d", id);
            pipebuf_out_to_internal_buffer(&p->stdin, header[3]);
            break;

        case CMD_ACK_STDOUT:
            debug("CMD: Add more credits to stdout of process with id %d", id);
            pipebuf_in_ack(&p->stdout, header[3]);
            break;

        case CMD_ACK_STDERR:
            debug("CMD: Add more credits to stderr of process with id %d", id);
            pipebuf_in_ack(&p->stderr, header[3]);
            break;

        case CMD_CLOSE_CONTROL:
            debug("CMD: Close CTRL of process with id %d", id);
            pipebuf_out_close(&p->ctrl, FLUSH);
            break;

        case CMD_CLOSE_STDIN:
            debug("CMD: Close STDIN of process with id %d", id);
            pipebuf_out_close(&p->stdin, FLUSH);
            break;

        case CMD_CLOSE_STDOUT:
            debug("CMD: Close STDOUT of process with id %d", id);
            pipebuf_in_close(&p->stdout, FLUSH);
            break;

        case CMD_CLOSE_STDERR:
            debug("CMD: Close STDERR of process with id %d", id);
            pipebuf_in_close(&p->stderr, FLUSH);
            break;
    }
}

/* Helper function to convert a OpenWRT process id to a friendly process id
as specified by the CLI
Param: pid - the OpenWRT process id
Returns: the friendly process id
*/
int find_by_pid(int pid) {
    for (int i = 0; i < N_PROC; i++) {
        if (processes[i] != NULL && processes[i]->pid == pid) {
            return i;
        }
    }
    return -1;
}

/* Called when a child died. Responsible for iterating through
all children deaths and reporting them to the CLI
*/
void handle_sigchld() {
    // Struct for reading signal info
    struct signalfd_siginfo si; 
    // Length of bytes read from signal file descriptor
    int r = 0;

    int status = 0;
    int pid = 0;

    // Continue reading the signal file descriptor
    // Multiple signals may have been sent so we need to read
    // until no more are returned
    while ((r = read(sig_fd, &si, sizeof si))) {
        // Check how many bytes were read
        if (r != sizeof(si)) {
            // If there is nore more data to read
            if (errno == EWOULDBLOCK || errno == EAGAIN) {
                // Return
                break;
            }
            else {
                error("Unable to read entire signal file descriptor %s", strerror(errno));
            }
        }

        // Make sure it was actually a SIGCHILD
        if (si.ssi_signo != SIGCHLD ) {
            fatal("We intercepted a signal that wasn't SIGCHILD");
        }
    }


    // While we continue reading pids
    while ((pid = waitpid((pid_t)(-1), &status, WNOHANG)) > 0) {
        uint8_t code = 0;

        // Grab the exit code
        if (WIFEXITED(status)) {
            code = WEXITSTATUS(status);
        } else if (WIFSIGNALED(status)) {
            code = WTERMSIG(status);
        } else {
            continue;
        }

        // Find the appropriate child
        int id = find_by_pid(pid);
        if (id < 0) {
            error("Could not find id for pid %i", pid);
            continue;
        }

        // Get a reference to the process
        procinfo_t* p = processes[id];
        // Set the pid to 0 so we know it is inactive
        p->pid = 0;

        // Send news of the death to the CLI
        send_header(CMD_EXIT_STATUS, id, code, 0);
    }
}

/*
Close and free memory for any active processes
*/
void wipe_existing_processes() {
    // Loop through all processes
    for (int i = 0; i < N_PROC; i++) {
        // Grab the process in the table
        procinfo_t *p = processes[i];
        // If it is defined
        if (p != NULL) {
            // Close it
            close_process(p);
            // Update the table
            processes[i] = NULL;
        }
    }
}

/*
In the event the spi daemon closes the socket, we
need to close the usb daemon end and reset the fd
*/
void handle_socket_closed() {
    // Remove events about new socket data
    int r = epoll_ctl(ep_fd, EPOLL_CTL_DEL, sock_fd, &spid_event);
    // Report any errors
    if (r < 0) {
        fatal("Could not remove listening socket from event poll: %s", strerror(errno));
    }
    // Close our end of the socket
    close(sock_fd);
    // Reset the fd
    sock_fd = -1;
}

/*
Creates a socket that listens for incoming connections
*/

void initialize_listening_socket(char *argv_path) {
    // Set the address family to unix
    listener_addr.sun_family = AF_UNIX;
    // Create a new unix streaming socket
    if ((listener_fd = socket(listener_addr.sun_family, SOCK_STREAM, 0)) == -1) {
        // Fail and report an error if necessary
        fatal("Error creating socket %s: %s\n", listener_addr.sun_path, strerror(errno));
    }

    // Copy the path of the domain socket to the addr struct
    strncpy(listener_addr.sun_path, argv_path, sizeof(listener_addr.sun_path));

    // Remove any previously existing path
    unlink(listener_addr.sun_path);

    // Bind that listening socket address
    if (bind(listener_fd, (struct sockaddr *) &listener_addr, sizeof(listener_addr)) == -1) {
        // Fail and report an error if necessary
        fatal("Error binding socket %s: %s\n", listener_addr.sun_path, strerror(errno));
    }

    // Start listening on that socket
    if (listen(listener_fd, 1) == -1) {
        // Fail and report an error if necessary
        fatal("Error listening on socket %s: %s\n", listener_addr.sun_path, strerror(errno));
    }

    // Set the event file descriptor to the listening socket file descriptor
    listener_event.data.fd = listener_fd;
    // We want to know when it is readable
    listener_event.events = EPOLLIN;
    // Add the socket file descriptor to our epoll fd
    int r = epoll_ctl(ep_fd, EPOLL_CTL_ADD, listener_fd, &listener_event);

    if (r < 0) {
        fatal("Could not add listening socket to event poll: %s", strerror(errno));
    }
}

/*
Create the signal mask for the SIGCHILD and add to epoll
*/
void initialize_sigchild_events() {
    // Create the signal mask for the SIGCHILD
    sigset_t    sigmask;
    sigemptyset (&sigmask);
    sigaddset(&sigmask, SIGCHLD);

    // Create the file descriptor that will be written to for that signal
    sig_fd = signalfd(-1, &sigmask, SFD_NONBLOCK);

    // Create an epoll event for that file descriptor
    struct epoll_event sig_child_event;
    sig_child_event.data.fd = sig_fd;
    sig_child_event.events = EPOLLIN;
    sigprocmask(SIG_BLOCK, &sigmask, NULL);

    // Add the file descriptor to the epoll instance and associate it with that event
    int r = epoll_ctl(ep_fd, EPOLL_CTL_ADD, sig_fd, &sig_child_event);
    if (r < 0) {
        fatal("Could not add signal fd to event poll: %s", strerror(errno));
    }
}

/*
Accept incoming socket connection, start listening for data, stop listening for new sockets
*/

void handle_incoming_spid_socket() {
    // Accept the connection and set our socket fd
    sock_fd = accept(listener_fd, NULL, NULL);
    // Fail if we have an error
    if (sock_fd < 0) {
        fatal("Unable to accept socket connection...");
    }
    // Set the data pointer to point to the fd
    spid_event.data.fd = sock_fd;
    // We want to know when it is readable,when data comes in, or an closing/error event occurs
    spid_event.events = EPOLLIN | EPOLLERR | EPOLLHUP | EPOLLRDHUP;
    // Add the socket file descriptor to our epoll fd
    int r = epoll_ctl(ep_fd, EPOLL_CTL_ADD, sock_fd, &spid_event);
    // Report any errors
    if (r < 0) {
        fatal("Could not add domain socket to event poll: %s", strerror(errno));
    }
    // Remove events about new socket connections
    r = epoll_ctl(ep_fd, EPOLL_CTL_DEL, listener_fd, &listener_event);
    // Report any errors
    if (r < 0) {
        fatal("Could not remove listening socket from event poll: %s", strerror(errno));
    }
}

/*
Closes the socket fd, clears any processes, starts looking for new sockets
*/
void handle_closed_spid_socket() {
    handle_socket_closed();

    wipe_existing_processes();

    // Start listening for new sockets
    int r = epoll_ctl(ep_fd, EPOLL_CTL_ADD, listener_fd, &listener_event);

    // Report any errors with the event addition
    if (r < 0) {
        fatal("Could not add listening socket to event poll: %s", strerror(errno));
    }

    debug("Listening for new sockets...");
}

/* Entry point. Opens a connection to the domain socket, sets up epoll and a signal file descriptor.
Houses the event loop.
*/
int main(int argc, char** argv) {
    openlog("usbexecd", LOG_PERROR | LOG_PID | LOG_NDELAY, LOG_LOCAL1);

    if (argc != 2) {
      fatal("usage: usbexecd /var/run/tessel/usb\n");
    }

    debug("Starting...");

    // Register an event listener with the kernel
    // First argument to epoll_create must be non-zero (doesn't mean anything else)
    ep_fd = epoll_create(1);
    if (ep_fd < 0) {
        fatal("Error creating epoll: %s\n", strerror(errno));
    }

    // Start up a listening socket with a path provided by the user
    initialize_listening_socket(argv[1]);


    // Create the signal mask for the SIGCHILD and add to epoll
    initialize_sigchild_events();

    while (1) {
        // Wait for at least one event to happen (indefinitely)
        int nfds = epoll_wait(ep_fd, events, MAX_EPOLL_EVENTS, -1);

        if (nfds < 0 && errno != EINTR) {
            fatal("epoll error: %s\n", strerror(errno));
        }
        // For each event that occured, check what kind of event it is
        for (int i=0; i<nfds; i++) {
            // We received an event on the connection listener
            // indicating a new connection attempt from the spi daemon
            if (events[i].data.fd == listener_fd) {
                // We have a new connection and no existing connection
                if (events[i].events & EPOLLIN && sock_fd == -1) {
                    debug("We got a connection attempt!");
                    // Accept the connection and set our socket fd
                    handle_incoming_spid_socket();
                }
            }
            // If we have an event on the spi daemon socket
            // and it's from the socket closing
            else if (events[i].data.fd == sock_fd) {
                if ((events[i].events & EPOLLERR) ||
                  (events[i].events & EPOLLHUP) ||
                  (events[i].events & EPOLLRDHUP))
                {
                    debug("Socket was closed remotely!");
                    handle_closed_spid_socket();
                }
                // We have incoming data on the spi daemon socket
                else if (events[i].events & EPOLLIN) {
                    debug("We have a readable socket!");
                    handle_socket_readable();
                }
            }
            // One of our children died
            else if (events[i].data.fd == sig_fd) {
                // Let the host know that child died
                handle_sigchld();
            // Data from child process or that they have become writable
            } else {
                // Get the corresponding pipe buffer
                pipebuf_t* pb = events[i].data.ptr;
                if (pb->role == ROLE_STDOUT || pb->role == ROLE_STDERR) {
                    // Handle data coming in
                    pipebuf_common_debug(pb, "Pipebuf In Event (STDOUT/STDERR->Internal buf)");
                    pipebuf_in_to_internal_buffer(pb);
                } else {
                    pipebuf_common_debug(pb, "Pipebuf Out Event (Internal buf ->STDIN/CTRL)");
                    // Handle data to be sent out
                    pipebuf_out_is_writable(pb);
                }
            }
        }
    }
}

/* Takes all four pipes to the child process, receives the bash command
for the control stream, parses the arguments, and execs the process.
Param ctrl - the control file descriptor
Param stdin - the stdin file descriptor
Param stdout - the stdout file descriptor
Param stderr - the stderr file descriptor
*/
void child(int ctrl, int stdin, int stdout, int stderr) {

    // Create buffer to store incoming command
    char command[MAX_COMMAND_LEN];
    // Create int variables to ensure we don't write more than we should
    int total_read = 0, r = 0, max_to_read = MAX_COMMAND_LEN -1;

    // While there is still space in the command buffer
    while (total_read <= max_to_read) {
        // Read from the control socket into the command buferr
        r = read(ctrl, &(command[total_read]), max_to_read - total_read);
        // If we received bytes
        if (r > 0) {
            // Add them to the total
            total_read += r;
            // Continue reading
            continue;
        }
        // If we read an EOF flag
        else if (r == 0) {
            // Stop reading loop
            break;
        }
        // If something else happened, we didn't plan for it
        else {
            fatal("Control Pipe is unable to read command: %s", strerror(errno));
        }
    } 

    // Add a null character to the end of the command
    command[total_read] = '\0';

    // Duplicate these pipes so we can have comms with the parent
    dup2(stdin, STDIN_FILENO);
    dup2(stdout, STDOUT_FILENO);
    dup2(stderr, STDERR_FILENO);

    // Close non-standard pipes (control was already closed)
    close(stdin);
    close(stderr);
    close(stdout);

    // The number of arguments for the command
    int argc = 0;
    // The index of the command string
    int i = 0;
    // An array of command args and one space for the null to indicate end
    char *argv[MAX_CTRL_ARGS + 1];

    // Assign the command name as the first arg
    argv[argc++] = &(command[i]);

    // Iterate over the command
    while (i < total_read && argc < MAX_CTRL_ARGS) {
        // When the byte is a null byte
        if (command[i++] == '\0') {
            // Set the next byte to be the beginning of the next arg
            argv[argc++] = &(command[i]);
        }
    }

    // Set the last arg to be NULL
    argv[argc] = NULL;

    // Execute the command
    int ret = execvp(argv[0], argv);

    // Report any errors
    if (ret == -1) {
        fatal("Could not exec child process: %s", strerror(errno));
    }
}

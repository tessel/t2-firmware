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

enum {
    CMD_RESET = 0x0,
    CMD_OPEN = 0x1,
    CMD_CLOSE = 0x2,
    CMD_KILL = 0x3,
    CMD_EXIT_STATUS = 0x5,

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

#define debug(args...)
#define info(args...)   syslog(LOG_INFO, args)
#define error(args...)  syslog(LOG_ERR, args)
#define fatal(args...) ({ \
    syslog (LOG_CRIT, args); \
    exit(1); \
})

void child(int ctrl, int stdin, int stdout, int stderr);

int sock = 0;
int epfd   = 0;
int sigfd  = 0;

#define PIPE_BUF 4096

enum {
    ROLE_CTRL = 0,
    ROLE_STDIN = 1,

    ROLE_MAX_OUT = 2,

    ROLE_STDOUT = 2,
    ROLE_STDERR = 3,
};

typedef struct {
    uint8_t id;
    uint8_t role;
    bool eof;
    int credit;
    int fd;
    int startpos;
    int endpos;
    int bufcount;
    char buffer[PIPE_BUF];
} pipebuf_t;

typedef struct {
    int pid;
    pipebuf_t ctrl;
    pipebuf_t stdin;
    pipebuf_t stdout;
    pipebuf_t stderr;
} procinfo_t;

#define N_PROC 256
procinfo_t* processes[N_PROC];

void send_header(uint8_t cmd, uint8_t id, uint8_t arg, uint8_t len) {
    uint8_t buf[4] = {cmd, id, arg, len};
    int r = write(sock, buf, sizeof(buf));
    if (r != sizeof(buf)) {
        fatal("send_header failed: %s", strerror(errno));
    }
}

int pipebuf_common_init(pipebuf_t* pb, int id, int role, uint32_t events, unsigned bufend) {
    pb->id = id;
    pb->role = role;
    pb->eof = false;
    pb->startpos = pb->endpos = pb->bufcount = 0;
    pb->credit = 0;

    int pipefd[2];
    int r = pipe(pipefd);
    if (r < 0) {
        fatal("pipe failed: %s", strerror(errno));
    }

    pb->fd = pipefd[bufend];

    struct epoll_event evt;
    evt.data.ptr = pb;
    evt.events = events;

    r = epoll_ctl(epfd, EPOLL_CTL_ADD, pb->fd, &evt);
    if (r < 0) {
        fatal("epoll_ctl failed: %s", strerror(errno));
    }

    return pipefd[!bufend];
}

void pipebuf_common_close(pipebuf_t* pb) {
    if (pb->fd) {
        close(pb->fd);
        pb->fd = 0;
    }
    pb->startpos = pb->endpos = pb->bufcount = 0;
    pb->eof = true;
    send_header(CMD_CLOSE_CONTROL + pb->role, pb->id, 0, 0);
}

int pipebuf_in_init(pipebuf_t* pb, int id, int role) {
    return pipebuf_common_init(pb, id, role, EPOLLIN, 0);
}

void pipebuf_in_handle(pipebuf_t* pb) {
    int len = 255;
    if (pb->credit < len) len = pb->credit;
    char buf[255];
    len = read(pb->fd, len);

    if (len < 0) {
        if (errno == EAGAIN) {
            return;
        }
        fatal("error in pipe read: %s", strerror(errno));
    }

    send_header(CMD_WRITE_CONTROL)

    pb->credit -= len;
    if (pb->credit == 0) {
        // disable poll
    }
}

void pipebuf_in_ack(pipebuf_t* pb, size_t acksize) {
    if (pb->credit == 0 && acksize > 0) {
        // enable poll
    }
    pb->credit += acksize;
}

void pipebuf_in_close(pipebuf_t* pb) {
    pipebuf_common_close(pb);
}


int pipebuf_out_init(pipebuf_t* pb, int id, int role) {
    int fd =  pipebuf_common_init(pb, id, role, EPOLLOUT, 1);

    send_header(CMD_ACK_CONTROL + pb->role, pb->id, 255, 0);
    pb->credit = 255;

    return fd;
}

void pipebuf_out_handle(pipebuf_t* pb) {

}

void pipebuf_out_write(pipebuf_t* pb, int len) {

}

void pipebuf_out_close(pipebuf_t* pb) {
    pipebuf_common_close(pb);
}

void handle_socket_readable() {
    uint8_t command[4];
    int r = read(sock, command, 4);

    if (r != 4) {
        fatal("Error reading command from socket");
    }

    int id = command[1];
    procinfo_t* p = processes[id];
    if (command[0] != CMD_RESET && command[0] != CMD_OPEN && p == NULL) {
        if (!p) fatal("Process does not exist: %i", command[1]);
    }

    switch (command[0]) {
        case CMD_RESET:
            exit(0);
            break;

        case CMD_OPEN:
            if (p != NULL) {
                fatal("Process %i already in use", id);
            }

            p = processes[id] = malloc(sizeof(procinfo_t));

            int ctrl_fd   = pipebuf_out_init (&p->ctrl,   id, 0);
            int stdin_fd  = pipebuf_out_init (&p->stdin,  id, 1);
            int stdout_fd = pipebuf_in_init(&p->stdout, id, 2);
            int stderr_fd = pipebuf_in_init(&p->stderr, id, 3);

            int pid;
            if ((pid = fork()) == 0) {
                child(ctrl_fd, stdin_fd, stdout_fd, stderr_fd);
            } else if (pid < 0) {
                fatal("Error in fork: %s", strerror(errno));
            } else {
                p->pid = pid;
            }

            break;

        case CMD_CLOSE:
            if (p->pid) {
                kill(p->pid, SIGKILL);
                waitpid(p->pid, NULL, 0);
            }

            pipebuf_out_close(&p->ctrl);
            pipebuf_out_close(&p->stdin);
            pipebuf_in_close(&p->stdout);
            pipebuf_in_close(&p->stderr);

            free(processes[id]);
            p = processes[id] = NULL;
            break;

        case CMD_KILL:
            kill(p->pid, command[2]);
            break;

        case CMD_WRITE_CONTROL:
            pipebuf_out_write(&p->ctrl, command[3]);
            break;

        case CMD_WRITE_STDIN:
            pipebuf_out_write(&p->stdin, command[3]);
            break;

        case CMD_ACK_STDOUT:
            pipebuf_in_ack(&p->stdin, command[2]);
            break;

        case CMD_ACK_STDERR:
            pipebuf_in_ack(&p->stdin, command[2]);
            break;

        case CMD_CLOSE_CONTROL:
            pipebuf_out_close(&p->ctrl);
            break;

        case CMD_CLOSE_STDIN:
            pipebuf_out_close(&p->stdin);
            break;

        case CMD_CLOSE_STDOUT:
            pipebuf_in_close(&p->stdout);
            break;

        case CMD_CLOSE_STDERR:
            pipebuf_in_close(&p->stderr);
            break;
    }
}

int find_by_pid(int pid) {
    for (int i = 0; i < N_PROC; i++) {
        if (processes[i] != NULL && processes[i]->pid == pid) {
            return i;
        }
    }
    return -1;
}

void handle_sigchld() {
    int status = 0;
    int pid = 0;
    while ((pid = waitpid((pid_t)(-1), &status, WNOHANG)) > 0) {
        uint8_t code = 0;

        if (WIFEXITED(status)) {
            code = WEXITSTATUS(status);
        } else if (WIFSIGNALED(status)) {
            code = WTERMSIG(status);
        } else {
            continue;
        }

        int id = find_by_pid(pid);
        if (id < 0) {
            error("Could not find id for pid %i", pid);
            continue;
        }

        procinfo_t* p = processes[id];
        p->pid = 0;
        send_header(CMD_EXIT_STATUS, id, code, 0);
    }
}

int main(int argc, char** argv) {
    openlog("usbexecd", LOG_PERROR | LOG_PID | LOG_NDELAY, LOG_LOCAL1);
    info("Starting");

    if (argc != 2) {
      fatal("usage: usbexecd /var/run/tessel/usb\n");
    }

    // Connect to socket
    {
        struct sockaddr_un addr;
        if ((sock = socket(AF_UNIX, SOCK_STREAM, 0)) == -1) {
            fatal("Error creating socket %s: %s\n", addr.sun_path, strerror(errno));
        }

        addr.sun_family = AF_UNIX;
        strncpy(addr.sun_path, argv[1], sizeof(addr.sun_path));
        size_t len = strlen(addr.sun_path) + sizeof(addr.sun_family);

        if (connect(sock, (struct sockaddr *)&addr, len) == -1) {
            fatal("Error connecting to socket %s: %s\n", addr.sun_path, strerror(errno));
        }
    }

    epfd = epoll_create(2+16);
    if (epfd < 0) {
        fatal("Error creating epoll: %s\n", strerror(errno));
    }

    const int num_events = 16;
    struct epoll_event events[num_events];

    while (1) {
        int nfds = epoll_wait(epfd, events, num_events, -1);
        if (nfds < 0) {
            fatal("epoll error: %s\n", strerror(errno));
        }

        for (int i=0; i<nfds; i++) {
            if (events[i].data.ptr == &handle_socket_readable) {
                handle_socket_readable();
            } else if (events[i].data.ptr == &handle_sigchld) {
                handle_sigchld();
            } else {
                pipebuf_t* pb = events[i].data.ptr;
                if (pb->role <= ROLE_MAX_OUT) {
                    pipebuf_in_handle(pb);
                } else {
                    pipebuf_out_handle(pb);
                }
            }
        }
    }
}

void child(int ctrl, int stdin, int stdout, int stderr) {
    printf("Child process running!\n");
    const char* s = "Child process running";
    int r = write(stderr, s, strlen(s));
    if (r < 0) {
        exit(1);
    }
    exit(0);
}

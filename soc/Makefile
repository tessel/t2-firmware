PREFIX ?= mipsel-openwrt-linux
CC = $(PREFIX)-gcc
CFLAGS = -std=c99 -O3 -Wall -Werror

all: spid usbexecd spid-slim usbexecd-slim

spid: spid.c
usbexecd: usbexecd.c
spid-slim: spid-slim.c
usbexecd-slim: usbexecd-slim.c

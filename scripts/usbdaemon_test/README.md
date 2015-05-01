# USB Daemon test tool

This directory contains Rust code to run test sequences of commands against the
USB Daemon running on openWRT.

As of now, there is nothing checking the signals on the other end, so this is
mainly a smoke test to make sure there are no crashes and the replies are
as expected.

## Rust cross toolchain

Configure rustc with `--target=mipsel-unknown-linux-gnu` and compile.
If using the nightly from `rustup.sh`, copy the
`lib/rustlib/mipsel-unknown-linux-gnu` from the build tree into the
directory where the nightly is installed.

In `~/.cargo/config`, add
```
[target.mipsel-unknown-linux-gnu]
linker = "mipsel-openwrt-linux-gcc"
```

to point to the OpenWrt SDK that must be on your ``$PATH`.

## Usage

On the host, start the test:
```
cargo run /tmp/usb-test ./testcase/open_process
```

In another shell and in the ../soc/ directory, start the daemon and connect to the test port:

```
gcc usbexecd.c -std=c99 -O3 -Wall -Werror -o usbexecd
./usbexecd /tmp/usb-test
```

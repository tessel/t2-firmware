# Port queue test tool

This directory contains Rust code to run test sequences of commands against the
coprocessor port command processor.

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

On the host:
```
cargo build --target=mipsel-unknown-linux-gnu
scp -r testcase target/mipsel-unknown-linux-gnu/debug/port_test root@<ip>:/tmp
```

On the device:

```
cd /tmp
./port_test /var/run/tessel/port_a testcase
```

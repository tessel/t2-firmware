#![feature(exit_status, path_ext)]


use std::{io, fs};
use std::io::prelude::*;
use std::path::Path;
use std::fs::PathExt as NewPathExt;

extern crate unix_socket;
use unix_socket::UnixStream;
use unix_socket::UnixListener;

use std::net::Shutdown;

fn parse_op(s: &str) -> Option<u8> {
    if s == "_" {
        None
    } else {
        Some(match s {
            "CMD_RESET" => 0x00,
            "CMD_OPEN" => 0x01,
            "CMD_CLOSE" => 0x02,
            "CMD_KILL" => 0x03,
            "CMD_EXIT_STATUS" => 0x05,
            "CMD_CLOSE_ACK" => 0x06,
            "CMD_WRITE_CONTROL" => 0x10,
            "CMD_WRITE_STDIN" => 0x11,
            "CMD_WRITE_STDOUT" => 0x12,
            "CMD_WRITE_STDERR" => 0x13,
            "CMD_ACK_CONTROL" => 0x20,
            "CMD_ACK_STDIN" => 0x21,
            "CMD_ACK_STDOUT" => 0x22,
            "CMD_ACK_STDERR" => 0x23,
            "CMD_CLOSE_CONTROL" => 0x30,
            "CMD_CLOSE_STDIN" => 0x31,
            "CMD_CLOSE_STDOUT" => 0x32,
            "CMD_CLOSE_STDERR" => 0x33,
            s if s.starts_with("0x") => {
                u8::from_str_radix(&s[2..], 16)
                    .unwrap_or_else(|_| panic!("Invalid literal: {:?}", s))
            }
            _ => s.parse().unwrap_or_else(|_| panic!("Invalid literal: {:?}", s))
        })
    }
}

// https://github.com/rust-lang/rust/pull/23369
trait ReadAll {
    fn read_all(&mut self, mut buf: &mut [u8]) -> io::Result<()>;
}

impl<R:Read> ReadAll for R {
    fn read_all(&mut self, mut buf: &mut [u8]) -> io::Result<()> {
        use std::io::{Error, ErrorKind};
        let mut total = 0;
        while total < buf.len() {
            match self.read(&mut buf[total..]) {
                Ok(0) => return Err(Error::new(ErrorKind::Other,
                    "failed to read whole buffer",
                )),

                Ok(n) => total += n,
                Err(ref e) if e.kind() == ErrorKind::Interrupted => {}
                Err(e) => return Err(e),
            }
        }
        Ok(())
    }
}

fn run_test(sock: &mut UnixStream, test: &mut BufRead) -> bool {
    let mut success = true;
    for line in test.lines() {
        let line = line.unwrap();
        let is_out = if line.starts_with("<") { true }
                else if line.starts_with(">") { false }
                else { continue };

        let ops = line[1..].trim_matches(' ').split(' ').map(parse_op);

        if is_out {
            let buf = ops.map(|x| x.unwrap_or(0)).collect::<Vec<_>>();
            println!("< {:?}", &buf);
            sock.write_all(&buf).unwrap();
        } else {
            let m = ops.collect::<Vec<_>>();
            let mut buf = vec![0; m.len()];
            sock.read_all(&mut buf).unwrap();
            println!("> {:?}", buf);
            for p in buf.into_iter().zip(m.into_iter()) {
                if let (r, Some(e)) = p {
                    if r != e {
                        println!("FAIL: read 0x{:x}, expected 0x{:x}", r, e);
                        success = false;
                    }
                }
            }
        }
    }
    success
}

fn run_tests(sockpath: &Path, fname: &Path) -> io::Result<()> {
    let files = if fname.is_dir() {
        let dir = try!(fs::read_dir(fname));
        try!(dir.map(|x| x.map(|e| e.path())).collect())
    } else if fname.is_file() {
        vec![fname.to_path_buf()]
    } else {
        panic!("{} does not exist!");
    };

    let mut success = true;
    for file in &files {
        println!("Running: {:?}", file);

        let listener = try!(UnixListener::bind(&sockpath));
        let mut sock = try!(listener.accept());

        println!("Daemon connected...");

        let mut file = io::BufReader::new(try!(fs::File::open(file)));

        success &= run_test(&mut sock, &mut file);

        sock.shutdown(Shutdown::Both);

        std::thread::sleep_ms(100);
    }

    std::env::set_exit_status(if success { 0 } else { 1 });
    Ok(())
}

fn main() {

    let args = std::env::args().collect::<Vec<_>>();
    let sockpath =  Path::new(&args[1]);
    let fname = Path::new(&args[2]);
    println!("Starting test at socket path {:?}", sockpath);

    run_tests(sockpath, fname).unwrap();

    println!("Done!" );
    fs::remove_file(sockpath).unwrap();
}
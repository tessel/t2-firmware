## Compiling USB Daemon and SPI Daemon
```

vagrant init hashicorp/precise64
git clone https://github.com/tessel/t2-firmware.git
vagrant up
vagrant ssh
cd /home/vagrant
wget https://s3.amazonaws.com/builds.tessel.io/t2/OpenWRT+SDK/OpenWrt-SDK-ramips-mt7620_gcc-4.8-linaro_uClibc-0.9.33.2.Linux-x86_64.tar.bz2
tar -xvf OpenWrt-SDK-ramips-mt7620_gcc-4.8-linaro_uClibc-0.9.33.2.Linux-x86_64.tar.bz2
export STAGING_DIR=/home/vagrant/OpenWrt-SDK-ramips-mt7620_gcc-4.8-linaro_uClibc-0.9.33.2.Linux-x86_64/staging_dir
export PATH=$PATH:$STAGING_DIR/toolchain-mipsel_24kec+dsp_gcc-4.8-linaro_uClibc-0.9.33.2/bin
cd /vagrant/t2-firmware/soc
make
```

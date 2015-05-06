#pragma once
#include "common/board.h"
#include "common/hw.h"
#include "samd/usb_samd.h"

/// DMA allocation. Channels 0-3 support EVSYS and are reserved for
/// functions that need it


/// EVSYS allocation

/// USB Endpoint allocation

/// Timer allocation

// TCC allocation

// GCLK channel allocation
#define GCLK_SYSTEM 0
#define GCLK_32K    2

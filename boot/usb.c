// Copyright 2014 Technical Machine, Inc. See the COPYRIGHT
// file at the top-level directory of this distribution.
//
// Licensed under the Apache License, Version 2.0 <LICENSE-APACHE or
// http://www.apache.org/licenses/LICENSE-2.0> or the MIT license
// <LICENSE-MIT or http://opensource.org/licenses/MIT>, at your
// option. This file may not be copied, modified, or distributed
// except according to those terms.

#include "boot.h"
#include "usb.h"
#include "samd/usb_samd.h"

USB_ENDPOINTS(1);

const USB_DeviceDescriptor device_descriptor = {
	.bLength = sizeof(USB_DeviceDescriptor),
	.bDescriptorType = USB_DTYPE_Device,

	.bcdUSB                 = 0x0200,
	.bDeviceClass           = 0,
	.bDeviceSubClass        = USB_CSCP_NoDeviceSubclass,
	.bDeviceProtocol        = USB_CSCP_NoDeviceProtocol,

	.bMaxPacketSize0        = 64,
	.idVendor               = 0x59e3,
	.idProduct              = 0x5555,
	.bcdDevice              = 0x0002,

	.iManufacturer          = 0x01,
	.iProduct               = 0x02,
	.iSerialNumber          = 0x03,

	.bNumConfigurations     = 1
};

typedef struct ConfigDesc {
	USB_ConfigurationDescriptor Config;
	USB_InterfaceDescriptor dfu_intf_flash;
	DFU_FunctionalDescriptor dfu_desc_flash;
	USB_InterfaceDescriptor dfu_intf_ram;
	DFU_FunctionalDescriptor dfu_desc_ram;
} ConfigDesc;

const ConfigDesc configuration_descriptor = {
	.Config = {
		.bLength = sizeof(USB_ConfigurationDescriptor),
		.bDescriptorType = USB_DTYPE_Configuration,
		.wTotalLength  = sizeof(ConfigDesc),
		.bNumInterfaces = 1,
		.bConfigurationValue = 1,
		.iConfiguration = 0,
		.bmAttributes = USB_CONFIG_ATTR_BUSPOWERED,
		.bMaxPower = USB_CONFIG_POWER_MA(500)
	},
	.dfu_intf_flash = {
		.bLength = sizeof(USB_InterfaceDescriptor),
		.bDescriptorType = USB_DTYPE_Interface,
		.bInterfaceNumber = 0,
		.bAlternateSetting = 0,
		.bNumEndpoints = 0,
		.bInterfaceClass = DFU_INTERFACE_CLASS,
		.bInterfaceSubClass = DFU_INTERFACE_SUBCLASS,
		.bInterfaceProtocol = DFU_INTERFACE_PROTOCOL,
		.iInterface = 0x10
	},
	.dfu_desc_flash = {
		.bLength = sizeof(DFU_FunctionalDescriptor),
		.bDescriptorType = DFU_DESCRIPTOR_TYPE,
		.bmAttributes = DFU_ATTR_CAN_DOWNLOAD | DFU_ATTR_WILL_DETACH,
		.wDetachTimeout = 0,
		.wTransferSize = DFU_TRANSFER_SIZE,
		.bcdDFUVersion = 0x0101,
	},
	.dfu_intf_ram = {
		.bLength = sizeof(USB_InterfaceDescriptor),
		.bDescriptorType = USB_DTYPE_Interface,
		.bInterfaceNumber = 0,
		.bAlternateSetting = 1,
		.bNumEndpoints = 0,
		.bInterfaceClass = DFU_INTERFACE_CLASS,
		.bInterfaceSubClass = DFU_INTERFACE_SUBCLASS,
		.bInterfaceProtocol = DFU_INTERFACE_PROTOCOL,
		.iInterface = 0x11
	},
	.dfu_desc_ram = {
		.bLength = sizeof(DFU_FunctionalDescriptor),
		.bDescriptorType = DFU_DESCRIPTOR_TYPE,
		.bmAttributes = DFU_ATTR_CAN_DOWNLOAD | DFU_ATTR_WILL_DETACH,
		.wDetachTimeout = 0,
		.wTransferSize = DFU_TRANSFER_SIZE,
		.bcdDFUVersion = 0x0101,
	},
};

const USB_StringDescriptor language_string = {
	.bLength = USB_STRING_LEN(1),
	.bDescriptorType = USB_DTYPE_String,
	.bString = {USB_LANGUAGE_EN_US},
};

const USB_StringDescriptor msft_os = {
	.bLength = 18,
	.bDescriptorType = USB_DTYPE_String,
	.bString = {'M','S','F','T','1','0','0',0xee},
};

const USB_MicrosoftCompatibleDescriptor msft_compatible = {
	.dwLength = sizeof(USB_MicrosoftCompatibleDescriptor) + sizeof(USB_MicrosoftCompatibleDescriptor_Interface),
	.bcdVersion = 0x0100,
	.wIndex = 0x0004,
	.bCount = 1,
	.reserved = {0, 0, 0, 0, 0, 0, 0},
	.interfaces = {
		{
			.bFirstInterfaceNumber = 0,
			.reserved1 = 0,
			.compatibleID = "WINUSB\0\0",
			.subCompatibleID = {0, 0, 0, 0, 0, 0, 0, 0},
			.reserved2 = {0, 0, 0, 0, 0, 0},
		}
	}
};

uint16_t usb_cb_get_descriptor(uint8_t type, uint8_t index, const uint8_t** ptr) {
	const void* address = NULL;
	uint16_t size    = 0;

	switch (type) {
		case USB_DTYPE_Device:
			address = &device_descriptor;
			size    = sizeof(USB_DeviceDescriptor);
			break;
		case USB_DTYPE_Configuration:
			address = &configuration_descriptor;
			size    = sizeof(ConfigDesc);
			break;
		case USB_DTYPE_String:
			switch (index) {
				case 0x00:
					address = &language_string;
					break;
				case 0x01:
					address = usb_string_to_descriptor("Signalspec");
					break;
				case 0x02:
					address = usb_string_to_descriptor("Starfish DFU");
					break;
				case 0x03:
					address = samd_serial_number_string_descriptor();
					break;
				case 0x10:
					address = usb_string_to_descriptor("Flash");
					break;
				case 0x11:
					address = usb_string_to_descriptor("SRAM");
					break;
				case 0xf0:
					address = usb_string_to_descriptor("");
					break;
				case 0xee:
					address = &msft_os;
					break;
			}
			size = (((USB_StringDescriptor*)address))->bLength;
			break;
	}

	*ptr = address;
	return size;
}

void usb_cb_reset(void) {
}

bool usb_cb_set_configuration(uint8_t config) {
	if (config <= 1) {
		return true;
	}
	return false;
}

void usb_cb_control_setup(void) {
	uint8_t recipient = usb_setup.bmRequestType & USB_REQTYPE_RECIPIENT_MASK;
	if (recipient == USB_RECIPIENT_DEVICE) {
		if (usb_setup.bRequest == 0xee) {
			return usb_handle_msft_compatible(&msft_compatible);
		}
	} else if (recipient == USB_RECIPIENT_INTERFACE) {
		if (usb_setup.wIndex == DFU_INTF) {
			return dfu_control_setup();
		}
	}
	return usb_ep0_stall();
}

void usb_cb_control_in_completion(void) {
	uint8_t recipient = usb_setup.bmRequestType & USB_REQTYPE_RECIPIENT_MASK;
	if (recipient == USB_RECIPIENT_INTERFACE) {
		if (usb_setup.wIndex == DFU_INTF) {
			dfu_control_in_completion();
		}
	}
}

void usb_cb_control_out_completion(void) {
	uint8_t recipient = usb_setup.bmRequestType & USB_REQTYPE_RECIPIENT_MASK;
	if (recipient == USB_RECIPIENT_INTERFACE) {
		if (usb_setup.wIndex == DFU_INTF) {
			dfu_control_out_completion();
		}
	}
}

void usb_cb_completion(void) {

}

bool usb_cb_set_interface(uint16_t interface, uint16_t altsetting) {
	if (interface == DFU_INTF) {
		if (altsetting == 0) {
			dfu_reset();
			return true;
		}
	}
	return false;
}

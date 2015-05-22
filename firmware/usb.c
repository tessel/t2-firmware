#include "usb.h"
#include "firmware.h"
#include "class/cdc/cdc_standard.h"

USB_ENDPOINTS(5);

__attribute__((__aligned__(4))) const USB_DeviceDescriptor device_descriptor = {
	.bLength = sizeof(USB_DeviceDescriptor),
	.bDescriptorType = USB_DTYPE_Device,

	.bcdUSB                 = 0x0200,
	.bDeviceClass           = 0,
	.bDeviceSubClass        = USB_CSCP_NoDeviceSubclass,
	.bDeviceProtocol        = USB_CSCP_NoDeviceProtocol,

	.bMaxPacketSize0        = 64,
	.idVendor               = 0x59e3,
	.idProduct              = 0x5555,
	.bcdDevice              = 0x0110,

	.iManufacturer          = 0x01,
	.iProduct               = 0x02,
	.iSerialNumber          = 0x03,

	.bNumConfigurations     = 1
};

uint16_t altsetting = 0;

typedef struct ConfigDesc {
	USB_ConfigurationDescriptor Config;
	USB_InterfaceDescriptor OffInterface;

	USB_InterfaceDescriptor PortInterface;
	USB_EndpointDescriptor PortInEndpoint;
	USB_EndpointDescriptor PortOutEndpoint;

	USB_InterfaceDescriptor DAPInterface;
	USB_EndpointDescriptor DAPInEndpoint;
	USB_EndpointDescriptor DAPOutEndpoint;

}  __attribute__((packed)) ConfigDesc;

__attribute__((__aligned__(4))) const ConfigDesc configuration_descriptor = {
	.Config = {
		.bLength = sizeof(USB_ConfigurationDescriptor),
		.bDescriptorType = USB_DTYPE_Configuration,
		.wTotalLength  = sizeof(ConfigDesc),
		.bNumInterfaces = 3,
		.bConfigurationValue = 1,
		.iConfiguration = 0,
		.bmAttributes = USB_CONFIG_ATTR_BUSPOWERED,
		.bMaxPower = USB_CONFIG_POWER_MA(500)
	},
	.OffInterface = {
		.bLength = sizeof(USB_InterfaceDescriptor),
		.bDescriptorType = USB_DTYPE_Interface,
		.bInterfaceNumber = 0,
		.bAlternateSetting = 0,
		.bNumEndpoints = 0,
		.bInterfaceClass = USB_CSCP_VendorSpecificClass,
		.bInterfaceSubClass = 0x00,
		.bInterfaceProtocol = 0x00,
		.iInterface = 0,
	},
	.PortInterface = {
		.bLength = sizeof(USB_InterfaceDescriptor),
		.bDescriptorType = USB_DTYPE_Interface,
		.bInterfaceNumber = 0,
		.bAlternateSetting = ALTSETTING_PORT,
		.bNumEndpoints = 2,
		.bInterfaceClass = USB_CSCP_VendorSpecificClass,
		.bInterfaceSubClass = 0x00,
		.bInterfaceProtocol = 0x00,
		.iInterface = 0x10,
	},
	.PortInEndpoint = {
		.bLength = sizeof(USB_EndpointDescriptor),
		.bDescriptorType = USB_DTYPE_Endpoint,
		.bEndpointAddress = USB_EP_PORT_IN,
		.bmAttributes = (USB_EP_TYPE_BULK | ENDPOINT_ATTR_NO_SYNC | ENDPOINT_USAGE_DATA),
		.wMaxPacketSize = 64,
		.bInterval = 0x00
	},
	.PortOutEndpoint = {
		.bLength = sizeof(USB_EndpointDescriptor),
		.bDescriptorType = USB_DTYPE_Endpoint,
		.bEndpointAddress = USB_EP_PORT_OUT,
		.bmAttributes = (USB_EP_TYPE_BULK | ENDPOINT_ATTR_NO_SYNC | ENDPOINT_USAGE_DATA),
		.wMaxPacketSize = 64,
		.bInterval = 0x00
	},
	.DAPInterface = {
		.bLength = sizeof(USB_InterfaceDescriptor),
		.bDescriptorType = USB_DTYPE_Interface,
		.bInterfaceNumber = 0,
		.bAlternateSetting = ALTSETTING_DAP,
		.bNumEndpoints = 2,
		.bInterfaceClass = 3, // HID (but not really)
		.bInterfaceSubClass = 0x00,
		.bInterfaceProtocol = 0x00,
		.iInterface = 0x11,
	},
	.DAPInEndpoint = {
		.bLength = sizeof(USB_EndpointDescriptor),
		.bDescriptorType = USB_DTYPE_Endpoint,
		.bEndpointAddress = USB_EP_DAP_HID_IN,
		.bmAttributes = (USB_EP_TYPE_BULK | ENDPOINT_ATTR_NO_SYNC | ENDPOINT_USAGE_DATA),
		.wMaxPacketSize = 64,
		.bInterval = 0x00
	},
	.DAPOutEndpoint = {
		.bLength = sizeof(USB_EndpointDescriptor),
		.bDescriptorType = USB_DTYPE_Endpoint,
		.bEndpointAddress = USB_EP_DAP_HID_OUT,
		.bmAttributes = (USB_EP_TYPE_BULK | ENDPOINT_ATTR_NO_SYNC | ENDPOINT_USAGE_DATA),
		.wMaxPacketSize = 64,
		.bInterval = 0x00
	},
};

__attribute__((__aligned__(4))) const USB_StringDescriptor language_string = {
	.bLength = USB_STRING_LEN(1),
	.bDescriptorType = USB_DTYPE_String,
	.bString = {USB_LANGUAGE_EN_US},
};

__attribute__((__aligned__(4))) const USB_StringDescriptor msft_os = {
	.bLength = 18,
	.bDescriptorType = USB_DTYPE_String,
	.bString = u"MSFT100\xee"
};

__attribute__((__aligned__(4))) const USB_MicrosoftCompatibleDescriptor msft_compatible = {
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
					address = usb_string_to_descriptor("Starfish");
					break;
				case 0x03:
					address = samd_serial_number_string_descriptor();
					break;
				case 0x10:
					address = usb_string_to_descriptor("TMPort");
					break;
				case 0x11:
					address = usb_string_to_descriptor("CMSIS-DAP");
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

#define REQ_PWR 0x10
#define REQ_PWR_EN_A 0x10
#define REQ_PWR_EN_B 0x11
#define REQ_PWR_EN_REG 0x12
#define REQ_PWR_LED_R 0x20
#define REQ_PWR_LED_G 0x21
#define REQ_PWR_LED_B 0x22
#define REQ_PWR_DAC 0xd0

#define REQ_INFO 0x30
#define REQ_INFO_GIT_HASH 0x0

void req_gpio(uint16_t wIndex, uint16_t wValue) {
	switch (wIndex) {
		case REQ_PWR_EN_A:
			pin_set(PIN_EN_A, wValue);
			break;
		case REQ_PWR_EN_B:
			pin_set(PIN_EN_B, wValue);
			break;
		case REQ_PWR_EN_REG:
			pin_set(PIN_EN_REG, wValue);
			break;
		case REQ_PWR_LED_R:
			pin_set(PIN_LED[0], wValue);
			break;
		case REQ_PWR_LED_G:
			pin_set(PIN_LED[1], wValue);
			break;
		case REQ_PWR_LED_B:
			pin_set(PIN_LED[2], wValue);
			break;
		case REQ_PWR_DAC:
			DAC->DATA.reg = wValue;
			break;
		default:
			return usb_ep0_stall();
	}

	usb_ep0_out();
	return usb_ep0_in(0);
}

void req_info(uint16_t wIndex) {
    const char* str = 0;
    switch (wIndex) {
        case REQ_INFO_GIT_HASH:
            str = git_version;
            break;
        default:
            return usb_ep0_stall();
    }
    uint16_t len = strlen(str);
    if (len > USB_EP0_SIZE) len = USB_EP0_SIZE;
    memcpy(ep0_buf_in, str, len);
    usb_ep0_out();
    return usb_ep0_in(len);
}

void usb_cb_control_setup(void) {
	uint8_t recipient = usb_setup.bmRequestType & USB_REQTYPE_RECIPIENT_MASK;
	if (recipient == USB_RECIPIENT_DEVICE) {
		switch(usb_setup.bRequest) {
			case 0xee:	  return usb_handle_msft_compatible(&msft_compatible);
			case REQ_PWR: return req_gpio(usb_setup.wIndex, usb_setup.wValue);
			case REQ_INFO: return req_info(usb_setup.wIndex);
		}
	} else if (recipient == USB_RECIPIENT_INTERFACE) {
	}
	return usb_ep0_stall();
}

void usb_cb_control_in_completion(void) {
}

void usb_cb_control_out_completion(void) {
}

void usb_cb_completion(void) {
	if (altsetting == ALTSETTING_PORT) {
        if (usb_ep_pending(USB_EP_PORT_OUT)) {
			port_bridge_out_completion(&port_a, usb_ep_out_length(USB_EP_PORT_OUT));
            usb_ep_handled(USB_EP_PORT_OUT);
        }

        if (usb_ep_pending(USB_EP_PORT_IN)) {
			port_bridge_in_completion(&port_a);
            usb_ep_handled(USB_EP_PORT_IN);
        }
    } else if (altsetting == ALTSETTING_DAP) {
		if (usb_ep_pending(USB_EP_DAP_HID_OUT)) {
			dap_handle_usb_out_completion();
			usb_ep_handled(USB_EP_DAP_HID_OUT);
		}

		if (usb_ep_pending(USB_EP_DAP_HID_IN)) {
			dap_handle_usb_in_completion();
			usb_ep_handled(USB_EP_DAP_HID_IN);
		}
	}
}

bool usb_cb_set_interface(uint16_t interface, uint16_t new_altsetting) {
	if (interface == 0) {
		if (new_altsetting > 2) {
			return false;
		}

		if (altsetting == ALTSETTING_PORT){
			port_disable(&port_a);
		} else if (altsetting == ALTSETTING_DAP) {
			dap_disable();
		}

		if (new_altsetting == ALTSETTING_PORT) {
			port_enable(&port_a);
		} else if (new_altsetting == ALTSETTING_DAP) {
			dap_enable();
		}

		altsetting = new_altsetting;
		return true;
	}
	return false;
}

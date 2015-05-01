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
	.idVendor               = 0x9999,
	.idProduct              = 0xFFFF,
	.bcdDevice              = 0x0110,

	.iManufacturer          = 0x01,
	.iProduct               = 0x02,
	.iSerialNumber          = 0x03,

	.bNumConfigurations     = 1
};

uint16_t altsetting = 0;

#define INTERFACE_VENDOR 0
	#define ALTSETTING_FLASH 1
	#define ALTSETTING_PIPE 2
#define INTERFACE_CDC_CONTROL 1
#define INTERFACE_CDC_DATA 2

typedef struct ConfigDesc {
	USB_ConfigurationDescriptor Config;
	USB_InterfaceDescriptor OffInterface;

	USB_InterfaceDescriptor FlashInterface;
	USB_EndpointDescriptor FlashInEndpoint;
	USB_EndpointDescriptor FlashOutEndpoint;

	USB_InterfaceDescriptor PipeInterface;
	USB_EndpointDescriptor PipeInEndpoint;
	USB_EndpointDescriptor PipeOutEndpoint;

	USB_InterfaceDescriptor CDC_control_interface;

	CDC_FunctionalHeaderDescriptor CDC_functional_header;
	CDC_FunctionalACMDescriptor CDC_functional_ACM;
	CDC_FunctionalUnionDescriptor CDC_functional_union;
	USB_EndpointDescriptor CDC_notification_endpoint;

	USB_InterfaceDescriptor CDC_data_interface;
	USB_EndpointDescriptor CDC_out_endpoint;
	USB_EndpointDescriptor CDC_in_endpoint;
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
	.FlashInterface = {
		.bLength = sizeof(USB_InterfaceDescriptor),
		.bDescriptorType = USB_DTYPE_Interface,
		.bInterfaceNumber = 0,
		.bAlternateSetting = ALTSETTING_FLASH,
		.bNumEndpoints = 2,
		.bInterfaceClass = USB_CSCP_VendorSpecificClass,
		.bInterfaceSubClass = 0x00,
		.bInterfaceProtocol = 0x00,
		.iInterface = 0,
	},
	.FlashInEndpoint = {
		.bLength = sizeof(USB_EndpointDescriptor),
		.bDescriptorType = USB_DTYPE_Endpoint,
		.bEndpointAddress = USB_EP_FLASH_IN,
		.bmAttributes = (USB_EP_TYPE_BULK | ENDPOINT_ATTR_NO_SYNC | ENDPOINT_USAGE_DATA),
		.wMaxPacketSize = 64,
		.bInterval = 0x00
	},
	.FlashOutEndpoint = {
		.bLength = sizeof(USB_EndpointDescriptor),
		.bDescriptorType = USB_DTYPE_Endpoint,
		.bEndpointAddress = USB_EP_FLASH_OUT,
		.bmAttributes = (USB_EP_TYPE_BULK | ENDPOINT_ATTR_NO_SYNC | ENDPOINT_USAGE_DATA),
		.wMaxPacketSize = 64,
		.bInterval = 0x00
	},
	.PipeInterface = {
		.bLength = sizeof(USB_InterfaceDescriptor),
		.bDescriptorType = USB_DTYPE_Interface,
		.bInterfaceNumber = 0,
		.bAlternateSetting = ALTSETTING_PIPE,
		.bNumEndpoints = 2,
		.bInterfaceClass = USB_CSCP_VendorSpecificClass,
		.bInterfaceSubClass = 0x00,
		.bInterfaceProtocol = 0x00,
		.iInterface = 0,
	},
	.PipeInEndpoint = {
		.bLength = sizeof(USB_EndpointDescriptor),
		.bDescriptorType = USB_DTYPE_Endpoint,
		.bEndpointAddress = USB_EP_PIPE_IN,
		.bmAttributes = (USB_EP_TYPE_BULK | ENDPOINT_ATTR_NO_SYNC | ENDPOINT_USAGE_DATA),
		.wMaxPacketSize = 64,
		.bInterval = 0x00
	},
	.PipeOutEndpoint = {
		.bLength = sizeof(USB_EndpointDescriptor),
		.bDescriptorType = USB_DTYPE_Endpoint,
		.bEndpointAddress = USB_EP_PIPE_OUT,
		.bmAttributes = (USB_EP_TYPE_BULK | ENDPOINT_ATTR_NO_SYNC | ENDPOINT_USAGE_DATA),
		.wMaxPacketSize = 64,
		.bInterval = 0x00
	},
	.CDC_control_interface = {
		.bLength = sizeof(USB_InterfaceDescriptor),
		.bDescriptorType = USB_DTYPE_Interface,
		.bInterfaceNumber = INTERFACE_CDC_CONTROL,
		.bAlternateSetting = 0,
		.bNumEndpoints = 1,
		.bInterfaceClass = CDC_INTERFACE_CLASS,
		.bInterfaceSubClass = CDC_INTERFACE_SUBCLASS_ACM,
		.bInterfaceProtocol = 0,
		.iInterface = 0,
	},
	.CDC_functional_header = {
		.bLength = sizeof(CDC_FunctionalHeaderDescriptor),
		.bDescriptorType = USB_DTYPE_CSInterface,
		.bDescriptorSubtype = CDC_SUBTYPE_HEADER,
		.bcdCDC = 0x0110,
	},
	.CDC_functional_ACM = {
		.bLength = sizeof(CDC_FunctionalACMDescriptor),
		.bDescriptorType = USB_DTYPE_CSInterface,
		.bDescriptorSubtype = CDC_SUBTYPE_ACM,
		.bmCapabilities = 0x00,
	},
	.CDC_functional_union = {
		.bLength = sizeof(CDC_FunctionalUnionDescriptor),
		.bDescriptorType = USB_DTYPE_CSInterface,
		.bDescriptorSubtype = CDC_SUBTYPE_UNION,
		.bMasterInterface = INTERFACE_CDC_CONTROL,
		.bSlaveInterface = INTERFACE_CDC_DATA,
	},
	.CDC_notification_endpoint = {
		.bLength = sizeof(USB_EndpointDescriptor),
		.bDescriptorType = USB_DTYPE_Endpoint,
		.bEndpointAddress = USB_EP_CDC_NOTIFICATION,
		.bmAttributes = (USB_EP_TYPE_INTERRUPT | ENDPOINT_ATTR_NO_SYNC | ENDPOINT_USAGE_DATA),
		.wMaxPacketSize = 8,
		.bInterval = 0xFF
	},
	.CDC_data_interface = {
		.bLength = sizeof(USB_InterfaceDescriptor),
		.bDescriptorType = USB_DTYPE_Interface,
		.bInterfaceNumber = INTERFACE_CDC_DATA,
		.bAlternateSetting = 0,
		.bNumEndpoints = 2,
		.bInterfaceClass = CDC_INTERFACE_CLASS_DATA,
		.bInterfaceSubClass = 0,
		.bInterfaceProtocol = 0,
		.iInterface = 0,
	},
	.CDC_out_endpoint = {
		.bLength = sizeof(USB_EndpointDescriptor),
		.bDescriptorType = USB_DTYPE_Endpoint,
		.bEndpointAddress = USB_EP_CDC_OUT,
		.bmAttributes = (USB_EP_TYPE_BULK | ENDPOINT_ATTR_NO_SYNC | ENDPOINT_USAGE_DATA),
		.wMaxPacketSize = 64,
		.bInterval = 0x05
	},
	.CDC_in_endpoint = {
		.bLength = sizeof(USB_EndpointDescriptor),
		.bDescriptorType = USB_DTYPE_Endpoint,
		.bEndpointAddress = USB_EP_CDC_IN,
		.bmAttributes = (USB_EP_TYPE_BULK | ENDPOINT_ATTR_NO_SYNC | ENDPOINT_USAGE_DATA),
		.wMaxPacketSize = 64,
		.bInterval = 0x05
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
					address = usb_string_to_descriptor("Technical Machine");
					break;
				case 0x02:
					address = usb_string_to_descriptor("Tessel 2");
					break;
				case 0x03:
					address = samd_serial_number_string_descriptor();
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
		usbserial_init();
		return true;
	}
	return false;
}

#define REQ_PWR 0x10
#define REQ_PWR_RST 0x0
#define REQ_PWR_SOC 0x1
#define REQ_PWR_PORT_A 0x10
#define REQ_PWR_PORT_B 0x11
#define REQ_PWR_LED 0x20

void req_gpio(uint16_t wIndex, uint16_t wValue) {
	switch (wIndex) {
		case REQ_PWR_RST:
			pin_low(PIN_SOC_RST);
			pin_dir(PIN_SOC_RST, !wValue);
			break;
		case REQ_PWR_SOC:
			pin_set(PIN_SOC_PWR, wValue);
			break;
		case REQ_PWR_PORT_A:
			pin_set(PORT_A.power, wValue);
			break;
		case REQ_PWR_PORT_B:
			pin_set(PORT_B.power, wValue);
			break;
		case REQ_PWR_LED:
			pin_set(PIN_LED, wValue);
			break;
		default:
			return usb_ep0_stall();
	}

	usb_ep0_out();
	return usb_ep0_in(0);
}

void usb_cb_control_setup(void) {
	uint8_t recipient = usb_setup.bmRequestType & USB_REQTYPE_RECIPIENT_MASK;
	if (recipient == USB_RECIPIENT_DEVICE) {
		switch(usb_setup.bRequest) {
			case 0xee:	  return usb_handle_msft_compatible(&msft_compatible);
			case REQ_PWR: return req_gpio(usb_setup.wIndex, usb_setup.wValue);
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
	if (altsetting == ALTSETTING_FLASH) {
		if (usb_ep_pending(USB_EP_FLASH_OUT)) {
			flash_usb_out_completion();
			usb_ep_handled(USB_EP_FLASH_OUT);
		}

		if (usb_ep_pending(USB_EP_FLASH_IN)) {
			flash_usb_in_completion();
			usb_ep_handled(USB_EP_FLASH_IN);
		}
	} else if (altsetting == ALTSETTING_PIPE) {
		if (usb_ep_pending(USB_EP_PIPE_OUT)) {
			pipe_usb_out_completion();
			usb_ep_handled(USB_EP_PIPE_OUT);
		}

		if (usb_ep_pending(USB_EP_PIPE_IN)) {
			pipe_usb_in_completion();
			usb_ep_handled(USB_EP_PIPE_IN);
		}
	}

	if (usb_ep_pending(USB_EP_CDC_OUT)) {
		usbserial_out_completion();
		usb_ep_handled(USB_EP_CDC_OUT);
	}

	if (usb_ep_pending(USB_EP_CDC_IN)) {
		usbserial_in_completion();
		usb_ep_handled(USB_EP_CDC_IN);
	}
}

bool usb_cb_set_interface(uint16_t interface, uint16_t new_altsetting) {
	if (interface == 0) {
		if (new_altsetting > 2) {
			return false;
		}

		if (altsetting == ALTSETTING_FLASH) {
			flash_disable();
		} else if (altsetting == ALTSETTING_PIPE) {
			usbpipe_disable();
		}

		if (altsetting != ALTSETTING_FLASH && new_altsetting == ALTSETTING_FLASH) {
			bridge_disable();
		} else if (altsetting == ALTSETTING_FLASH && new_altsetting != ALTSETTING_FLASH) {
			bridge_init();
		}

		if (new_altsetting == ALTSETTING_FLASH){
			flash_init();
		} else if (new_altsetting == ALTSETTING_PIPE) {
			usbpipe_init();
		}

		altsetting = new_altsetting;
		return true;
	}
	return false;
}

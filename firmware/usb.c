#include "usb.h"
#include "firmware.h"

USB_ENDPOINTS(3);

__attribute__((__aligned__(4))) const USB_DeviceDescriptor device_descriptor = {
	.bLength = sizeof(USB_DeviceDescriptor),
	.bDescriptorType = USB_DTYPE_Device,

	.bcdUSB                 = 0x0200,
	.bDeviceClass           = USB_CSCP_VendorSpecificClass,
	.bDeviceSubClass        = USB_CSCP_NoDeviceSubclass,
	.bDeviceProtocol        = USB_CSCP_NoDeviceProtocol,

	.bMaxPacketSize0        = 64,
	.idVendor               = 0x9999,
	.idProduct              = 0xFFFF,
	.bcdDevice              = 0x0101,

	.iManufacturer          = 0x01,
	.iProduct               = 0x02,
	.iSerialNumber          = 0,

	.bNumConfigurations     = 1
};

typedef struct ConfigDesc {
	USB_ConfigurationDescriptor Config;
	USB_InterfaceDescriptor OffInterface;
	USB_InterfaceDescriptor FlashInterface;
	USB_EndpointDescriptor DataInEndpoint;
	USB_EndpointDescriptor DataOutEndpoint;

} ConfigDesc;

__attribute__((__aligned__(4))) const ConfigDesc configuration_descriptor = {
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
		.bAlternateSetting = 1,
		.bNumEndpoints = 2,
		.bInterfaceClass = USB_CSCP_VendorSpecificClass,
		.bInterfaceSubClass = 0x00,
		.bInterfaceProtocol = 0x00,
		.iInterface = 0,
	},
	.DataInEndpoint = {
		.bLength = sizeof(USB_EndpointDescriptor),
		.bDescriptorType = USB_DTYPE_Endpoint,
		.bEndpointAddress = USB_EP_FLASH_IN,
		.bmAttributes = (USB_EP_TYPE_BULK | ENDPOINT_ATTR_NO_SYNC | ENDPOINT_USAGE_DATA),
		.wMaxPacketSize = 512,
		.bInterval = 0x00
	},
	.DataOutEndpoint = {
		.bLength = sizeof(USB_EndpointDescriptor),
		.bDescriptorType = USB_DTYPE_Endpoint,
		.bEndpointAddress = USB_EP_FLASH_OUT,
		.bmAttributes = (USB_EP_TYPE_BULK | ENDPOINT_ATTR_NO_SYNC | ENDPOINT_USAGE_DATA),
		.wMaxPacketSize = 512,
		.bInterval = 0x00
	},
};

__attribute__((__aligned__(4))) const USB_StringDescriptor language_string = {
	.bLength = USB_STRING_LEN(1),
	.bDescriptorType = USB_DTYPE_String,
	.bString = {USB_LANGUAGE_EN_US},
};

__attribute__((__aligned__(4))) const USB_StringDescriptor manufacturer_string = {
	.bLength = USB_STRING_LEN(17),
	.bDescriptorType = USB_DTYPE_String,
	.bString = u"Technical Machine"
};

__attribute__((__aligned__(4))) const USB_StringDescriptor product_string = {
	.bLength = USB_STRING_LEN(14),
	.bDescriptorType = USB_DTYPE_String,
	.bString = u"Tessel V2"
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
					address = &manufacturer_string;
					break;
				case 0x02:
					address = &product_string;
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
		//flash_init();
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
	Pin pin;
	switch (wIndex) {
		case REQ_PWR_RST:
			pin = PIN_SOC_RST;
			break;
		case REQ_PWR_SOC:
			pin = PIN_SOC_PWR;
			break;
		case REQ_PWR_PORT_A:
			pin = PIN_PORT_A_PWR;
			break;
		case REQ_PWR_PORT_B:
			pin = PIN_PORT_B_PWR;
			break;
		case REQ_PWR_LED:
			pin = PIN_LED;
			break;
		default:
			return usb_ep0_stall();
	}

	if (wValue == 0) {
		pin_low(pin);
	} else if (wValue == 1) {
		pin_high(pin);
	} else {
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
	if (usb_ep_pending(USB_EP_FLASH_OUT)) {
		flash_usb_out_completion();
		usb_ep_handled(USB_EP_FLASH_OUT);
	}

	if (usb_ep_pending(USB_EP_FLASH_IN)) {
		flash_usb_in_completion();
		usb_ep_handled(USB_EP_FLASH_IN);
	}
}

bool usb_cb_set_interface(uint16_t interface, uint16_t altsetting) {
	if (interface == 0) {
		if (altsetting == 0) {
			flash_disable();
			bridge_init();
			return true;
		} else if (altsetting == 1){
			bridge_disable();
			flash_init();
			return true;
		}
	}
	return false;
}
